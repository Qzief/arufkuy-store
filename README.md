# Arufkuy Store

Website statis untuk penjualan produk digital (Digital Goods) dengan integrasi pembayaran via Mayar Payment Gateway dan manajemen stok berbasis Firebase.

## Fitur
- **Katalog Produk**: Menampilkan produk dari Firestore.
- **Detail Produk**: Halaman detail dengan form pembelian.
- **Pembayaran Mayar**: Integrasi dengan Mayar Payment Gateway (e-wallet, bank transfer, dll) via Cloudflare Worker.
- **Manajemen Stok**: Sistem stok otomatis (satu item per baris) yang berkurang saat transaksi sukses (logic di Worker perlu diaktifkan).
- **Admin Panel**: Dashboard untuk menambah, mengedit, dan menghapus produk serta stok.

## Setup Project

### 1. Konfigurasi Firebase
1. Buat project baru di [Firebase Console](https://console.firebase.google.com/).
2. Aktifkan **Authentication** (Email/Password).
3. Aktifkan **Firestore Database**.
4. Salin konfigurasi Firebase (API Key, Project ID, dll) dan tempelkan ke variabel `firebaseConfig` di file:
   - `index.html`
   - `detail-product.html`
   - `admin.html`

### 2. Deploy Cloudflare Worker
1. Install Wrangler (CLI Cloudflare) atau copy isi `worker.js` ke dashboard Cloudflare Workers.
2. Set Environment Variables di Cloudflare Worker:
   - `MAYAR_API_KEY`: API Key dari [Mayar Dashboard](https://web.mayar.id/api-keys).
   - `MAYAR_BASE_URL`: 
     - Production: `https://api.mayar.id/hl/v1`
     - Sandbox: `https://api.mayar.club/hl/v1`
3. Update URL Worker di `detail-product.html` (variabel `workerUrl`).

### 3. Mendaftarkan Admin
Agar bisa mengakses halaman `admin.html` dan mengelola produk, Anda perlu mendaftarkan user sebagai admin secara manual di Firestore.

**Langkah-langkah:**
1. Buka **Firebase Console** -> **Authentication**.
2. Tambahkan pengguna baru (Add User) dengan email dan password (misal: `admin@arufkuy.me`).
3. Salin **User UID** dari pengguna yang baru dibuat.
4. Buka **Firestore Database**.
5. Buat collection baru bernama `admins` (jika belum ada).
6. Tambahkan dokumen baru ke dalam collection `admins`:
   - **Document ID**: Tempelkan **User UID** yang tadi disalin.
   - **Field**: (Opsional) `role`: `superadmin`.
7. Selesai. Sekarang user tersebut bisa login di `admin.html` dan memiliki akses tulis (write) sesuai `firebase.rule`.

## Struktur File
- `index.html`: Halaman utama katalog.
- `detail-product.html`: Halaman detail & checkout.
- `admin.html`: Dashboard admin (CMS).
- `worker.js`: Backend serverless untuk handling pembayaran aman.
- `firebase.rule`: Aturan keamanan Firestore.
