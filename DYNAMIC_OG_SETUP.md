# Dynamic OG Setup Notes (Arufkuy Store)

## Tujuan
Membuat Open Graph (OG) untuk halaman detail produk menjadi dinamis berdasarkan data produk (Firestore), terutama agar preview Discord/WhatsApp/Facebook mengikuti produk yang dishare.

## File yang Diubah
1. worker.js
2. detail-product.html
3. index.html (sudah dikembalikan ke format link default)

## Perubahan Utama

### 1) worker.js
Ditambahkan handler server-side OG dinamis yang:
- membaca slug/id dari URL detail produk
- query produk dari collection `products` di Firestore
- membuat HTML dengan meta tag dinamis (`og:title`, `og:description`, `og:image`, `og:url`, twitter tags)

Ditambahkan logic route:
- `/og/detail-product`
- `/og/product`
- `/detail-product`
- `/detail-product.html`

Untuk path detail produk:
- jika request dari bot preview (Discordbot/WhatsApp/Facebook/Twitter/Telegram/Slack/LinkedIn), Worker kirim HTML OG dinamis
- jika request user biasa, Worker mem-proxy ke frontend origin (Cloudflare Pages) agar halaman normal tetap tampil

Ditambahkan helper env:
- `FRONTEND_BASE_URL` -> URL publik share
- `FRONTEND_ORIGIN_URL` -> URL origin frontend yang diproxy untuk user biasa

### 2) detail-product.html
- Ditambahkan fallback meta OG/Twitter default di `<head>`
- Ditambahkan updater meta dinamis client-side setelah data produk ter-load
- Parsing raw slug query diperbaiki dengan `decodeURIComponent`

Catatan: client-side dynamic meta tidak cukup untuk bot preview. Bot butuh server-side HTML.

### 3) index.html
- Sempat diubah ke `/p/slug`, lalu dikembalikan ke format default:
  - `detail-product.html?{slug}`
  - fallback `detail-product.html?id={id}`

## Konfigurasi Cloudflare yang Harus Aktif

### Worker Route
Set route Worker di Cloudflare Dashboard:
- `store.arufkuy.me/detail-product*`

Ini menangkap:
- `/detail-product?...`
- `/detail-product.html?...`

### Worker Variables (Production)
Type semua: Text

- `FRONTEND_BASE_URL=https://store.arufkuy.me`
- `FRONTEND_ORIGIN_URL=https://arufkuy-store.pages.dev`

Penting:
- `FRONTEND_ORIGIN_URL` wajib beda host dengan host request (`store.arufkuy.me`), kalau sama akan memicu error loop:
  - `Server config error: FRONTEND_ORIGIN_URL must be a different host than current request host.`

## Alur Request Setelah Setup Benar
1. User/bot akses: `https://store.arufkuy.me/detail-product?canva-pro`
2. Worker route menangkap request
3. Jika bot preview:
   - Worker render HTML OG dinamis berdasarkan produk `canva-pro`
4. Jika browser user biasa:
   - Worker proxy ke `https://arufkuy-store.pages.dev/detail-product.html?canva-pro`

## Checklist Deploy
1. Deploy `worker.js` terbaru
2. Pastikan route Worker `store.arufkuy.me/detail-product*` aktif
3. Set env production sesuai di atas
4. Save + Deploy Worker
5. Test direct URL di browser
6. Test preview bot dengan query baru (cache bust), contoh:
   - `https://store.arufkuy.me/detail-product?canva-pro&v=3`

## Troubleshooting Cepat
- Preview masih default:
  - cek route Worker belum match path final (`/detail-product`)
  - cek worker belum redeploy
  - cek env var belum production
  - cek cache embed Discord/WA (pakai query `&v=timestamp`)

- Muncul error FRONTEND_ORIGIN_URL must be different host:
  - nilai `FRONTEND_ORIGIN_URL` salah (sama dengan `store.arufkuy.me`) atau belum kebaca
  - set ke `https://arufkuy-store.pages.dev` lalu redeploy

## Catatan
Jika nanti ingin route clean lain (`/p/slug`), cukup tambah matcher route dan mapping di Worker dengan pola serupa.
