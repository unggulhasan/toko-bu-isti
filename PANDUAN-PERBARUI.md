# Panduan Memperbarui Aplikasi Kasir Toko Bu Isti

Panduan ini untuk memperbarui aplikasi kasir ke versi baru. Lakukan di **komputer server** (komputer yang tersambung ke printer struk), bukan di komputer kasir kedua.

- Folder aplikasi: `C:\toko-bu-isti`
- Versi terbaru: **1.0.4**
- Waktu yang dibutuhkan: sekitar 10–15 menit
- Koneksi Internet diperlukan

> **Penting:** lakukan pembaruan saat toko **sedang tutup** atau tidak ada pelanggan. Selama pembaruan, kasir tidak bisa dipakai.

---

## Langkah 1 — Ekstrak file dengan WinRAR

1. Simpan file **`toko-bu-isti-1.0.4.zip`** yang dikirim lewat WhatsApp ke folder **Downloads** (atau Desktop).
2. Klik kanan file tersebut.
3. Pilih **Extract Here** (Ekstrak di sini) dari menu WinRAR.
4. Akan muncul folder baru bernama **`toko-bu-isti-1.0.4`**.

## Langkah 2 — Salin file baru ke folder aplikasi

1. Buka folder **`toko-bu-isti-1.0.4`** yang baru diekstrak. **Klik dua kali sampai terlihat isinya**: `backend`, `frontend`, `buka-kasir.bat`, `perbarui-kasir.bat`, dan file/folder lainnya.
2. Pilih **semua isinya** (tekan **Ctrl + A**), lalu salin (**Ctrl + C**).
3. Buka folder **`C:\toko-bu-isti`**, lalu tempel (**Ctrl + V**).
4. Windows akan bertanya soal file yang sudah ada. Pilih **Replace the files in the destination** (*Ganti file di tujuan*).
   - Kalau muncul pertanyaan per file, centang *"Do this for all current items"* lalu pilih **Replace**.

> **Jangan hapus** folder `C:\toko-bu-isti`, dan jangan hapus file `toko.fdb` maupun `.env` di dalam folder `backend`. Itu adalah data penjualan dan pengaturan toko. Cukup *timpa* (Replace), jangan hapus.

## Langkah 3 — Jalankan pembaruan

1. Tutup semua jendela hitam.
2. Di folder `C:\toko-bu-isti`, klik dua kali **`perbarui-kasir.bat`**.
3. Jendela hitam akan muncul dan menampilkan banyak tulisan. **Tunggu dan jangan ditutup.** Prosesnya bisa 5–10 menit.
4. Pembaruan selesai kalau muncul tulisan:

   ```
   Kasir sudah diperbarui. Jalankan buka-kasir.bat untuk membuka kasir.
   ```

5. Tekan sembarang tombol untuk menutup jendela.

**Kalau muncul tulisan "Gagal..."** (misalnya *"Gagal memperbarui backend"* atau *"Gagal build frontend"*): periksa internet, lalu coba klik dua kali `perbarui-kasir.bat` sekali lagi. Kalau masih gagal, foto layarnya dan hubungi orang yang memasang aplikasi ini.

## Langkah 4 — Buka kasir dan periksa

1. Klik dua kali **`buka-kasir.bat`**.
2. Tunggu sampai browser terbuka dan muncul halaman masuk (login). Dua/tiga jendela hitam akan muncul — **biarkan terbuka**.
3. Masuk dengan PIN seperti biasa.
4. Periksa cepat:
   - Daftar barang masih lengkap.
   - Riwayat transaksi kemarin masih ada.
   - Coba satu transaksi percobaan dan cetak struknya (lalu batalkan/*void* transaksi percobaan itu).
5. Di komputer kasir kedua, segarkan halaman browser (tekan **F5**). Kalau halaman tidak berubah, tekan **Ctrl + F5**.

Selesai. Aplikasi sudah di versi 1.0.4.

---

## Kalau ada masalah

| Masalah | Yang dilakukan |
| --- | --- |
| Muncul tulisan "Gagal..." saat `perbarui-kasir.bat` | Cek internet, jalankan `perbarui-kasir.bat` lagi. |
| Halaman kasir tidak mau terbuka setelah `buka-kasir.bat` | Tunggu 1 menit, lalu tekan F5. Kalau tetap tidak bisa, jalankan `tutup-kasir.bat` lalu `buka-kasir.bat` lagi. |
| Data barang / transaksi hilang | **Jangan panik dan jangan jalankan apa-apa lagi.** Tutup kasir dengan `tutup-kasir.bat`, lalu hubungi orang yang memasang aplikasi. |
| Printer tidak mencetak | Pastikan printer menyala dan kabel USB terpasang, lalu coba cetak ulang. Kalau tetap tidak bisa, hubungi orang yang memasang aplikasi. |

## Ringkasan singkat

1. Klik kanan `toko-bu-isti-1.0.4.zip` → **Extract Here** (WinRAR)
2. Salin **isi** folder `toko-bu-isti-1.0.4` ke `C:\toko-bu-isti` → **Replace**
3. `perbarui-kasir.bat` → tunggu sampai selesai
4. `buka-kasir.bat` → periksa
