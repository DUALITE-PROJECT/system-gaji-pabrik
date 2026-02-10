# Panduan Upload ke GitHub (Untuk Pemilik Project)

Karena sistem AI tidak bisa login ke GitHub Anda, silakan lakukan langkah ini di laptop Anda.

## Langkah 1: Download Project
1. Klik tombol **Download** di pojok kanan atas editor ini (ikon panah ke bawah).
2. Anda akan mendapatkan file `.zip`.
3. **Extract (Unzip)** file tersebut di komputer Anda.
4. Buka folder hasil extract tersebut menggunakan **VS Code**.

## Langkah 2: Buat Repository di GitHub
1. Buka browser, login ke [GitHub.com](https://github.com).
2. Klik tombol **+** di pojok kanan atas -> **New repository**.
3. Isi nama repository: `erp-gudang-sistem`.
4. Pilih **Private** (Penting!).
5. **JANGAN** centang "Add a README file" (karena kita sudah buat di sini).
6. Klik **Create repository**.

## Langkah 3: Upload Kode (Lewat Terminal VS Code)
1. Di VS Code, buka menu **Terminal** -> **New Terminal**.
2. Ketik perintah berikut satu per satu (tekan Enter setiap baris):

```bash
# 1. Inisialisasi Git
git init

# 2. Masukkan semua file ke antrian upload
git add .

# 3. Simpan perubahan pertama
git commit -m "First commit: ERP Gudang Sistem Complete"

# 4. Ubah nama cabang utama jadi 'main'
git branch -M main

# 5. Sambungkan ke GitHub (Ganti USERNAME_ANDA dengan username GitHub asli Anda)
git remote add origin https://github.com/USERNAME_ANDA/erp-gudang-sistem.git

# 6. Upload!
git push -u origin main
```

## Langkah 4: Undang Teman (Kolaborator)
Agar teman Anda bisa akses repo Private ini:
1. Buka halaman repository Anda di GitHub.
2. Klik tab **Settings** -> **Collaborators**.
3. Klik **Add people**.
4. Masukkan email atau username GitHub teman Anda.
5. Teman Anda akan dapat email undangan, suruh dia terima (Accept).

Selesai! Sekarang kalian bisa kerja bareng.
