export const METHOD_LABELS: Record<string, string> = {
  havale:       'Havale / EFT',
  hizli_havale: 'Hızlı Havale',
  kripto:       'Kripto',
  kredi:        'Kredi Kartı',
  kredi_karti:  'Kredi Kartı',
}
export const methodLabel = (m: string) => METHOD_LABELS[m] ?? m
export const money = (v: string | number) =>
  Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
