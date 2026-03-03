# Arufkuy Store

Website statis untuk penjualan produk digital (Digital Goods) dengan integrasi pembayaran via Mayar Payment Gateway dan manajemen stok berbasis Firebase.

## Fitur

- **Katalog Produk**: Menampilkan produk dari Firestore dengan live search dan filter kategori.
- **Detail Produk**: Halaman detail dengan form pembelian, sistem varian (bracket syntax `[...]` & pipe syntax `Label|Value`), dan validasi stok real-time.
- **Preview Invoice**: Halaman konfirmasi pesanan (`detail-invoice.html`) sebelum pembayaran — menampilkan ringkasan produk, data pembeli, subtotal, biaya layanan, dan diskon kupon.
- **Pembayaran Mayar**: Integrasi dengan Mayar Payment Gateway (e-wallet, bank transfer, dll) via Cloudflare Worker.
- **Detail Order**: Halaman tracking pesanan (`detail-order.html`) dengan sistem akses Master Key + Time Window (6 jam).
- **Manajemen Stok**: Sistem stok otomatis (satu item per baris) — stok terpotong saat transaksi sukses dan dikirim otomatis ke email pelanggan.
- **Admin Panel**: Dashboard lengkap untuk CRUD produk, kelola stok, monitoring pesanan, konfigurasi biaya layanan, dan manajemen kupon diskon.
- **Sistem Biaya Layanan (Service Fee)**: Kustomisasi fee per produk/varian (mendukung desimal), dihitung aman dari server-side.
- **Sistem Kupon Diskon**: Pembuatan dan validasi kupon diskon (persentase/nominal) dengan batasan produk dan masa kedaluwarsa.
- **Tema Musiman**: Sistem tema kustomisasi (Lebaran, Natal, dll) dengan efek partikel (salju, kembang api, hati).
- **Popup Pengumuman**: Sistem popup announcement yang bisa dikustomisasi dari admin.
- **Auto-Cancel Pesanan**: Pesanan yang pending terlalu lama akan otomatis dibatalkan.
- **Konfigurasi Terpusat**: File `config.js` untuk menyimpan konfigurasi Firebase dan Worker URL.
- **Halaman Pendukung**: About Us, Contact, Help Center, Order Guide, Feedback, Privacy Policy, Terms of Service, dan Disclaimer.

## Stack Teknologi

| Komponen | Teknologi | Fungsi |
|---|---|---|
| Frontend | Cloudflare Pages (HTML/CSS/JS) | Halaman statis, routing via `404.html` sebagai catch-all |
| Backend | Cloudflare Workers (`worker.js`) | API Gateway, integrasi Mayar, manajemen stok, kalkulasi harga server-side |
| Database | Firebase Firestore | Data produk, stok, pesanan, transaksi, kupon, service fee |
| Payment | Mayar API | Pembuatan invoice & webhook pembayaran |

## Setup Project

### 1. Konfigurasi Firebase
1. Buat project baru di [Firebase Console](https://console.firebase.google.com/).
2. Aktifkan **Authentication** (Email/Password).
3. Aktifkan **Firestore Database**.
4. Salin konfigurasi Firebase (API Key, Project ID, dll) dan tempelkan ke file `config.js`.

### 2. Deploy Cloudflare Worker
1. Install Wrangler (CLI Cloudflare) atau copy isi `worker.js` ke dashboard Cloudflare Workers.
2. Set Environment Variables di Cloudflare Worker:
   - `MAYAR_API_KEY`: API Key dari [Mayar Dashboard](https://web.mayar.id/api-keys).
   - `MAYAR_BASE_URL`: 
     - Production: `https://api.mayar.id/hl/v1`
     - Sandbox: `https://api.mayar.club/hl/v1`
   - `MAYAR_WEBHOOK_SECRET`: Secret key dari Dashboard Mayar untuk validasi HMAC webhook.
3. Update Worker URL di file `config.js`.

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

### Halaman Utama
- `index.html` — Halaman utama katalog produk.
- `detail-product.html` — Halaman detail produk & form checkout.
- `detail-invoice.html` — Halaman preview/konfirmasi pesanan sebelum pembayaran.
- `detail-order.html` — Halaman tracking status pesanan.
- `admin.html` — Dashboard admin (CMS).

### Modul JavaScript
- `config.js` — Konfigurasi terpusat (Firebase config, Worker URL).
- `utils.js` — Utility functions bersama (format currency, toast, dsb).
- `frontend-features.js` — Fitur frontend (popup, seasonal theme loader).
- `admin-features.js` — Fitur admin panel (manajemen kupon, popup, tema).
- `theme-engine.js` — Engine tema musiman dengan efek partikel.

### Backend & Security
- `worker.js` — Backend serverless Cloudflare Worker (~1.500+ baris).
- `firebase.rule` — Aturan keamanan Firestore.
- `firebase.json` — Konfigurasi Firebase.

### Halaman Pendukung
- `about-us.html` — Tentang Kami.
- `contact.html` — Kontak.
- `help-center.html` — Pusat Bantuan.
- `order-guide.html` — Panduan Pemesanan.
- `feedback.html` — Form Feedback.
- `privacy-policy.html` — Kebijakan Privasi.
- `terms-of-service.html` — Syarat & Ketentuan.
- `disclaimer.html` — Disclaimer.
- `404.html` — Catch-all routing untuk Cloudflare Pages.

### Dokumentasi
- `architecture_and_security.md` — Dokumentasi arsitektur & model keamanan.
- `vibecoding_competition.md` — Formulir kompetisi Mayar Vibecoding.
- `documentation.md` — Dokumentasi teknis tambahan.
- `MAINTENANCE_GUIDE.md` — Panduan maintenance.
- `Tutorial.md` — Tutorial penggunaan.
