'use client'
import { use } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TransactionDetail } from '@/features/transactions/TransactionDetail'
import { useMe } from '@/features/auth/use-me'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function TransactionDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const { data: me } = useMe()
  const userId   = me?.user.id   ?? ''
  const userRole = me?.user.role ?? ''

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/transactions">← Geri</Link>
        </Button>
        <h1 className="text-2xl font-bold">İşlem Detayı</h1>
      </div>

      <TransactionDetail
        transactionId={id}
        currentUserId={userId}
        userRole={userRole}
      />
    </div>
  )
}
