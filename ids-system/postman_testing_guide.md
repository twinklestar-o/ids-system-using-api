# Panduan Pengujian IDS via Postman

Panduan ini memungkinkan Anda mensimulasikan serangan secara manual menggunakan Postman. Meskipun dikirim lewat Postman, **notifikasi tetap akan muncul di browser Anda** karena ekstensi terus melakukan polling ke server.

## 1. Persiapan
Pastikan semua container Docker sedang berjalan.
- **Event Collector**: `http://localhost:5001/event`
- **Dashboard**: `http://localhost:5001/dashboard`

---

## 2. Simulasi Serangan Phishing (Trigger Paling Cepat)

Gunakan skenario ini untuk memicu **Auto-Block (Active Defense)** dan **Notifikasi IPS**.

- **Method**: `POST`
- **URL**: `http://localhost:5001/event`
- **Headers**: `Content-Type: application/json`
- **Body (raw JSON)**:
```json
{
  "event_type": "navigation_committed",
  "url": "http://1.2.3.4/login-bank-phishing-test",
  "domain": "1.2.3.4",
  "source": "browser_extension",
  "timestamp": "2026-03-04T15:00:00Z",
  "page_context": {
    "has_password_field": true,
    "suspicious_keywords_count": 5,
    "form_action_mismatch": true
  }
}
```

### Apa yang Akan Terjadi?
1. **Collector** menerima event.
2. **Phishing Agent** mendeteksi skor tinggi (karena ada IP, kata kunci 'login', 'bank', dan password field).
3. **Morpheus** melakukan analisis CoT.
4. **Browser Extension** akan menangkap perintah blokir saat polling dan memunculkan pop-up: **"🛡️ IPS: AKSES DIBLOKIR"**.

---

## 3. Simulasi Ransomware (Detection only via Postman)

- **Method**: `POST`
- **URL**: `http://localhost:5001/event`
- **Body (raw JSON)**:
```json
{
  "event_id": "test-ransomware-001",
  "event_type": "file_download",
  "url": "http://103.11.22.33/malicious_payload.exe",
  "data": {
    "file_context": {
      "file_name": "important_update.exe",
      "file_extension": "exe"
    }
  }
}
```
> **Analisis Tech**: Payload ini menggunakan IP mentah dan ekstensi `.exe` yang akan memicu skor tinggi di Ransomware Agent.

---

## 4. Simulasi Cryptojacking (Detection only via Postman)

- **Method**: `POST`
- **URL**: `http://localhost:5001/event`
- **Body (raw JSON)**:
```json
{
  "event_id": "test-crypto-001",
  "event_type": "suspicious_telemetry",
  "url": "http://miner-dashboard.com",
  "data": {
    "performance_context": {
      "cpu_usage_percent": 95
    },
    "script_context": {
      "wasm_detected": true
    },
    "user_context": {
      "tab_visibility": "background"
    }
  }
}
```
> **Analisis Tech**: Payload ini mensimulasikan penggunaan CPU tinggi di background tab dengan deteksi WebAssembly (WASM), yang merupakan ciri khas penambangan kripto ilegal.

---

## 5. Simulasi Multi-Vector (Phishing + Ransomware)

Gunakan ini untuk melihat kecanggihan AI (XAI) dalam menghubungkan dua kejadian berbeda.

### Langkah A (Kirim Phishing)
- **Method**: `POST`
- **URL**: `http://localhost:5001/event`
- **Body**:
```json
{
  "event_id": "multi-test-999",
  "event_type": "navigation_committed",
  "url": "http://fraud-site.com/verify-account",
  "page_context": { "has_password_field": true }
}
```

### Langkah B (Kirim Ransomware - Dalam jeda 2 detik)
- **Method**: `POST`
- **URL**: `http://localhost:5001/event`
- **Body**:
```json
{
  "event_id": "multi-test-999",
  "event_type": "file_download",
  "file_context": {
    "file_name": "update.exe",
    "file_extension": "exe"
  }
}
```

### Apa yang Akan Terjadi?
1. **Collector** menerima event.
2. **Phishing Agent** mendeteksi skor tinggi.
3. **Morpheus** melakukan analisis CoT.
4. **Browser Extension** akan menangkap perintah blokir.

> [!TIP]
> **Ganti `event_id` setiap kali tes**: Agar sistem menganggapnya sebagai kejadian baru, ubah angka di belakang `event_id` di body JSON (misal: `test-101`, `test-102`, dst).

---

## 6. Tips Jika Notifikasi Tetap Tidak Muncul

Jika data sudah masuk Dashboard tapi notifikasi tidak muncul:

1. **Gunakan Tombol "Sync Alerts Now"**: Saya telah menambahkan tombol baru di Popup Ekstensi (icon biru di toolbar). Klik icon ekstensi, lalu klik **"Sync Alerts Now"** untuk memaksa sistem mengecek peringatan terbaru tanpa menunggu alarm otomatis.
2. **Cek Service Worker Console**: 
   - Buka `chrome://extensions/`.
   - Klik link **"service worker"** pada kartu IDS Extension.
   - Lihat apakah muncul log `Processing alert: ...` atau `Showing notification for: ...`.
3. **Izin Notifikasi Windows**: Pastikan Windows tidak menyembunyikan notifikasi Chrome (Cek di Settings > System > Notifications).

---

## 7. Menghidupkan Dashboard Yang "Macet"
Jika Dashboard tidak bertambah, tekan **F12** di halaman Dashboard untuk melihat apakah ada error merah di Console. Jika ada, biasanya hanya perlu Refresh Keras (**Ctrl + F5**).
