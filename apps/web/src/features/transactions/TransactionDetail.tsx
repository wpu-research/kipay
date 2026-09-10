'use client'
import { useState } from 'react'
import { Copy, Check, MessageSquare, ArrowLeftRight, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePaymentAccounts } from '@/features/payment-accounts/use-payment-accounts'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClaimButton } from './ClaimButton'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  useTransactionDetail,
  useApproveTransaction,
  useRejectTransaction,
  useFlagTransaction,
  useResolveTransaction,
  useAddComment,
  useCallbackLogs,
  useRetryCallback,
  useApproveTransactionWithAmount,
  useReviseTransaction,
  useTransferTransaction,
} from './use-transaction-detail'

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'PENDING':    return 'secondary'
    case 'PROCESSING': return 'default'
    case 'APPROVED':
    case 'COMPLETED':  return 'default'
    case 'REJECTED':   return 'destructive'
    case 'FLAGGED':    return 'outline'
    default:           return 'outline'
  }
}

interface Props {
  transactionId: string
  currentUserId: string
  userRole:      string
}

const CAN_CLAIM_ROLES = ['finans_operator', 'finans_admin', 'tenant_admin']

function fmtDateTime(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString('tr-TR') : '—'
}

function maskIdentity(v: string | null, full: boolean) {
  if (!v) return '—'
  if (full || v.length < 6) return v
  return `${v.slice(0, 3)}${'*'.repeat(v.length - 5)}${v.slice(-2)}`
}

function Row({ label, value, mono, wide }: { label: string; value: React.ReactNode; mono?: boolean; wide?: boolean }) {
  return (
    <>
      <dt className={`text-muted-foreground ${wide ? 'col-span-2' : ''}`}>{label}</dt>
      <dd className={`${mono ? 'font-mono text-xs break-all' : ''} ${wide ? 'col-span-2' : ''}`}>{value ?? '—'}</dd>
    </>
  )
}

export function TransactionDetail({ transactionId, currentUserId, userRole }: Props) {
  const [copied, setCopied] = useState(false)
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState<'approve' | 'reject' | 'flag' | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [commentContent, setCommentContent] = useState('')
  const [resolveDecision, setResolveDecision] = useState<'approved' | 'rejected'>('approved')
  const [resolveReason, setResolveReason] = useState('')

  const { data, isLoading, error } = useTransactionDetail(transactionId)
  const approve            = useApproveTransaction()
  const reject             = useRejectTransaction()
  const flag               = useFlagTransaction()
  const resolve            = useResolveTransaction()
  const addComment         = useAddComment()
  const callbackLogs       = useCallbackLogs(transactionId)
  const retryCallback      = useRetryCallback(transactionId)
  const approveWithAmount  = useApproveTransactionWithAmount()
  const revise             = useReviseTransaction()
  const transfer           = useTransferTransaction()
  const [adjustedAmount, setAdjustedAmount] = useState('')
  const [showAmountForm, setShowAmountForm] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferAccountId, setTransferAccountId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [confirmRevise, setConfirmRevise] = useState(false)
  const router = useRouter()
  const isAdminRole = userRole === 'finans_admin' || userRole === 'tenant_admin'
  // Transfer için hedef hesaplar (yalnızca gerektiğinde çekilir)
  const { data: accountsData } = usePaymentAccounts({ status: 'active', type: 'bank' }, 1, 100)
  const transferAccounts = (accountsData?.data ?? [])

  if (isLoading) return <p className="text-sm text-muted-foreground">Yükleniyor...</p>
  if (error)     return <p className="text-sm text-destructive">İşlem yüklenemedi.</p>
  if (!data)     return null

  const tx = data.data

  const isAdmin = userRole === 'finans_admin' || userRole === 'tenant_admin'
  const canRetryCallback = ['tenant_admin', 'super_admin'].includes(userRole) && (tx.callbackStatus === 'failed' || tx.callbackStatus === 'dead')
  const canApproveReject = tx.status === 'PROCESSING' && (isAdmin || tx.claimedBy === currentUserId) && ['finans_operator', 'finans_admin', 'tenant_admin'].includes(userRole)
  const playerConfirmed  = (tx as any).playerConfirmed === true
  const canFlag          = tx.status === 'PROCESSING' && ['finans_operator', 'finans_admin', 'tenant_admin'].includes(userRole)
  const canResolve       = tx.status === 'FLAGGED' && ['tenant_admin', 'super_admin'].includes(userRole)
  const canComment       = ['finans_operator', 'finans_admin', 'tenant_admin', 'merchant', 'super_admin'].includes(userRole)
  const isDeposit        = tx.type === 'deposit'
  // Redli / zaman aşımı yatırımı onaya çevirme — admin, 1 saat penceresi (API doğrular)
  const canRevise        = isDeposit && isAdminRole && (tx.status === 'REJECTED' || tx.status === 'TIMEOUT')
  // Farklı tedarik firmasına transfer — admin, PENDING/PROCESSING yatırım
  const canTransfer      = isDeposit && isAdminRole && (tx.status === 'PENDING' || tx.status === 'PROCESSING')
  const currentProviderId = tx.paymentAccount?.provider?.id ?? null
  const transferTargets  = transferAccounts.filter((a) => a.id !== tx.paymentAccount?.id && (!currentProviderId || a.providerId !== currentProviderId))
  const fullName         = [tx.userInfo?.firstName, tx.userInfo?.middleName, tx.userInfo?.lastName].filter(Boolean).join(' ')

  async function handleRevise() {
    try {
      await revise.mutateAsync(transactionId)
      toast.success('İşlem onaya çevrildi (düzeltilmiş)')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revizyon başarısız')
    } finally {
      setConfirmRevise(false)
    }
  }

  async function handleTransfer() {
    if (!transferAccountId) return
    try {
      await transfer.mutateAsync({ id: transactionId, paymentAccountId: transferAccountId, reason: transferReason || undefined })
      toast.success('Talep yeni tedarik firmasına aktarıldı')
      setShowTransfer(false)
      setTransferAccountId('')
      setTransferReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transfer başarısız')
    }
  }

  async function handleApprove() {
    await approve.mutateAsync(transactionId)
  }

  async function handleReject() {
    if (!rejectReason.trim()) return
    await reject.mutateAsync({ id: transactionId, reason: rejectReason })
    setRejectReason('')
    setShowRejectForm(false)
  }

  async function handleFlag() {
    await flag.mutateAsync(transactionId)
  }

  async function handleResolve() {
    if (!resolveReason.trim()) return
    await resolve.mutateAsync({ id: transactionId, decision: resolveDecision, reason: resolveReason })
    setResolveReason('')
  }

  async function handleAddComment() {
    if (!commentContent.trim()) return
    await addComment.mutateAsync({ id: transactionId, content: commentContent })
    setCommentContent('')
  }

  return (
    <div className="space-y-6">
      {/* Oyuncu ödeme yaptı sinyali */}
      {playerConfirmed && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 flex items-center gap-2">
          <span className="text-green-400 text-xs font-semibold">✓ Oyuncu ödemeyi gönderdi — kontrol et</span>
          {(tx as any).playerConfirmedAt && (
            <span className="text-xs text-muted-foreground ml-auto">
              {new Date((tx as any).playerConfirmedAt).toLocaleTimeString('tr-TR')}
            </span>
          )}
        </div>
      )}

      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Badge variant={statusBadgeVariant(tx.status)}>{tx.status}</Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-1 text-xs font-mono text-muted-foreground gap-1"
          onClick={() => {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(tx.id)
            } else {
              const el = document.createElement('textarea')
              el.value = tx.id
              document.body.appendChild(el)
              el.select()
              document.execCommand('copy')
              document.body.removeChild(el)
            }
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          <span>{tx.id.slice(0, 8)}…</span>
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
        {['tenant_admin', 'finans_admin', 'finans_operator'].includes(userRole) && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" title="Bu işlem için ekip sohbeti" onClick={() => router.push(`/chat?tx=${tx.id}`)}>
            <MessageSquare className="size-3" /> Sohbet
          </Button>
        )}
        {CAN_CLAIM_ROLES.includes(userRole) && (
          <ClaimButton
            transactionId={tx.id}
            status={tx.status}
            claimExpiresAt={tx.claimExpiresAt}
            claimedBy={tx.claimedBy}
            currentUserId={currentUserId}
            onSuccess={() => qc.invalidateQueries({ queryKey: ['transaction', transactionId] })}
          />
        )}
      </div>

      {/* Aksiyon Butonları */}
      {(canApproveReject || canFlag) && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {confirm === null && (
              <>
                {canApproveReject && (
                  <>
                    <Button size="sm" onClick={() => setConfirm('approve')} disabled={approve.isPending}>
                      Onayla
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { setConfirm('reject'); setShowRejectForm(false) }}>
                      Reddet
                    </Button>
                  </>
                )}
                {canFlag && (
                  <Button size="sm" variant="outline" onClick={() => setConfirm('flag')} disabled={flag.isPending}>
                    Şüpheli
                  </Button>
                )}
                {canApproveReject && (
                  <Button size="sm" variant="outline" onClick={() => setShowAmountForm((v) => !v)}>
                    Farklı Tutarla Onayla
                  </Button>
                )}
              </>
            )}
            {confirm === 'approve' && (
              <>
                <Button size="sm" onClick={() => { setConfirm(null); handleApprove() }} disabled={approve.isPending}>
                  Evet, onayla
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  İptal
                </Button>
              </>
            )}
            {confirm === 'reject' && (
              <>
                <Button size="sm" variant="destructive" onClick={() => { setConfirm(null); setShowRejectForm(true) }}>
                  Evet, reddet
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  İptal
                </Button>
              </>
            )}
            {confirm === 'flag' && (
              <>
                <Button size="sm" variant="outline" onClick={() => { setConfirm(null); handleFlag() }} disabled={flag.isPending}>
                  Evet, şüpheli
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  İptal
                </Button>
              </>
            )}
          </div>

          {showAmountForm && (
            <div className="space-y-2 border rounded-md p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Orijinal tutar: <strong>{tx.amount} {tx.currency}</strong></p>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  className="flex-1 h-8 rounded border bg-background px-2 text-xs font-mono"
                  placeholder="Düzeltilmiş tutar (örn: 4800.00)"
                  value={adjustedAmount}
                  onChange={(e) => setAdjustedAmount(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={approveWithAmount.isPending || !adjustedAmount}
                  onClick={async () => {
                    await approveWithAmount.mutateAsync({ id: transactionId, adjustedAmount })
                    setShowAmountForm(false)
                    setAdjustedAmount('')
                  }}
                >
                  {approveWithAmount.isPending ? 'Onaylanıyor...' : 'Onayla'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAmountForm(false); setAdjustedAmount('') }}>
                  İptal
                </Button>
              </div>
            </div>
          )}

          {showRejectForm && (
            <div className="space-y-2">
              <Textarea
                rows={3}
                placeholder="Red nedeni zorunludur..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReject}
                  disabled={reject.isPending || !rejectReason.trim()}
                >
                  {reject.isPending ? 'Reddediliyor...' : 'Reddet'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowRejectForm(false); setRejectReason('') }}
                >
                  İptal
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Revizyon: redli / zaman aşımı yatırımı onaya çevir */}
      {canRevise && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Bu yatırım <strong>{tx.status === 'REJECTED' ? 'reddedilmiş' : 'zaman aşımına uğramış'}</strong>. Sonuçlanmadan itibaren 1 saat içinde onaya çevrilebilir; site yeniden callback alır.
          </p>
          {!confirmRevise ? (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setConfirmRevise(true)} disabled={revise.isPending}>
              <RotateCcw className="size-3" /> Onaya Çevir
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleRevise} disabled={revise.isPending}>
                {revise.isPending ? 'Çevriliyor...' : 'Evet, onaya çevir'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRevise(false)}>İptal</Button>
            </div>
          )}
        </div>
      )}

      {/* Transfer: farklı tedarik firmasına aktar */}
      {canTransfer && (
        <div className="space-y-2">
          {!showTransfer ? (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowTransfer(true)}>
              <ArrowLeftRight className="size-3" /> Tedarik Firmasına Transfer
            </Button>
          ) : (
            <div className="rounded-md border p-3 bg-muted/30 space-y-2">
              <p className="text-xs text-muted-foreground">
                Mevcut: <strong>{tx.paymentAccount ? `${tx.paymentAccount.provider?.name ?? 'Tedarikçisiz'} / ${tx.paymentAccount.name}` : 'Hesap atanmamış'}</strong>.
                Yeni hesap seçildiğinde eski hesap bağlantısı kaldırılır{tx.status === 'PROCESSING' ? ' ve site yeni hesap bilgisini alır' : ''}.
              </p>
              <Select value={transferAccountId || '_none'} onValueChange={(v) => setTransferAccountId(v === '_none' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Hedef hesap seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Hedef hesap seçin</SelectItem>
                  {transferTargets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {(a.provider?.name ?? 'Tedarikçisiz')} / {a.name} — {a.bank?.name ?? a.accountNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transferTargets.length === 0 && (
                <p className="text-xs text-destructive">Farklı tedarik firmasına ait aktif hesap bulunamadı.</p>
              )}
              <input
                className="w-full h-8 rounded border bg-background px-2 text-xs"
                placeholder="Neden (isteğe bağlı)"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleTransfer} disabled={transfer.isPending || !transferAccountId}>
                  {transfer.isPending ? 'Aktarılıyor...' : 'Transfer Et'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowTransfer(false); setTransferAccountId(''); setTransferReason('') }}>İptal</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* İşlem Detayı */}
      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row label="İşlem ID" value={tx.id} mono wide />
            <Row label="Tip" value={isDeposit ? 'Yatırım' : 'Çekim'} />
            <Row label="Tutar" value={`${tx.amount} ${tx.currency}`} />
            <Row label="Site" value={tx.merchantName ?? '—'} />
            <Row label="Kullanıcı Adı" value={tx.externalUserId} />
            <Row label="Ad Soyad" value={fullName || '—'} />
            <Row label="Talep Geliş" value={fmtDateTime(tx.createdAt)} />
            <Row label="Sonuçlanma" value={fmtDateTime(tx.resolvedAt)} />
            {tx.revised && (
              <Row label="Düzeltme" value={`Evet (önceki: ${tx.previousStatus ?? '—'})`} />
            )}
            {tx.note && <Row label="Not" value={<span className="whitespace-pre-wrap">{tx.note}</span>} wide />}
          </dl>

          {/* Hesap bilgileri: yatırımda alıcı = bizim hesap, çekimde alıcı = üye, gönderen = bizim hesap */}
          <div className="mt-4 border-t pt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              {isDeposit ? 'Alıcı Hesap (bizim hesap)' : 'Alıcı (üye hesabı)'}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {isDeposit ? (
                tx.paymentAccount ? (
                  <>
                    <Row label="Tedarik Firması" value={tx.paymentAccount.provider?.name ?? '—'} />
                    <Row label="Hesap Adı" value={tx.paymentAccount.name} />
                    {tx.paymentAccount.type === 'bank' ? (
                      <>
                        <Row label="Banka" value={tx.paymentAccount.bank?.name ?? '—'} />
                        <Row label="IBAN" value={tx.paymentAccount.accountNumber} mono wide />
                      </>
                    ) : (
                      <>
                        <Row label="Kripto" value={tx.paymentAccount.cryptos.length > 0 ? tx.paymentAccount.cryptos.map((c) => `${c.crypto.name} (${c.crypto.symbol})`).join(', ') : '—'} />
                        <Row label="Cüzdan Adresi" value={tx.paymentAccount.accountNumber} mono wide />
                      </>
                    )}
                  </>
                ) : (
                  <dd className="col-span-2 text-xs text-muted-foreground">Henüz hesap atanmadı (claim anında atanır).</dd>
                )
              ) : (
                <>
                  <Row label="Hesap Sahibi" value={tx.withdrawalAccountName ?? '—'} />
                  <Row label="Banka" value={tx.withdrawalBankName ?? '—'} />
                  <Row label={tx.paymentMethod?.toUpperCase() === 'IBAN' ? 'IBAN' : 'Hesap No / Adres'} value={tx.withdrawalAddress ?? '—'} mono wide />
                  <Row label="Yöntem" value={tx.paymentMethod ?? '—'} />
                </>
              )}
            </dl>

            {!isDeposit && (
              <>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-4 mb-2">Gönderen Hesap (bizim hesap)</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {tx.paymentAccount ? (
                    <>
                      <Row label="Tedarik Firması" value={tx.paymentAccount.provider?.name ?? '—'} />
                      <Row label="Hesap Adı" value={tx.paymentAccount.name} />
                      <Row label="Banka" value={tx.paymentAccount.bank?.name ?? '—'} />
                      <Row label="IBAN" value={tx.paymentAccount.accountNumber} mono wide />
                    </>
                  ) : (
                    <dd className="col-span-2 text-xs text-muted-foreground">Gönderen hesap kaydı yok.</dd>
                  )}
                </dl>
              </>
            )}
          </div>

          {/* Altyapıdan gelen üye bilgileri */}
          <div className="mt-4 border-t pt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Üye Bilgileri (altyapı)</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row label="Üye No" value={tx.userInfo?.memberId ?? '—'} />
              <Row label="TC / Kimlik No" value={maskIdentity(tx.userInfo?.identityNumber ?? null, isAdminRole)} mono />
              <Row label="Ad" value={tx.userInfo?.firstName ?? '—'} />
              <Row label="İkinci Ad" value={tx.userInfo?.middleName || '—'} />
              <Row label="Soyad" value={tx.userInfo?.lastName ?? '—'} />
              <Row label="Telefon" value={tx.userInfo?.phone ?? '—'} mono />
            </dl>
          </div>
        </CardContent>
      </Card>

      {/* FLAGGED Karar Formu — firma / super_admin */}
      {canResolve && (
        <Card>
          <CardHeader>
            <CardTitle>Şüpheli İşlem Kararı</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  value="approved"
                  checked={resolveDecision === 'approved'}
                  onChange={() => setResolveDecision('approved')}
                />
                Onayla (COMPLETED)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  value="rejected"
                  checked={resolveDecision === 'rejected'}
                  onChange={() => setResolveDecision('rejected')}
                />
                Reddet (REJECTED)
              </label>
            </div>
            <Textarea
              rows={3}
              placeholder="Karar açıklaması zorunludur..."
              value={resolveReason}
              onChange={(e) => setResolveReason(e.target.value)}
            />
            <Button
              variant={resolveDecision === 'approved' ? 'default' : 'destructive'}
              onClick={handleResolve}
              disabled={resolve.isPending || !resolveReason.trim()}
            >
              {resolve.isPending ? 'İşleniyor...' : resolveDecision === 'approved' ? 'Onayla' : 'Reddet'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Callback Geçmişi */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Callback Geçmişi</CardTitle>
            <div className="flex items-center gap-2">
              {tx.callbackStatus && (
                <span className="text-xs text-muted-foreground">
                  Durum: <span className="font-medium">{tx.callbackStatus}</span>
                </span>
              )}
              {['tenant_admin', 'super_admin'].includes(userRole) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => retryCallback.mutate()}
                  disabled={retryCallback.isPending || !canRetryCallback}
                  title={!canRetryCallback ? `Retry yalnızca 'failed' veya 'dead' durumunda mümkün (mevcut: ${tx.callbackStatus ?? 'none'})` : undefined}
                >
                  {retryCallback.isPending ? 'Kuyruğa Alınıyor...' : 'Callback Yenile'}
                </Button>
              )}
            </div>
          </div>
          {retryCallback.isError && (
            <p className="text-xs text-destructive mt-1">
              {(retryCallback.error as any)?.message ?? 'Callback yenilenemedi'}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {callbackLogs.isLoading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : callbackLogs.isError ? (
            <p className="text-sm text-destructive">Callback geçmişi yüklenemedi.</p>
          ) : !callbackLogs.data?.data?.length ? (
            <p className="text-sm text-muted-foreground">Henüz callback denemesi yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">#</th>
                    <th className="pb-2 pr-4">Gönderim Tarihi</th>
                    <th className="pb-2 pr-4">HTTP Durum</th>
                    <th className="pb-2">Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  {callbackLogs.data.data.map((log) => (
                    <tr key={log.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">{log.attemptNumber}</td>
                      <td className="py-2 pr-4">{new Date(log.sentAt).toLocaleString('tr-TR')}</td>
                      <td className="py-2 pr-4">{log.responseStatus ?? '—'}</td>
                      <td className="py-2">{log.success ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Yorumlar */}
      <Card>
        <CardHeader>
          <CardTitle>Yorumlar ({tx.comments.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tx.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz yorum yok.</p>
          ) : (
            <ul className="space-y-3">
              {tx.comments.map((c) => (
                <li key={c.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-xs uppercase text-muted-foreground">{c.userRole}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <p>{c.content}</p>
                </li>
              ))}
            </ul>
          )}

          {canComment && (
            <div className="space-y-2 border-t pt-4">
              <Textarea
                rows={3}
                placeholder="Yorum ekle..."
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
              />
              <Button
                size="sm"
                onClick={handleAddComment}
                disabled={addComment.isPending || !commentContent.trim()}
              >
                {addComment.isPending ? 'Gönderiliyor...' : 'Yorum Ekle'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
