# 🤝 Panduan Kolaborasi Project ERP Gudang

Halo Tim! Berikut adalah cara menjalankan project ini di laptop kamu agar kita bisa kerja bareng.

## 1. Persiapan (Install Aplikasi)
Pastikan di laptop kamu sudah terinstall:
1.  **Node.js** (Download di: https://nodejs.org/)
2.  **VS Code** (Download di: https://code.visualstudio.com/)

## 2. Cara Membuka Project
1.  Ekstrak file ZIP yang dikirimkan.
2.  Buka folder hasil ekstrak tersebut menggunakan **VS Code**.

## 3. Konfigurasi Database (PENTING!)
Agar data kita sinkron (apa yang aku input, kamu juga lihat), kita harus connect ke database yang sama.

1.  Di dalam VS Code, cari file bernama `.env.example`.
2.  Copy file tersebut dan ubah namanya menjadi `.env` (tanpa .example).
3.  Minta **URL** dan **ANON KEY** Supabase ke pemilik project (jangan disebar di grup umum).
4.  Isi file `.env` seperti ini:

```env
VITE_SUPABASE_URL=https://semmwriozmhdpdepxscg.supabase.co
VITE_SUPABASE_ANON_KEY= (Paste kode kunci rahasia di sini)
```

## 4. Menjalankan Aplikasi
Buka terminal di VS Code (Ctrl + `), lalu ketik perintah ini satu per satu:

```bash
# 1. Install semua kebutuhan aplikasi (hanya sekali di awal)
npm install

# 2. Jalankan aplikasi
npm run dev
```

Setelah itu, buka link yang muncul (biasanya `http://localhost:5173`) di browser kamu.

Selamat bekerja! 🚀
