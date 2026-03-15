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
*   **Cara Kerja**: Sistem otomatis mengecek pesanan "Pending" yang sudah lebih dari **1 Jam**.
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

### Menambah Stok dengan Format Custom (Label|Value)
1.  Buka **Kelola Stok**.
2.  Ketik/Paste dengan format pipah `|`:
    ```
    Email|user@mail.com
    Pass|12345
    Pin|0000
    ```
3.  **Pastikan** setiap baris memiliki enter/baris baru.
4.  Klik **Add**.
5.  User akan melihat tampilan yang rapi dengan tombol copy di setiap barisnya.

---

## 5. Sistem Kupon & Diskon (Advanced)

ArufKuy Store kini menggunakan sistem kupon mandiri (Lokal) yang dilengkapi perlindungan kelas Enterprise untuk mencegah penyalahgunaan diskon.

### A. Fitur Utama Kupon
Saat membuat kupon di Menu Kupon pada Dashboard Admin, Anda memiliki kontrol penuh atas promo:

*   **Tipe Diskon**:
    *   **Fixed (Rp)**: Potongan harga tetap (contoh: Diskon Rp 10.000).
    *   **Persen (%)**: Potongan harga berdasarkan persentase (contoh: Diskon 20%).
*   **Maksimal Diskon (Persen)**: Jika Anda menggunakan tipe Persen (%), Anda bisa membatasi kerugian. (contoh: Diskon 50%, *Maksimal Diskon* Rp 20.000).
*   **Kapasitas (Max Usage Global)**: Batas maksimal kupon ini bisa digunakan oleh *seluruh* pelanggan (contoh: Hanya untuk 100 orang pertama).
*   **Status & Jadwal**: Kupon bisa diset Aktif, Nonaktif, atau Terjadwal. Kupon terjadwal baru bisa dipakai setelah "Tanggal Mulai" tercapai.

### B. Proteksi & Limitasi Penggunaan
Untuk mencegah *fraud* (kecurangan), sistem akan memblokir penggunaan kupon jika melanggar salah satu limitasi berikut:

1.  **Limit Per-User**: Batasi berapa kali satu pelanggan (Berdasarkan Email / No. HP) boleh menggunakan kupon yang sama. Set ke `1` agar setiap pelanggan hanya bisa pakai 1x promo.
2.  **Cooldown (Jeda Penggunaan)**: Jika limit user > 1, Anda bisa mengatur jeda (dalam satuan Jam) sebelum pengguna boleh memakai kupon itu lagi.
3.  **Minimal Belanja (Rp)**: Kupon hanya aktif jika total keranjang mencapai nominal ini (contoh: Min. Belanja Rp 50.000).
4.  **Minimal Jumlah Item (Qty)**: Kupon hanya aktif jika kuantitas barang yang dibeli lebih dari batas (contoh: Min. Beli 2 akun).
5.  **Produk Spesifik**: Anda bisa membatasi kupon ini hanya berlaku untuk produk-produk tertentu saja (Pilih produk pada daftar di Popup Kupon).

### C. Analitik Kupon
*   Setiap kupon di tabel admin akan menampilkan **Progress Bar** yang menunjukkan berapa kuota terpakai (contoh: Dipakai 25/100 -> 25%).
*   Sistem juga melacak **Total Diskon** yang secara kumulatif telah Anda berikan / subsidi melalui kupon tersebut.

### D. Fitur Cepat Admin
*   **Generate Kode**: Tombol `Generate` di sebelah kolom kode akan men-generate kode unik secara acak (Contoh: `PROMO-A2B4`).
*   **Live Preview**: Simulasi tampilan kupon (Karcis) secara *real-time* sebelum Anda menyimpannya.
*   **Duplicate**: Tombol Duplicate (Ikon Copy di tabel) untuk menyalin settingan kupon lama menjadi kupon baru (kode otomatis ditambahkan angka random).
*   **Quick Toggle Status**: Mengubah status kupon Aktif <-> Nonaktif hanya dengan 1 klik pada ikon panah di tabel.
