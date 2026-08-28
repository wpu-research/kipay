'use client'
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
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
  const [adjustedAmount, setAdjustedAmount] = useState('')
  const [showAmountForm, setShowAmountForm] = useState(false)

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

      {/* İşlem Detayı */}
      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dd className="col-span-2 text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString('tr-TR')}</dd>
            <dt className="text-muted-foreground">Tutar</dt>
            <dd>{tx.amount} {tx.currency}</dd>
            <dt className="text-muted-foreground">Site</dt>
            <dd>{tx.merchantName ?? '—'}</dd>
            <dt className="text-muted-foreground">Dış Kullanıcı</dt>
            <dd>{tx.externalUserId}</dd>
            {tx.resolvedAt && (
              <>
                <dt className="text-muted-foreground">Çözüm Tarihi</dt>
                <dd>{new Date(tx.resolvedAt).toLocaleString('tr-TR')}</dd>
              </>
            )}
            {tx.note && (
              <>
                <dt className="text-muted-foreground">Not</dt>
                <dd>{tx.note}</dd>
              </>
            )}
            {tx.paymentAccount && (
              <>
                <dt className="text-muted-foreground">Hesap Adı</dt>
                <dd>{tx.paymentAccount.name}</dd>
              </>
            )}
            {!tx.paymentAccount && (tx.withdrawalBankName || tx.withdrawalAccountName) && (
              <>
                {tx.withdrawalBankName && (
                  <>
                    <dt className="text-muted-foreground">Banka</dt>
                    <dd>{tx.withdrawalBankName}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Hesap Adı</dt>
                <dd>{tx.withdrawalAccountName ?? '—'}</dd>
                {tx.withdrawalAddress && (
                  <>
                    <dt className="text-muted-foreground col-span-2">Hesap No (IBAN)</dt>
                    <dd className="font-mono text-xs break-all col-span-2">{tx.withdrawalAddress}</dd>
                  </>
                )}
              </>
            )}
            {tx.paymentAccount && tx.paymentAccount.type === 'bank' && (
              <>
                <dt className="text-muted-foreground">Banka</dt>
                <dd>{tx.paymentAccount.bank?.name ?? tx.paymentAccount.name}</dd>
                <dt className="text-muted-foreground col-span-2">Hesap No (IBAN)</dt>
                <dd className="font-mono text-xs break-all col-span-2">{tx.paymentAccount.accountNumber}</dd>
              </>
            )}
            {tx.paymentAccount && tx.paymentAccount.type === 'crypto' && (
              <>
                <dt className="text-muted-foreground">Kripto</dt>
                <dd>
                  {tx.paymentAccount.cryptos.length > 0
                    ? tx.paymentAccount.cryptos.map((c) => `${c.crypto.name} (${c.crypto.symbol})`).join(', ')
                    : tx.paymentAccount.name}
                </dd>
                <dt className="text-muted-foreground col-span-2">Cüzdan Adresi</dt>
                <dd className="font-mono text-xs break-all col-span-2">{tx.paymentAccount.accountNumber}</dd>
              </>
            )}
          </dl>
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
