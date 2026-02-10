# Rumus Perhitungan Gaji Pabrik (Uang Makan & Kehadiran)

Dokumen ini menjelaskan logika perhitungan yang digunakan dalam sistem untuk komponen **Uang Makan** dan **Uang Kehadiran**.

## 1. Waktu Pembayaran
Kedua komponen ini bersifat **akumulatif** dan hanya dibayarkan pada **Periode 2 (Akhir Bulan)**.
- Data absensi dari Periode 1 dan Periode 2 dijumlahkan terlebih dahulu sebelum menghitung potongan.

## 2. Nilai Dasar (Base Value)
Nilai awal diambil dari **Master Gaji** sesuai dengan **Grade** karyawan pada bulan tersebut.
- **Uang Makan Full**: Sesuai Master.
- **Uang Kehadiran Full**: Sesuai Master.

## 3. Rumus Potongan Libur (Proporsional)
Potongan ini berlaku jika ada **Libur Perusahaan (LP)** atau **Tanggal Merah (TM)**.
Sistem menganggap hari kerja standar adalah **26 hari**.

**Rumus:**
```
Rate Harian = Nilai Master / 26
Potongan = (Jumlah Hari LP + TM) x Rate Harian
```
*Contoh: Jika Uang Makan Rp 520.000, maka Rate Harian = Rp 20.000. Jika ada 2 hari libur, potongan = Rp 40.000.*

## 4. Rumus Denda Absensi (Nominal)
Berlaku untuk status **Sakit (S)**, **Izin (I)**, dan **Alpha/Tanpa Keterangan (T)**.
Denda ini berupa nominal uang (Rupiah), bukan potong hari kerja.

### A. Tidak Berurut / Putus (TB)
Jika karyawan tidak masuk secara acak (selang-seling).
- **Denda**: **Rp 10.000** per hari.

### B. Berurut (B)
Jika karyawan tidak masuk berturut-turut dalam satu rentang waktu. Menggunakan sistem **Denda Progresif** (Kenaikan Rp 2.000 per hari).

**Skema Tarif:**
- Hari ke-1: **Rp 10.000**
- Hari ke-2: **Rp 12.000**
- Hari ke-3: **Rp 14.000**
- Hari ke-4: **Rp 16.000**
- dst...

**Contoh Perhitungan Berurut 3 Hari:**
Total Denda = 10.000 + 12.000 + 14.000 = **Rp 36.000**

---
*Catatan: Rumus ini diterapkan secara otomatis oleh sistem pada saat generate Laporan Bulanan di Periode 2.*
