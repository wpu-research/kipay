'use client'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useClaimTransaction } from './use-transactions'
import type { TransactionList } from '@panel/types'

type TxItem = TransactionList['data'][number]

function formatAmount(tx: TxItem): string {
  const isCrypto = tx.currency !== 'TRY' && tx.currency !== 'crypto'
  if (isCrypto && tx.amountTry && tx.exchangeRate) {
    const val = parseFloat(tx.amountTry) / parseFloat(tx.exchangeRate)
    return `${val.toFixed(8).replace(/\.?0+$/, '')} ${tx.currency}`
  }
  const cur = tx.currency === 'crypto' ? 'TRY' : tx.currency
  return `${parseFloat(tx.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${cur}`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    PENDING:    { label: 'Yeni',       variant: 'secondary' },
    PROCESSING: { label: 'İşlemde',   variant: 'default' },
    APPROVED:   { label: 'Onaylandı', variant: 'default' },
    COMPLETED:  { label: 'Tamamlandı',variant: 'default' },
    REJECTED:   { label: 'Reddedildi',variant: 'destructive' },
    FLAGGED:    { label: 'Şüpheli',   variant: 'outline' },
    TIMEOUT:    { label: 'Zaman Aşımı',variant: 'outline' },
    CANCELLED:  { label: 'İptal',     variant: 'outline' },
    STARTED:    { label: 'Başladı',   variant: 'outline' },
  }
  const cfg = map[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

function TypeBadge({ tx }: { tx: TxItem }) {
  const isCrypto = tx.currency !== 'TRY'
  const label = tx.type === 'deposit'
    ? (isCrypto ? 'Yatırım-kripto' : 'Yatırım-havale')
    : (isCrypto ? 'Çekim-kripto'   : 'Çekim-havale')
  const isDeposit = tx.type === 'deposit'
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono ${
      isDeposit
        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
        : 'bg-red-500/10 text-red-400 border border-red-500/20'
    }`}>
      {isDeposit ? '↑' : '↓'} {label}
    </span>
  )
}

const CAN_CLAIM_ROLES = ['finans_operator', 'finans_admin', 'tenant_admin']

interface Props {
  data:          TxItem[]
  currentUserId: string
  userRole:      string
  selectedId:    string | null
  onSelect:      (id: string) => void
}

export function TransactionTable({ data, currentUserId: _currentUserId, userRole, selectedId, onSelect }: Props) {
  const claim = useClaimTransaction()

  async function handleClaim(e: React.MouseEvent, txId: string) {
    e.stopPropagation()
    try {
      await claim.mutateAsync(txId)
      toast.success('İşlem alındı')
    } catch {
      toast.error('İşlem alınamadı')
    }
  }

  if (data.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        İşlem bulunamadı.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[800px]">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
            <th className="px-3 py-2">ID</th>
            <th className="px-3 py-2">TxID</th>
            <th className="px-3 py-2">Tip</th>
            <th className="px-3 py-2">Site</th>
            <th className="px-3 py-2">Kullanıcı</th>
            <th className="px-3 py-2">Banka/Hesap</th>
            <th className="px-3 py-2">Miktar</th>
            <th className="px-3 py-2">Durum</th>
            <th className="px-3 py-2">Tarih</th>
            <th className="px-3 py-2">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {data.map((tx) => {
            const isSelected = tx.id === selectedId
            const isPending = tx.status === 'PENDING'
            const canClaim = CAN_CLAIM_ROLES.includes(userRole) && isPending
            const shortId = tx.id.replace(/-/g, '').slice(0, 8)

            return (
              <tr
                key={tx.id}
                onClick={() => onSelect(tx.id)}
                className={`border-b cursor-pointer transition-colors last:border-0 ${
                  isSelected
                    ? 'bg-primary/10 border-l-2 border-l-primary'
                    : 'hover:bg-muted/40'
                }`}
              >
                <td className="px-3 py-2 font-mono text-muted-foreground">{shortId}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground max-w-[80px] truncate" title={tx.id}>
                  {tx.id.slice(0, 13)}…
                </td>
                <td className="px-3 py-2">
                  <TypeBadge tx={tx} />
                </td>
                <td className="px-3 py-2">
                  {tx.merchantName ? (
                    <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {tx.merchantName}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2 font-medium text-foreground max-w-[120px] truncate">
                  {tx.externalUserId || '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground max-w-[100px] truncate">
                  {tx.paymentAccountName ?? '—'}
                </td>
                <td className="px-3 py-2 font-bold font-mono text-foreground whitespace-nowrap">
                  {formatAmount(tx)}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={tx.status} />
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {new Date(tx.createdAt).toLocaleString('tr-TR', {
                    day: '2-digit', month: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {canClaim && (
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        disabled={claim.isPending}
                        onClick={(e) => handleClaim(e, tx.id)}
                      >
                        Al
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => onSelect(tx.id)}
                    >
                      →
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
