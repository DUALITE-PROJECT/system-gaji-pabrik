# ERP Gudang Sistem (Private)

Sistem Manajemen Gudang Terintegrasi (Warehouse Management System) yang mencakup Inbound, Outbound, Manajemen Stok, dan Stock Opname.

## 🔒 Status Project: Private
Repository ini bersifat **PRIVATE**. Dilarang menyebarkan kode sumber atau kredensial database kepada pihak yang tidak berkepentingan.

## 🚀 Fitur Utama
- **Master SKU**: Manajemen data barang dengan kategori otomatis.
- **Inbound Gudang**: Penerimaan barang dari pabrik dengan checklist fisik.
- **Outbound Pabrik**: Pembuatan PO Batch dan cetak label barcode.
- **Manajemen Stok**: Stok real-time per Gudang dan per Karung.
- **Stock Opname**: Audit stok digital dengan perhitungan selisih otomatis.

## 🛠️ Cara Setup (Untuk Kolaborator)

Jika Anda baru bergabung dalam project ini, ikuti langkah berikut untuk menjalankannya di laptop Anda:

### 1. Prasyarat
Pastikan laptop Anda sudah terinstall:
- **Node.js** (Versi 18 atau terbaru)
- **Git**
- **VS Code** (Recommended Text Editor)

### 2. Clone Repository
Buka terminal/CMD, lalu jalankan:
```bash
git clone https://github.com/USERNAME_ANDA/erp-gudang-sistem.git
cd erp-gudang-sistem
```
*(Ganti `USERNAME_ANDA` dengan username pemilik repo)*

### 3. Install Dependencies
Install semua library yang dibutuhkan:
```bash
npm install
# atau jika pakai yarn
yarn install
```

### 4. Konfigurasi Environment (.env)
Project ini membutuhkan koneksi ke Supabase.
1. Buat file baru bernama `.env` di folder root project.
2. Minta isi file `.env` kepada pemilik project (Admin).
3. Format isinya seperti ini:
   ```env
   VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

### 5. Jalankan Aplikasi
```bash
npm run dev
# atau
yarn run dev
```
Buka browser di `http://localhost:5173`.

## 🤝 Panduan Kolaborasi (Git Flow)
Agar kode tidak bentrok saat diedit bersamaan:

1. **Sebelum edit**, selalu tarik kode terbaru:
   ```bash
   git pull origin main
   ```
2. Lakukan perubahan kode di VS Code.
3. **Simpan perubahan** ke GitHub:
   ```bash
   git add .
   git commit -m "Menambahkan fitur X atau memperbaiki bug Y"
   git push origin main
   ```

---
© 2025 ERP Gudang Sistem. All rights reserved.
