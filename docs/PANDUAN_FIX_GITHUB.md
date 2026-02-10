# Panduan Perbaikan Masalah Commit GitHub (Dualite)

Jika Anda mengalami error: **"Unable to access repository. Please check your permissions."** pada repository Private Organization, ikuti langkah berikut:

## 1. Cek Izin Organisasi di GitHub (Paling Sering Terjadi)
Secara default, GitHub memblokir akses aplikasi pihak ketiga ke repository Organisasi Private kecuali diizinkan secara eksplisit.

1. Buka **GitHub** dan login.
2. Pergi ke **Settings** (Klik avatar pojok kanan atas > Settings).
3. Di menu kiri, pilih **Applications** > **Authorized OAuth Apps**.
4. Klik pada aplikasi **Dualite**.
5. Lihat bagian **"Organization access"**.
   - Cari nama organisasi Anda (misal: `DUALITE-PROJECT`).
   - Jika ada tombol **"Grant"** atau **"Request"**, silakan klik tombol tersebut.
   - Pastikan statusnya berubah menjadi **tanda centang hijau** (Access granted).

## 2. Refresh Koneksi (Unlink & Relink)
Token akses mungkin sudah kadaluarsa atau tidak valid.

1. Di popup commit Dualite, klik tombol merah **Unlink Repository**.
2. Refresh halaman browser.
3. Klik tombol **Connect to GitHub** lagi.
4. Pilih ulang repository `erp-gudang-sistem`.
5. Coba lakukan commit kembali.

## 3. Coba Branch Baru
Terkadang masalah terjadi pada sinkronisasi branch `main` tertentu.

1. Di popup commit, coba ganti nama branch dari `main` menjadi nama baru, misal `fix/update-fitur`.
2. Klik **Create Commit**.
3. Jika berhasil, Anda bisa melakukan Merge Request di GitHub nanti.

## 4. Eskalasi ke Support
Jika langkah di atas gagal, kemungkinan ada masalah pada sesi server Dualite.
Silakan hubungi tim support dengan menyertakan:
- Nama Akun Dualite
- Nama Repository
- Screenshot error (seperti yang Anda lampirkan)

---
*Dokumen ini dibuat otomatis oleh AI Assistant.*
