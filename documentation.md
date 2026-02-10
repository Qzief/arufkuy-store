# Dokumentasi Fitur ArufKuy Store

Dokumen ini berisi daftar fitur lengkap dan panduan penggunaan untuk Admin Panel dan Toko Online.

## 1. Manajemen Produk & Stok

### A. Tipe Produk
Sistem mendukung dua jenis produk:
1.  **Simple Product**: Produk tunggal tanpa variasi (contoh: Akun Netflix Premium).
2.  **Variable Product**: Produk dengan beberapa pilihan (contoh: Mobile Legends - 100 Diamond, 500 Diamond).

### B. Input Stok (Advanced)
Fitur input stok mendukung beberapa format canggih untuk memudahkan admin:

1.  **Bulk Add (Satu per baris)**
    *   **Cara Pakai**: Copy-paste banyak akun dari text file ke dalam kotak konten stok.
    *   **Hasil**: Setiap baris akan menjadi satu item stok terpisah.
    *   **Shared Note**: Jika Anda mengisi "Catatan Private" saat melakukan bulk add, catatan tersebut akan diterapkan ke **semua** item yang baru ditambahkan.

2.  **Bracket Syntax `[...]` (Multi-line Item)**
    *   **Fungsi**: Membuat satu item stok yang terdiri dari banyak baris (misal format email, pass, pin dalam satu blok).
    *   **Cara Pakai**: Apit konten dengan kurung siku `[` dan `]`.
    *   **Contoh Input**:
        ```
        [Email: user@mail.com
        Pass: 12345
        Pin: 0000]
        ```
    *   **Hasil**: Sistem akan menganggap blok di atas sebagai **1 item stok** saja, dan user akan menerimanya persis seperti format tersebut.

---

## 2. Manajemen Pesanan (Order)

### A. Status Pesanan
*   **Pending**: Pesanan baru dibuat, belum dibayar.
*   **Paid**: Pembayaran diterima (Otomatis dari Mayar atau Manual). Stok sudah terkirim ke user.
*   **Completed**: Pesanan selesai (bisa manual mark as completed).
*   **Cancelled**: Pesanan dibatalkan (dibatalkan admin atau auto-cancel).

### B. Auto-Cancel (Otomatis)
*   **Cara Kerja**: Sistem otomatis mengecek pesanan "Pending" yang sudah lebih dari **24 Jam**.
*   **Pemicu**: Pengecekan dilakukan setiap kali Anda membuka **Dashboard Admin**.
*   **Notifikasi**: Akan muncul notifikasi Toast jika ada pesanan yang otomatis dibatalkan.

### C. Manual Delivery
Admin bisa menambahkan item pengiriman secara manual ke dalam pesanan (edit order):
*   Bisa tambah multiple item.
*   Setiap item punya "Content" dan "Note" sendiri.

---

## 3. Fitur Kosmetik & Tema

### A. Tema Hari Besar (Seasons)
Anda bisa mengatur tema website untuk hari-hari spesial (Lebaran, Natal, Tahun Baru).
*   **Partikel Efek**: Salju, Kembang Api, Hati, Bintang, dll.
*   **Warna**: Kustomisasi warna utama dan sekunder.
*   **Mode Auto**: Jika aktif, tema akan berganti otomatis sesuai tanggal yang disetting.

### B. Popups
Membuat pengumuman atau kode promo yang muncul saat user membuka website.
*   **Tipe**: Info, Pengumuman, Kupon.
*   **Frekuensi**: Sekali, Harian, atau Setiap Visit.

---

## 4. Integrasi & Lainnya

*   **Discord Webhook**: Upload gambar produk otomatis terkirim ke Discord untuk hosting gambar gratis.
*   **Mayar Payment**: Integrasi pembayaran otomatis.
*   **Kupon Diskon**: Membuat kode promo yang memotong harga (Fixed atau Persen).

---

## Panduan Cepat (Quick Start)

### Menambah Produk Varian dengan Stok Banyak
1.  Buka **Tambah Produk**.
2.  Centang **Gunakan Variasi Produk**.
3.  Klik **Tambah Varian** (misal: "100 DM").
4.  Klik **Kelola Stok** di varian tersebut.
5.  Di kotak konten, paste 100 akun (1 baris per akun).
6.  (Opsional) Isi catatan "Garansi 7 Hari".
7.  Klik **Add**.
8.  Selesai! 100 stok masuk dengan catatan yang sama.

### Menambah Produk Akun Bundling (Multi-line)
1.  Buka **Kelola Stok**.
2.  Ketik/Paste dengan format kurung siku:
    ```
    [Akun Premium
    User: budi
    Pass: 123]
    ```
3.  Klik **Add**.
4.  User akan menerima teks tersebut secara utuh sebagai satu kesatuan.
