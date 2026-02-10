# 🚀 Panduan Deploy ke Vercel

Karena Anda memilih Vercel, berikut adalah cara termudah untuk meng-online-kan aplikasi ini:

## Cara 1: Drag & Drop (Paling Cepat)
1. **Download Project** ini (Klik menu File -> Download / Export Zip).
2. Ekstrak file ZIP di laptop Anda.
3. Buka website [vercel.com](https://vercel.com) dan Login.
4. Klik **"Add New..."** -> **"Project"**.
5. Cari bagian **"Import Third-Party Git Repository"** atau **"Upload"**.
6. Jika ada opsi Upload Folder, langsung upload folder hasil ekstrak tadi.
7. **PENTING: Environment Variables**
   Saat diminta konfigurasi, cari bagian **Environment Variables** dan masukkan:
   - `VITE_SUPABASE_URL`: (Isi dengan URL Supabase Anda)
   - `VITE_SUPABASE_ANON_KEY`: (Isi dengan Key Supabase Anda)
   *Tanpa ini, aplikasi tidak bisa ambil data.*
8. Klik **Deploy**.

## Cara 2: Via GitHub (Direkomendasikan untuk Update Mudah)
1. Upload folder project ke GitHub repository Anda (lihat panduan `PANDUAN_UPLOAD_GITHUB.md`).
2. Buka Vercel, klik **"Add New Project"**.
3. Pilih **"Import Git Repository"** dan pilih repo `erp-gudang-sistem` Anda.
4. Masukkan Environment Variables (sama seperti Cara 1).
5. Klik **Deploy**.

---
**Catatan:**
File `vercel.json` sudah saya siapkan agar halaman tidak error saat di-refresh (404 Not Found).
