/**
 * apps/web/public/odeme.html -> apps/web/src/app/odeme/odeme-html.ts
 *
 * Ödeme sayfası HTML'i route handler ile birlikte bundle'lanabilsin diye string modüle
 * gömülür; apps/web `output: 'standalone'` ile build edildiğinden public/ klasörü Railway
 * imajına girmiyor.
 *
 * Widget'ı düzenledikten sonra çalıştır:  node scripts/build-odeme-html.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src  = join(root, 'apps/web/public/odeme.html')
const dest = join(root, 'apps/web/src/app/odeme/odeme-html.ts')

const html = readFileSync(src, 'utf8')

const header = `/**
 * Ödeme sayfası HTML'i — gömülü string.
 *
 * Neden public/ değil: apps/web \`output: 'standalone'\` ile build ediliyor ve Railway
 * imajında public/ klasörü yer almıyor (deploy'da /odeme.html 404 döndü, route
 * handler'lar ise çalıştı). Bu yüzden HTML modüle gömülü — route ile birlikte
 * bundle'lanır, dosya sistemine bağımlı değil.
 *
 * Düzenlerken: bu dosya üretilmiştir, elle düzenleme. Kaynak widget'ı değiştirip
 * scripts/build-odeme-html.mjs ile yeniden üret.
 */
`

writeFileSync(dest, header + 'export const ODEME_HTML = ' + JSON.stringify(html) + '\n', 'utf8')
console.log(`✅ ${dest} güncellendi (${html.length} karakter HTML)`)
