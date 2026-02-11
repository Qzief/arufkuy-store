# Tutorial: Menambahkan Fitur Review Produk (Google Apps Script)

Fitur ini memungkinkan pembeli memberikan ulasan bintang dan komentar setelah membeli produk. Data ulasan akan tersimpan otomatis di Google Sheet tanpa perlu login.

## Bagian 1: Persiapan Google Sheet & Script

1.  Buka [Google Sheets](https://sheets.google.com) dan buat spreadsheet baru.
2.  Beri nama sheet (misal: `Review Arufkuy`).
3.  **UPDATE KOLOM**: Di baris pertama (Header), isi kolom A sampai F dengan:
    *   **A**: Timestamp
    *   **B**: Order ID
    *   **C**: Nama Customer  <-- *(Baru)*
    *   **D**: Produk
    *   **E**: Rating
    *   **F**: Review
4.  Klik menu **Ekstensi** > **Apps Script**.
5.  Hapus semua kode yang ada, lalu copy-paste kode berikut:

```javascript
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    var data;
    if (e.postData.type === "application/json") {
      data = JSON.parse(e.postData.contents);
    } else {
      data = JSON.parse(e.postData.contents);
    }

    sheet.appendRow([
      new Date(),
      data.orderId,
      data.customerName, // Simpan Nama
      data.productName,
      data.rating,
      data.review
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      "status": "success", 
      "message": "Review berhasil disimpan"
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error", 
      "message": e.toString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rows = sheet.getDataRange().getValues();
  
  // --- Cek Spesifik Order ID ---
  if (e.parameter.checkId) {
    var targetId = e.parameter.checkId.toString();
    var isReviewed = false;
    
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][1].toString() === targetId) {
        isReviewed = true;
        break;
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      "reviewed": isReviewed
    })).setMimeType(ContentService.MimeType.JSON);
  }
  // -----------------------------------------

  // Ambil Semua Data (untuk feedback.html)
  var data = [];
  if (rows.length > 1) {
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      // Pastikan ada rating (Kolom E / index 4)
      if (row[4]) { 
        data.push({
          timestamp: row[0],
          orderId: row[1],
          customerName: row[2], // Ambil Nama
          productName: row[3],
          rating: row[4],
          review: row[5]
        });
      }
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```

6.  Klik tombol **Simpan** (ikon disket).
7.  **PENTING: DEPLOY ULANG (WAJIB)**
    *   Klik tombol **Terapkan** (Deploy) > **Kelola Deployment**.
    *   Klik ikon pensil (Edit).
    *   Pilih **Versi Baru** (New Version).
    *   Klik **Terapkan** (Deploy).

---

## Bagian 2: Integrasi ke Website

Copy URL Script baru Anda ke file `detail-order.html` dan `feedback.html`.
