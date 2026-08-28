'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiError } from '@/lib/api-client'
import { useBanks, useCreateBank, useUpdateBankStatus } from '@/features/banks/use-banks'

export default function BanksPage() {
  const { data, isLoading }  = useBanks()
  const createBank           = useCreateBank()
  const updateBankStatus     = useUpdateBankStatus()

  const banks = data?.data ?? []

  const [createOpen, setCreateOpen] = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [form, setForm]             = useState({ name: '', ibanCode: '' })

  useEffect(() => {
    if (!createOpen) {
      setForm({ name: '', ibanCode: '' })
      setFormError(null)
    }
  }, [createOpen])

  const ibanCodeValid = form.ibanCode === '' || /^\d{5}$/.test(form.ibanCode)
  const isFormValid   = form.name.trim().length >= 2 && ibanCodeValid

  async function handleCreate() {
    setFormError(null)
    try {
      await createBank.mutateAsync({
        name:     form.name.trim(),
        ibanCode: form.ibanCode.trim() || undefined,
      })
      setCreateOpen(false)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BANK_NAME_CONFLICT') {
        setFormError('Bu isimde bir banka zaten mevcut.')
      } else {
        setFormError('Bir hata oluştu.')
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bankalar</h1>
        <Button onClick={() => setCreateOpen(true)}>Banka Ekle</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Banka Adı</TableHead>
              <TableHead>IBAN Kodu</TableHead>
              <TableHead className="w-[100px]">Durum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  Yükleniyor...
                </TableCell>
              </TableRow>
            ) : banks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  Henüz banka eklenmemiş.
                </TableCell>
              </TableRow>
            ) : (
              banks.map((bank) => (
                <TableRow key={bank.id} className={!bank.isActive ? 'opacity-50' : ''}>
                  <TableCell className="font-medium">{bank.name}</TableCell>
                  <TableCell>
                    {bank.ibanCode ? (
                      <Badge variant="secondary" className="font-mono">{bank.ibanCode}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={bank.isActive}
                      onCheckedChange={(checked) =>
                        updateBankStatus.mutate({ id: bank.id, isActive: checked })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={(v) => !v && setCreateOpen(false)}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Yeni Banka</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Banka Adı *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Örn: Akbank"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
                IBAN Banka Kodu
                <span className="ml-1 text-xs text-muted-foreground">(5 haneli)</span>
              </label>
              <Input
                value={form.ibanCode}
                onChange={(e) => setForm((f) => ({ ...f, ibanCode: e.target.value }))}
                placeholder="00046"
                maxLength={5}
                className={!ibanCodeValid ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {!ibanCodeValid && (
                <p className="text-xs text-destructive">5 haneli rakam olmalıdır.</p>
              )}
            </div>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createBank.isPending}>
              İptal
            </Button>
            <Button onClick={handleCreate} disabled={createBank.isPending || !isFormValid}>
              {createBank.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
