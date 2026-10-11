# SOP & PANDUAN PENGATURAN KAMERA SONY UNTUK VENDOR
### MingleBooth Studio — Professional Photobooth System

Panduan ini wajib diikuti oleh operator booth / vendor sebelum memulai sesi acara (*event*) untuk memastikan kamera Sony (seperti **Sony α7C II, α7 IV, A6700, ZV-E1**, dll.) terhubung sempurna, tombol shutter berbunyi renyah, dan foto langsung masuk ke template bingkai photobooth tanpa kendala.

---

## ⚠️ RINGKASAN: MENGAPA FOTO SEBELUMNYA HITAM & SHUTTER TIDAK MERESPON?

| Gejala Masalah | Penyebab Utama | Solusi |
| :--- | :--- | :--- |
| **Hasil foto hitam / ikon gambar rusak / sistem macet di "Menyiapkan Foto"** | Kamera disetel ke **RAW / ARW**. File RAW berukuran 65–70 MB per foto dan **tidak dapat dibaca oleh browser/mesin template web**. | Ubah ke **JPEG (Fine / Extra Fine)**. |
| **Ditekan shutter di bodi kamera, sistem tidak mendeteksi jepretan** | File yang dikirim bodi kamera berakhiran `.ARW`, sehingga sistem photobooth menolak memproses file mentah tersebut. | Ubah ke **JPEG**. |
| **Shutter ditekan tapi tidak ada suara "KLIK" mekanis** | Kamera berada dalam mode **Silent Mode (Electronic Shutter)**. | Matikan **Silent Mode: OFF**. |
| **Shutter macet / kamera tidak mau jepret saat ditekan** | Kamera gagal mengunci fokus (*Focus Priority*) karena lens cap tertutup atau ruangan terlalu gelap. | Pastikan lensa terbuka, atur AF-S / AF-C, atau atur Shutter Priority. |

---

## 📋 4 ATURAN EMAS SETUP KAMERA SONY (CHECKLIST WAJIB VENDOR)

Lakukan pengecekan pada menu kamera Sony sebelum kabel USB dicolokkan ke laptop:

### 1. Format Gambar: WAJIB JPEG (DILARANG RAW / ARW)
* Photobooth memproses foto secara *real-time* (jepret → masukkan ke bingkai cutout → render QR Code & GIF).
* **Cara setting di Sony α7C II:**
  1. Tekan tombol **MENU**.
  2. Buka tab **Shooting** (ikon kamera warna merah) > **Image Quality/Rec** > **Image Quality Settings**.
  3. Pilih **File Format** > Pilih **JPEG** *(JANGAN RAW atau RAW+JPEG)*.
  4. Pilih **JPEG Quality** > Pilih **Fine** atau **Extra Fine**.
  5. Pilih **JPEG Image Size** > Pilih **L (Large)** atau **M (Medium)**.

### 2. Suara Shutter Mekanis: Silent Mode = OFF
* Agar tamu dan operator mendengar suara klik kamera yang mantap dan memuaskan saat hitungan mundur selesai:
* **Cara setting di Sony α7C II:**
  1. Buka **MENU** > Tab **Shooting** > **Shutter/Silent**.
  2. Pilih **Silent Mode** > Ubah menjadi **OFF**.
  3. Pastikan **Shutter Type** disetel ke **Mechanical Shutter** atau **Auto**.

### 3. Koneksi USB: PC Remote (Wired USB)
* **Cara setting di Sony α7C II:**
  1. Buka **MENU** > Tab **Network** (ikon bola dunia warna oranye) > **Transfer/Remote** > **PC Remote Function**.
  2. Atur **PC Remote** = **ON**.
  3. Atur **PC Remote Method** = **USB**.
  4. Hubungkan kabel USB-C kualitas tinggi (Power Delivery & Data 10 Gbps) langsung ke port laptop (jangan lewat USB Hub murahan yang tidak bertenaga).

### 4. Pengaturan Fokus & Pencahayaan
* Pastikan tutup lensa (*lens cap*) sudah dibuka.
* Jika di dalam ruangan booth menggunakan lampu flash/lighting eksternal:
  * Atur kamera di mode **M (Manual)**.
  * Shutter speed: `1/125s` – `1/160s`.
  * Aperture: `f/4.0` – `f/8.0`.
  * ISO: `100` – `400`.
  * **Shot. Result Live View**: Ubah ke **Setting Effect OFF** jika menggunakan flash eksternal agar layar Live View di layar laptop tidak gelap.

---

## 🛡️ FITUR PERLINDUNGAN OTOMATIS DI MINGLEBOOTH STUDIO

MingleBooth Studio kini dilengkapi dengan sistem pengaman otomatis:

1. **Deteksi Otomatis File RAW:**
   Jika kamera secara tidak sengaja menghasilkan file `.ARW` (RAW), aplikasi akan langsung memunculkan peringatan pop-up di layar:
   > *"⚠️ PERINGATAN KAMERA VENDOR: File foto terdeteksi berformat RAW/ARW! Harap ubah File Format kamera Sony Anda ke JPEG (Fine)."*

2. **Anti-Freeze Timeout (4 Detik):**
   Aplikasi tidak akan pernah lagi macet (*hang indefinitely*) di tampilan *"Menyiapkan Foto & Animasi GIF..."*. Jika ada gambar korup atau RAW, sistem akan melewati dengan aman dan memberitahu operator.

3. **Indikator Status & Tombol 'Buka Folder':**
   Operator dapat menekan tombol **"Buka Folder"** di sidebar MingleBooth untuk melihat langsung file foto asli yang baru saja ditransfer dari kamera.

---

**MingleBooth Engineering Team**  
*MingleBooth Studio — Professional Photobooth Ecosystem*
