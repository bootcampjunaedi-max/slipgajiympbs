# 📋 Panduan Instalasi — Slip Gaji Terpusat YASMA PB. Soedirman v2.0
### Frontend di GitHub Pages + Google Apps Script sebagai REST API

```
┌──────────────────────────────────────────────┐        ┌──────────────────────────────────────────┐
│ FRONTEND — GitHub Pages (repo publik)        │        │ BACKEND — Google Apps Script (privat)    │
│ https://USERNAME.github.io/slip-gaji-yasma/  │ fetch  │ https://script.google.com/…/exec         │
│ index.html · css/style.css · js/*.js         │ ─────▶ │ Kode.gs: doGet / doPost → JSON           │
│ (tanpa rahasia, tanpa data gaji)             │ ◀───── │ Sheets · Drive · Gmail · Fonnte · Cache  │
└──────────────────────────────────────────────┘  JSON  └──────────────────────────────────────────┘
```

Isi paket `slip-gaji-yasma.zip`:

```
slip-gaji-yasma/
├── PANDUAN-INSTALASI.md      ← panduan ini
├── backend/                  ← ditempel ke editor Apps Script (TIDAK diunggah ke GitHub)
│   ├── Kode.gs
│   └── appsscript.json
└── frontend/                 ← ✅ folder repo GitHub — git init DI SINI
    ├── index.html
    ├── .nojekyll
    ├── README.md
    ├── PANDUAN-INSTALASI.md
    ├── css/style.css
    └── js/
        ├── config.js         ← isi GAS_URL
        ├── api.js
        └── app.js
```

| Folder / berkas | Tempat | Isi |
|---|---|---|
| `backend/Kode.gs` | Editor Apps Script | Backend REST API: login & sesi, RBAC, rekap, PDF, surel, WhatsApp, log audit |
| `backend/appsscript.json` | Editor Apps Script (opsional) | Zona waktu Jakarta + setelan Web App (Execute as Me · Anyone) |
| `frontend/` | Repo GitHub → GitHub Pages | `index.html`, `css/`, `js/`, README, salinan panduan ini |

> ⚠️ **Folder `slip-gaji-yasma/` (induk) BUKAN repo.** Bila `git init` dijalankan di folder induk, yang terunggah adalah folder `backend/` + `frontend/` dan situs GitHub Pages menjadi **404** tanpa pesan galat apa pun. Repo selalu dibuat dari **`frontend/`**.

> **Yang berubah dari v1.1:** URL `/exec` sekarang hanya **API JSON** (tidak menampilkan halaman). Pegawai & admin membuka aplikasi di **alamat GitHub Pages**. Tautan pribadi WhatsApp juga mengarah ke alamat GitHub Pages. Login, peran, PIN, tautan pribadi, pengiriman 350 WhatsApp — semuanya tetap sama.
>
> 🔗 **Frontend aktif: https://slipgaji-blush.vercel.app** — tautan pribadi di pesan WhatsApp & surel otomatis berbentuk `https://slipgaji-blush.vercel.app/?s=…` (diatur di `Kode.gs` → `FRONTEND_URL_DEFAULT`). Kolom *Pengaturan → URL Aplikasi* cukup dibiarkan kosong; isi hanya bila alamat frontend pindah.

---

## Bagian A — Backend (Google Apps Script)

Pilih **A1** bila aplikasi v1.1 sudah berjalan (disarankan — data tidak perlu dipindah), atau **A2** untuk instalasi baru.

### A1. Migrasi dari v1.1 (proyek Apps Script yang sudah ada)
Data, akun, pengaturan, token WhatsApp, Script Properties, dan pemicu **tetap utuh** — hanya kode yang diganti.

1. Buka https://script.google.com → proyek **Slip Gaji Yasma** yang lama.
2. Klik file `Kode.gs` → hapus seluruh isinya → tempel isi **`backend/Kode.gs`** v2.0 (buka dengan Kate / Notepad, Ctrl+A, Ctrl+C) → **Ctrl+S**.
3. Hapus tiga file HTML lama (tidak dipakai lagi): klik titik tiga di samping `Index`, `Stylesheet`, `JavaScript` → **Delete**.
4. (Opsional) ⚙️ **Project Settings** → centang *Show "appsscript.json" manifest file in editor* → buka `appsscript.json` → ganti isinya dengan **`backend/appsscript.json`** → Simpan.
5. **Deploy → Manage deployments** → pilih deployment aktif → ikon ✏️ **Edit**:
   - *Version*: **New version**
   - *Execute as*: **Me**
   - *Who has access*: **Anyone** ← wajib persis ini
   - Klik **Deploy**. URL `/exec` **tetap sama** seperti sebelumnya.
6. Uji: buka URL `/exec` di browser → harus tampil teks JSON seperti `{"success":true,"data":{"ready":true,…}}`.
7. Pilih fungsi `setupAppEnvironment` → **▶ Run** sekali → membuat akun admin unit baru **`adm-non-pend`** (unit ke-7 *Non Pendidikan*, sandi `Sekolah#2026`, wajib diganti saat login pertama). Data lain tidak berubah dan aman dijalankan ulang.

> ⚠️ **Akses harus "Anyone"**, bukan *Anyone with Google account* atau *Anyone within domain*. Selain "Anyone", Google meminta login di halaman perantara, sehingga `fetch()` dari GitHub Pages gagal (galat CORS). Data tetap aman: setiap aksi diperiksa token sesi & perannya di server.
>
> ⚠️ Tautan WhatsApp yang pernah dikirim versi 1.1 (berisi `/exec?s=…`) tidak berlaku lagi. Lakukan migrasi **sebelum** pengiriman slip berikutnya.

### A2. Instalasi baru
1. Masuk dengan **akun Google Workspace yayasan** (kuota surel ±1.500/hari; Gmail gratis hanya ±100/hari).
2. https://script.google.com → **Proyek Baru** → beri nama "Slip Gaji Yasma".
3. Ganti isi `Code.gs` dengan **`backend/Kode.gs`**, lalu ganti nama file menjadi `Kode`.
4. (Opsional) Tempel **`backend/appsscript.json`** seperti langkah A1-4. Bila tidak, set zona waktu di ⚙️ Project Settings → **(GMT+07:00) Jakarta**.
5. Pilih fungsi `setupAppEnvironment` → **▶ Run** → izinkan akses (Sheets, Drive, Gmail, pemicu, *Connect to an external service*).
   - **Execution log** menampilkan URL folder *Arsip Slip Gaji Yasma*, spreadsheet *DB_SlipGaji*, dan akun admin awal:
     - Admin Yayasan: `admin` / `Admin#2026`
     - Admin unit: `adm-sma` (juga `adm-tk`, `adm-sd`, `adm-smp`, `adm-smk-1`, `adm-smk-2`, `adm-non-pend`) / `Sekolah#2026`
   - Database dimulai **kosong** (tanpa data contoh): belum ada pegawai, periode, maupun slip. Isi data pegawai asli lewat *Data Pegawai → Templat Impor*.
   - Aman dijalankan ulang (tidak menggandakan data). ID spreadsheet/folder & kunci rahasia tersimpan di **Script Properties**.
6. **Deploy → New deployment** → ⚙️ *Select type* → **Web app** → *Execute as*: **Me** · *Who has access*: **Anyone** → **Deploy** → **salin URL `/exec`**.

---

## Bagian B — Frontend ke GitHub Pages (langkah demi langkah)

> Istilah singkat: **repository (repo)** = folder proyek di GitHub · **commit** = menyimpan perubahan dengan catatan · **push** = mengirim commit ke GitHub · **branch** = cabang proyek (kita pakai `main`).

### B1. Ekstrak ZIP lalu masuk ke folder `frontend`
Folder kerja Git adalah **`slip-gaji-yasma/frontend`** — bukan folder induk `slip-gaji-yasma`.

**Linux (Bazzite · Konsole):**
```bash
mkdir -p ~/Documents/slip-gaji-yasma
unzip ~/Downloads/slip-gaji-yasma.zip -d ~/Documents/slip-gaji-yasma
cd ~/Documents/slip-gaji-yasma/frontend
```
Lalu periksa isinya:
```bash
ls -la
```
**Windows:** klik kanan `slip-gaji-yasma.zip` → *Extract All…* → buka folder `slip-gaji-yasma` → buka folder **`frontend`** → klik address bar → ketik `powershell` → Enter → `dir`.

Hasil `ls -la` / `dir` **wajib** menampilkan langsung:
```
.nojekyll   README.md   PANDUAN-INSTALASI.md   index.html   css/   js/
```
- Bila yang terlihat `backend/` dan `frontend/` → Anda masih di folder induk: jalankan `cd frontend` dulu.
- Tidak boleh ada file `.gs` di folder ini (file backend ada di `../backend/`).

### B2. Isi URL backend di `js/config.js` (WAJIB sebelum push)
Buka `js/config.js` (Linux: `nano js/config.js` atau buka dengan **Kate**; Windows: Notepad), ganti:
```js
const GAS_URL = 'https://script.google.com/macros/s/XXXX/exec';
```
dengan URL `/exec` dari Bagian A. Simpan (nano: **Ctrl+O**, Enter, **Ctrl+X**).

### B3. Pasang Git
- **Linux (Bazzite):** cek dulu `git --version`. Bila belum ada: `brew install git` (Homebrew sudah terpasang bawaan di Bazzite).
- **Windows:** unduh https://git-scm.com/download/win → install dengan pilihan bawaan → buka **PowerShell** atau **Git Bash**.

Verifikasi:
```bash
git --version
```

### B4. Akun GitHub & identitas Git (sekali saja per komputer)
Daftar di https://github.com (username menjadi bagian alamat situs: `USERNAME.github.io`). Lalu:
```bash
git config --global user.name "Nama Lengkap Anda"
git config --global user.email "email-akun-github@contoh.com"
```
`user.name` hanya label di riwayat commit (bukan username GitHub).

### B5. Buat repository baru di GitHub
github.com → tombol **+** → **New repository**:
- *Repository name*: `slip-gaji-yasma`
- **Public** (GitHub Pages gratis hanya untuk repo publik — aman, repo ini tidak berisi rahasia/data gaji)
- **JANGAN** centang *Add a README*, *.gitignore*, atau *license*
- **Create repository** → biarkan halaman instruksinya terbuka.

### B6. Push pertama (jalankan satu per satu dari folder `slip-gaji-yasma/frontend`)
```bash
git init
git add .
git commit -m "Upload pertama Slip Gaji v2.0"
git branch -M main
git remote add origin https://github.com/USERNAME/slip-gaji-yasma.git
git push -u origin main
```
- `git add .` — perhatikan **titik** di akhir.
- Saat `git push` meminta **Username**: username GitHub. **Password**: tempel **Personal Access Token** (bukan sandi akun). Saat menempel, layar **memang tidak menampilkan apa pun** — itu normal. Konsole: **Ctrl+Shift+V**; PowerShell: klik kanan.
- Sukses bila muncul `Writing objects: 100%` dan `* [new branch] main -> main`.

**Membuat Personal Access Token** (bila diminta / muncul *Password authentication is not supported*):
1. https://github.com/settings/tokens → **Generate new token (classic)**
2. *Note*: `git-push-token` · *Expiration*: 90 days · centang scope **repo**
3. **Generate token** → salin `ghp_…` (hanya tampil sekali) → ulangi `git push -u origin main` → tempel sebagai password.

> Alternatif tanpa token manual: **GitHub Desktop** (Windows/Mac) → *Add Local Repository* → pilih folder → *Publish repository*.

### B7. Aktifkan GitHub Pages
1. Buka `https://github.com/USERNAME/slip-gaji-yasma` → pastikan `index.html`, folder `css/` dan `js/` terlihat di root (tidak ada file `.gs`).
2. **Settings** → **Pages**: *Source* **Deploy from a branch** · *Branch* **main** · **/ (root)** → **Save**.
3. Centang **Enforce HTTPS**.
4. Tunggu 1–2 menit → muncul *Your site is live at* **`https://USERNAME.github.io/slip-gaji-yasma/`**.

---

## Bagian C — Hubungkan & uji
1. Buka **https://slipgaji-blush.vercel.app** → masuk sebagai **Admin Yayasan**.
2. **Pengaturan → Identitas Yayasan**: pastikan keterangan di bawah kolom *URL Aplikasi* berbunyi *Tautan pribadi WhatsApp & surel memakai: https://slipgaji-blush.vercel.app/?s=…*. Bila kolom berisi alamat lain (mis. GitHub Pages atau URL `/exec` lama), **kosongkan** → **Simpan Pengaturan**.
3. **Pengaturan → WhatsApp Gateway → Uji Kirim** → pesan uji berisi alamat Portal Pegawai (GitHub Pages).
4. Satu siklus **Mode Uji**: unggah rekap → Kirim Slip via WhatsApp → buka tautan dari HP → slip langsung terbuka di akun pegawai.
5. Tekan **F12 → Console / Network** di browser: tidak boleh ada galat CORS atau 404.

## Bagian D — (Opsional) Tombol "Masuk dengan Google"
Versi GitHub Pages memakai **Google Identity Services**. Tanpa langkah ini, tombol Google disembunyikan dan login NRP + kata sandi tetap berfungsi.
1. https://console.cloud.google.com → pilih/buat proyek → **APIs & Services → OAuth consent screen** → isi nama aplikasi & email (tipe *Internal* bila Workspace, *External* bila bukan).
2. **Credentials → Create credentials → OAuth client ID** → *Application type*: **Web application**.
3. *Authorized JavaScript origins*: `https://slipgaji-blush.vercel.app` (tanpa garis miring di akhir) → **Create** → salin **Client ID** (`…apps.googleusercontent.com`).
4. Aplikasi → **Pengaturan → Identitas Yayasan → Login Google (opsional)** → tempel → **Simpan Client ID**.
5. Server memverifikasi token Google lalu mencocokkan **email akun Google** dengan kolom Email di *Data Pegawai / Kelola Akun*. Client ID disimpan di Script Properties (`GOOGLE_CLIENT_ID`).

## Bagian E — Update / redeploy
- **Frontend** (setiap mengubah file di folder `slip-gaji-yasma/frontend`, jalankan dari folder itu):
  ```bash
  git add .
  git commit -m "Deskripsi singkat perubahan"
  git push
  ```
  GitHub Pages membangun ulang dalam 1–2 menit. Masih tampil versi lama → **Ctrl+Shift+R** atau jendela Incognito.
  **Vercel** (`slipgaji-blush.vercel.app`): bila proyek Vercel terhubung ke repo GitHub, `git push` otomatis memicu deploy baru. Bila dulu diunggah lewat Vercel CLI, jalankan `vercel --prod` dari folder `frontend`.
- **Backend** (setiap mengubah `backend/Kode.gs`, tempel ulang ke editor Apps Script): **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. URL `/exec` tetap sama, jadi `js/config.js` tidak perlu diubah.

## Bagian F — Troubleshooting

| Yang terlihat | Penyebab | Solusi |
|---|---|---|
| Halaman masuk: **"URL backend belum diisi"** | `GAS_URL` masih `XXXX` | Edit `js/config.js`, lalu `git add . && git commit -m "isi GAS_URL" && git push` |
| **"Server Apps Script tidak mengembalikan JSON"** | Akses deployment bukan *Anyone*, URL `/dev`, atau deployment lama | Deploy → Manage deployments → Edit → Anyone + New version; pakai URL `/exec` |
| Console: **CORS** / *Failed to fetch* | Sama seperti di atas, atau internet putus | Buka URL `/exec` di tab baru: harus JSON. Bila muncul halaman login Google → akses belum *Anyone* |
| Situs **404** di GitHub Pages, repo GitHub berisi folder `backend/` + `frontend/` | `git init` dijalankan di folder induk `slip-gaji-yasma` | `cd frontend` → `git init` → `git add .` → `git commit -m "Fix: push dari frontend"` → `git branch -M main` → `git remote add origin …` → `git push -u origin main --force` (menimpa isi repo yang salah) |
| Halaman tanpa warna/gaya, CSS/JS **404** | File diunggah lewat web GitHub sehingga folder `css/` `js/` hilang | Push lewat terminal; jangan memakai *Upload files* di web |
| Tautan WA membuka JSON / alamat lama | *Pengaturan → URL Aplikasi* berisi alamat lama, atau `Kode.gs` belum versi terbaru | Kosongkan *URL Aplikasi* (bawaan: https://slipgaji-blush.vercel.app/), pastikan deployment Apps Script **New version**, lalu kirim ulang slip |
| Tombol Google tidak muncul | Client ID belum disimpan / peramban memblokir skrip Google | Bagian D; gunakan login NRP + sandi |
| *Password authentication is not supported* | GitHub menolak sandi akun | Pakai Personal Access Token (B6) |
| `remote origin already exists` | `git remote add` pernah dijalankan | Lewati, atau `git remote set-url origin https://github.com/USERNAME/slip-gaji-yasma.git` |
| `Updates were rejected` | Repo GitHub dibuat dengan README | `git pull --rebase origin main` lalu `git push` |

---

## Lampiran — Fitur & operasional aplikasi

### L0. Daftar unit (7 unit)

| Kode unit | Nama di slip & pesan | Akun admin unit |
|---|---|---|
| `TK` | TK Islam PB. Soedirman | `adm-tk` |
| `SD` | SD Islam PB. Soedirman | `adm-sd` |
| `SMP` | SMP Islam PB. Soedirman | `adm-smp` |
| `SMA` | SMA Islam PB. Soedirman | `adm-sma` |
| `SMK-1` | SMK-1 PB. Soedirman | `adm-smk-1` |
| `SMK-2` | SMK-2 PB. Soedirman | `adm-smk-2` |
| **`NON-PEND`** | **Non Pendidikan** (staf yayasan, keuangan, satpam, kebersihan, sopir, dll.) | **`adm-non-pend`** |

- Di Excel (impor pegawai & rekap gaji), kolom **Unit** boleh ditulis `NON-PEND`, `Non Pendidikan`, `non-pendidikan`, atau `NONPEND` — semuanya dibaca sebagai unit Non Pendidikan. `smk 1` / `SMK1` dibaca `SMK-1`.
- Pegawai unit Non Pendidikan otomatis dianggap **Karyawan** (usia pensiun 58 tahun), kecuali jabatannya berisi "Guru".
- Admin unit Non Pendidikan (`adm-non-pend`) memakai peran *Admin Sekolah*: hanya melihat pegawai & status kirim unitnya, tanpa nominal gaji.
- **Instalasi yang sudah berjalan (6 unit):** setelah menempel `Kode.gs` terbaru, jalankan **`setupAppEnvironment` sekali** → akun `adm-non-pend` dibuat (sandi `Sekolah#2026`, **wajib diganti** saat login pertama). Data lain tidak berubah. Alternatif: *Kelola Akun → Tambah Akun Admin* → peran Admin Sekolah, unit **Non Pendidikan**.
- Unit baru langsung muncul di semua filter, grafik dasbor, templat impor, progres pengiriman, dan Monitoring Unit (frontend mengambil daftar unit dari backend).

### L1. Sebelum produksi (penting)
- **Ganti sandi bawaan** akun admin (menu *Ganti Sandi*).
- Isi **Pengaturan → Identitas Yayasan** (telepon, surel keuangan, WhatsApp TU) dan **Penanda Tangan Slip** (nama bendahara) dengan data asli. Nama bendahara kosong secara bawaan, jadi slip menampilkan garis isian sampai nama diisi.

### L1a. Mengosongkan data contoh (instalasi lama)
Versi sebelumnya membuat **data contoh** saat `setupAppEnvironment` pertama dijalankan: 36–42 pegawai fiktif beserta akunnya, dan 5 periode (THR Juni, Bulanan Juli–Oktober 2026) beserta slipnya. Versi ini **tidak lagi membuat data contoh**. Untuk mengosongkan data contoh yang sudah terlanjur ada:
1. Tempel `Kode.gs` terbaru di editor Apps Script → **Simpan**.
2. Pada daftar fungsi di toolbar, pilih **`hapusDataContoh`** → **▶ Run** (cukup sekali).
3. Baca **Execution log**: jumlah pegawai, akun, periode, dan slip contoh yang dihapus, serta sisa pegawai asli.
4. Muat ulang aplikasi di peramban (**Ctrl+Shift+R**).

Yang dihapus hanya data contoh: periode bertanda *Data Contoh* beserta slip dan jejak aksesnya, serta pegawai yang **NRP dan namanya persis sama** dengan data contoh, beserta akun portalnya. Nama akun admin contoh diganti menjadi *Admin Yayasan* (sandi tetap). Nama bendahara contoh dikosongkan.

Yang **tidak** disentuh: pegawai, periode, dan slip asli; akun admin; Pengaturan lain; logo; token WhatsApp; Log Audit. Pegawai contoh yang sudah ditimpa data asli lewat impor (namanya sudah berbeda) juga tidak ikut terhapus.

Cadangan CSV pegawai yang dihapus tersimpan di folder Drive *Cadangan Data Pegawai*. Fungsi ini aman dijalankan ulang: bila sudah bersih, log menampilkan *"Tidak ada data contoh — database sudah bersih"*. Bila pengiriman slip sedang berjalan, jalankan setelah pengiriman selesai atau dijeda.
- **Mode Uji = Ya** secara bawaan → semua surel slip dikirim ke pemilik skrip dan hanya **5 WhatsApp pertama** dikirim ke *Nomor penerima saat Mode Uji* (kosong = WhatsApp TU); sisanya disimulasikan. Isi **WhatsApp TU** dengan nomor asli, uji dulu satu siklus (buka tautan dari pesan uji di HP), lalu ubah ke **Tidak** di menu *Pengaturan*.
- Isi data pegawai: menu *Data Pegawai → **Templat Impor***:
  - **Templat kosong** — untuk pegawai baru (berisi 2 baris contoh `CONTOH-…` yang otomatis diabaikan, plus sheet *Petunjuk*).
  - **Templat + data pegawai saat ini** — unduh, ubah massal, lalu impor kembali (NRP yang sudah ada diperbarui, NRP baru ditambahkan).
  - Kolom NRP & rekening sudah berformat **Teks**, jadi nol di depan NRP tidak hilang. Unggah lewat **Impor Excel**; baris yang salah dilaporkan beserta nomor baris Excel-nya.
  - Setelah impor, klik **Kirim Kredensial** agar pegawai baru menerima sandi sementara. (Opsional bagi pegawai yang menerima slip lewat WhatsApp: akun bisa diaktifkan sendiri dari tautan pribadi.)
- Hapus data pegawai (Admin Yayasan, menu *Data Pegawai*):
  - **Per orang**: tombol 🗑 di kolom Aksi. Untuk pegawai keluar/pensiun lebih baik pakai **Nonaktifkan** (bisa diaktifkan lagi).
  - **Per unit / Semua**: tombol **Hapus Data** → wajib mengetik `HAPUS <UNIT>` / `HAPUS SEMUA` dan memasukkan kata sandi Anda (diperiksa di server).
  - Sebelum menghapus, cadangan Excel (format templat impor) diunduh otomatis dan cadangan CSV disimpan di Drive (*Arsip Slip Gaji Yasma › Cadangan Data Pegawai*). Pemulihan = impor ulang berkas cadangan.
  - Akun portal pegawai ikut terhapus; **riwayat slip & PDF tetap diarsipkan**. Akun admin tidak tersentuh. Penghapusan diblok selama pengiriman slip berjalan dan tercatat di Log Audit (tingkat Kritis).

### L2. Komponen gaji (templat rekap & slip)
| Komponen Penghasilan (Rp) | Komponen Potongan (Rp) |
|---|---|
| Gapok | Pinjaman YYS |
| Tunjangan Kerja | **Pinjaman Sekolah** *(baru)* |
| Tunjangan Keluarga | Potongan Transport |
| Tunjangan Jabatan | **Bon Lama** *(baru)* |
| Tunjangan Beras | Bon Baru |
| Tunjangan Kesra | PSB |
| **Gaji Kotor** *(subtotal)* | DPLK |
| Transport Kehadiran | Cicilan Rumah |
| | SIMPIN PNS |
| | PPh 21 |

- **Pinjaman Sekolah** dan **Bon Lama** ikut dijumlahkan ke **Total Potongan** dan mengurangi THP. Judul kolom Excel fleksibel: `Pinjaman Sekolah`, `PINJAMAN SEKOLAH (Rp)`, `Pinj. Sekolah`, `Bon Lama`, `BON LAMA (Rp)`.
- Aplikasi yang sudah berjalan otomatis memakai daftar potongan baru **bila daftar potongan di Pengaturan belum pernah diubah**. Bila sudah pernah diubah: *Pengaturan → Komponen Gaji → Komponen potongan* → sisipkan `Pinjaman Sekolah` dan `Bon Lama` (pisahkan koma) → Simpan, lalu unduh templat rekap yang baru.

- **Gaji Kotor = Gapok + Tunjangan Kerja + Keluarga + Jabatan + Beras + Kesra** (rumus otomatis di templat). Nilainya **tidak dijumlahkan lagi**, jadi **Total Penghasilan = Gaji Kotor + Transport Kehadiran** dan **THP = Total Penghasilan − Total Potongan**.
- Kolom Gaji Kotor boleh dikosongkan (dihitung sistem). Bila diisi tetapi berbeda dengan jumlah rinciannya → anomali ringan di halaman Pratinjau. Bila **hanya** Gaji Kotor yang diisi (rincian kosong), nilainya dipakai langsung.
- Komponen kosong/0 tetap tampil di slip sebagai "-". Nama kolom fleksibel (mis. `GAPOK (Rp)`, `Gaji Pokok`, `Tunj Keluarga`) dan slip selalu memakai nama resmi di atas.
- **PPh 21** diisi nominalnya di Excel (tidak dihitung otomatis oleh aplikasi). Judul kolom `PPh21`, `PPh Pasal 21`, atau `Pajak Penghasilan` juga dikenali.
- Daftar & urutan komponen dapat diubah di menu **Pengaturan → Komponen Gaji** tanpa mengubah kode. Aplikasi yang sudah ter-deploy otomatis memakai komponen baru (kecuali admin sudah mengubahnya sendiri).

#### Data pegawai: No. WhatsApp, Tanggal Lahir, Tahun Masuk & Pensiun
- Isi di formulir pegawai atau templat impor: **No. WhatsApp** (mis. `0812-3456-7890`, disimpan otomatis sebagai `62…`), **Jenis Pegawai** (Guru/Karyawan), **Tanggal Lahir** (`DD/MM/YYYY`), dan **Tahun Masuk** (4 digit, mis. `2008`).
- **Lama Kerja = tahun sekarang − tahun masuk** (dihitung otomatis).
- **Tanggal Pensiun = tanggal lahir + usia pensiun**: Guru **60 tahun**, Karyawan/Tendik **58 tahun** (dapat diubah di *Pengaturan → Kepegawaian*). Jenis pegawai ditebak dari jabatan/status bila kosong, dan bisa diubah manual.
- **Dasbor Pegawai** (*Slip Saya*) menampilkan kartu *Info Kepegawaian*: Tahun Masuk, Lama Kerja, Tanggal Pensiun (+ sisa waktu), dan No. WhatsApp. Admin Yayasan melihat kolom *Masuk · Pensiun* dan KPI *Pensiun ≤ 12 Bulan* di Data Pegawai.
- Slip mencetak **Tahun Masuk** (mis. `2008 (18 th)`); tanggal lahir & No. WhatsApp tidak dicetak. Admin Sekolah melihat tahun masuk & No. WhatsApp (tombol WhatsApp di Dasbor Unit), tetapi tidak tanggal lahir/tanggal pensiun.
- Spreadsheet yang sudah berjalan otomatis mendapat kolom `TahunMasuk`, `NoWA`, `JenisPegawai`; data TMT versi sebelumnya otomatis dibaca sebagai Tahun Masuk. Tidak perlu setup ulang.

#### PIN dokumen 6 digit (menu Keamanan & Akun Pegawai)
- **Membuat/mengganti PIN**: pegawai buka **Keamanan & PIN (W-02)** → isi *Kata Sandi Saat Ini* (verifikasi) → isi 6 kotak **PIN baru** dan **Ulangi PIN** → *Simpan Perubahan*. Kata sandi baru **boleh dikosongkan** bila hanya ingin mengganti PIN (dan sebaliknya).
- Kotak PIN: ketik angka langsung berpindah ke kotak berikutnya; bisa menimpa angka, `Backspace`/`Delete`, panah kiri-kanan, dan tempel (paste) 6 digit sekaligus. Tombol **Tampilkan/Sembunyikan** untuk memeriksa angka. PIN ditolak bila sama dengan tanggal lahir (DDMMYY), angka sama semua (111111), atau berurutan (123456/654321).
- Pegawai yang **belum punya PIN** lalu menekan Unduh slip otomatis diarahkan ke menu Keamanan untuk membuat PIN.
- **Lupa PIN**: pegawai menghubungi TU → Admin Yayasan/Admin Sekolah unitnya membuka **Data Pegawai** atau **Kelola Akun** → tombol **Reset PIN** (ikon `123`) → PIN lama dihapus (tercatat di log audit). Pegawai lalu masuk dengan kata sandinya dan membuat PIN baru di menu Keamanan — kata sandi tidak perlu diganti.
- Kolom *Akun Portal* (Data Pegawai) dan *Keamanan* (Kelola Akun) menampilkan status **PIN ✓** / **Tanpa PIN**.

### L3. Pengiriman slip: Email, WhatsApp, atau keduanya
Pilih metode di halaman **Pratinjau & Kirim (W-05)** — kartu *Metode Pengiriman Slip* (juga ada di *Pengaturan → Pengiriman*):

| Metode | Isi yang dikirim | Kontak yang wajib valid |
|---|---|---|
| **Email** | Surel + rincian gaji + **lampiran PDF** + tombol *Lihat Slip di Akun Saya* | Surel pegawai |
| **WhatsApp** | **Hanya pemberitahuan** bahwa slip telah terbit + **tautan pribadi** ke akun pegawai (tanpa nominal, tanpa PDF) | No. WhatsApp di Master Pegawai |
| **Email + WhatsApp** | Keduanya sekaligus (satu tautan pribadi yang sama) | Cukup salah satu; kanal yang kontaknya kosong **dilewati** |

- Validasi anomali mengikuti metode: pada metode WhatsApp, No. WA kosong/tidak valid jadi *anomali ringan* (tombol **Perbaiki No. WA** langsung memperbarui Master Pegawai).
- Slip yang sudah terkirim di satu kanal **tidak dikirim ganda**. **Kirim ulang** satu slip / semua yang gagal hanya mengulang kanal yang gagal.
- Status per kanal tampil di Pratinjau, Progress, Riwayat, dan Monitoring Unit, ditambah status **👁 Dilihat** begitu pegawai membuka slipnya.

#### Isi pesan WhatsApp (pemberitahuan + tautan pribadi)
Contoh pesan bawaan yang diterima pegawai:

```
Assalamu'alaikum warahmatullahi wabarakatuh.

Yth. Bapak/Ibu *Siti Anggraini, M.Pd.* (NRP 1987020001)
SD Islam PB. Soedirman

Slip *Gaji Reguler November 2026* Anda telah terbit dan dapat dilihat di akun Portal Pegawai.

👉 Buka slip Anda (tautan pribadi, berlaku 14 hari):
https://username.github.io/slip-gaji-yasma/?s=Xy7…(32 karakter acak)

Slip juga dapat dilihat kapan saja dengan masuk ke akun Anda menggunakan NRP & kata sandi. Unduhan PDF memakai PIN dokumen.

Tautan ini khusus untuk Anda, mohon tidak diteruskan kepada siapa pun.
_Bendahara YASMA PB. Soedirman_
```

- Ubah teks di **Pengaturan → WhatsApp Gateway → Isi pesan WhatsApp**. Placeholder: `{{nama}} {{nrp}} {{unit}} {{periode}} {{jenis}} {{link}} {{masa}} {{url}} {{yayasan}} {{tu}}` (`{{link}}` = tautan pribadi, `{{masa}}` = hari berlaku, `{{url}}` = alamat portal umum). Format `*tebal*`, `_miring_`.
- **Nominal gaji tidak pernah dikirim lewat WhatsApp**: baris yang berisi `{{rincian}}`, `{{pdf}}`, `{{thp}}`, `{{bruto}}`, atau `{{potongan}}` dibuang otomatis. Bila `{{link}}` lupa ditulis, tautan ditambahkan otomatis di akhir pesan.
- Templat bawaan versi sebelumnya yang belum diubah otomatis diganti templat baru ini.
- Klik **Pratinjau isi pesan** (kartu Metode di W-05, ikon 💬 tiap baris, atau *Pratinjau Pesan* di Pengaturan) untuk melihat pesan sebelum dikirim (tautan di pratinjau hanya contoh).
- Surel tetap bisa memuat rincian gaji + PDF (*Pengaturan → Pengiriman → Isi SUREL memuat jumlah gaji*).

#### Dua cara pegawai melihat slip
1. **Lewat tautan WhatsApp** — pegawai mengetuk tautan pribadinya → slip langsung terbuka di akun **Slip Saya** (tanpa mengetik NRP/sandi). Tautan unik per pegawai per pengiriman, berlaku **14 hari** (ubah di *Pengaturan → Masa berlaku tautan*, 1–90 hari).
2. **Masuk langsung ke akun** — buka Portal Pegawai, masuk dengan **NRP + kata sandi** (atau akun Google yayasan) → menu *Slip Saya*. Cara ini selalu tersedia, termasuk setelah tautan kedaluwarsa (membuka tautan lama menampilkan halaman masuk dengan NRP sudah terisi, lalu slip langsung dibuka setelah masuk).

Catatan tautan pribadi:
- **Pengaturan → Tautan pribadi di WhatsApp**: `Langsung` (bawaan) = tautan langsung membuka slip; `Wajib sandi` = tautan hanya mengisi NRP, pegawai tetap memasukkan kata sandi (lebih ketat bila HP sering dipinjam).
- **Unduh PDF tetap memakai PIN dokumen.** Pegawai yang belum pernah login (sandi sementara tidak diketahui) bisa **mengaktifkan akun** dari sesi tautan: menu *Keamanan* → buat kata sandi + PIN tanpa sandi lama. Setelah aktif, berikutnya ia bisa masuk langsung dengan NRP & sandi. (Jadi *Kirim Kredensial* lewat surel tidak wajib lagi bagi pegawai yang hanya memakai WhatsApp.)
- Yang disimpan di spreadsheet hanya **hash** tautan (kolom `HashTautan`, `TautanSampai`), bukan tautannya. Kirim ulang membuat tautan baru (3 tautan terakhir tetap berlaku). Tautan otomatis ditolak bila pegawai/akun dinonaktifkan atau akun sedang terkunci. Setiap pembukaan tercatat di Log Audit dan sheet `AksesSlip`.
- Tautan memakai **alamat frontend https://slipgaji-blush.vercel.app/** (bukan URL `/exec`), diatur di `Kode.gs` → `FRONTEND_URL_DEFAULT`. Untuk memakai alamat lain, isi **Pengaturan → Identitas Yayasan → URL Aplikasi**; kosongkan kolom itu untuk kembali ke alamat Vercel.

#### Menyiapkan WhatsApp Gateway (Fonnte)
1. Daftar di **fonnte.com** → *Add Device* dengan nomor WhatsApp pengirim (disarankan nomor khusus TU, bukan nomor pribadi).
2. Klik *Connect* → pindai QR dari aplikasi WhatsApp di HP → salin **Token** perangkat.
3. Aplikasi → **Pengaturan → WhatsApp Gateway (Fonnte)** → tempel token → **Simpan Token** → **Uji Kirim** (pesan uji dikirim ke nomor uji / WhatsApp TU).
   - Token disimpan di **Script Properties** (`WA_TOKEN`), tidak di spreadsheet dan tidak pernah dikirim kembali ke browser (hanya tampil `••••1234`).
4. Pesan WhatsApp hanya **teks** (tanpa lampiran), jadi berjalan di semua paket Fonnte. Pastikan **kuota pesan paket** cukup untuk jumlah pegawai (mis. ≥ 350 per pengiriman + kirim ulang).

#### Mengirim ke ±350 nomor guru & karyawan
- Pesan dikirim **satu per satu** dengan jeda acak **3–4,5 detik** (*Jeda antarpesan*, bawaan 3) agar nomor pengirim aman dari blokir WhatsApp. Setiap pesan berbeda (nama + tautan unik), sehingga tidak terlihat seperti pesan massal identik.
- **Perkiraan waktu 350 nomor: ± 30 menit.** Browser boleh ditutup — pemicu server melanjutkan tiap menit (±50 pesan per putaran ±4 menit); progres disimpan tiap 5 slip, jadi bila eksekusi terhenti tidak ada pesan terkirim ganda.
- Selama pengiriman, pegawai yang sudah menerima pesan **bisa langsung membuka tautan / login** — worker tidak lagi mengunci sistem.
- Tips anti-blokir: minta pegawai menyimpan nomor TU di kontak, pakai nomor pengirim yang sudah aktif lama, hindari mengirim ulang massal berulang di hari yang sama.
- Bila token salah, perangkat terputus, atau kuota Fonnte habis, pengiriman **dijeda otomatis** (slip tetap di antrean, tidak dihitung gagal) dan alasannya tampil di halaman Progress. Perbaiki lalu klik **Lanjutkan Pengiriman**. Nomor yang ditolak gateway ditandai gagal per slip dan bisa dikirim ulang setelah nomornya diperbaiki.
- **Mode Uji = Ya**: hanya **5 WhatsApp pertama** yang benar-benar dikirim ke *Nomor penerima saat Mode Uji* (atau WhatsApp TU); sisanya **disimulasikan** (ditandai `[UJI] Disimulasikan`) supaya nomor uji & kuota Fonnte tidak dibanjiri 350 pesan.
- **Dasbor Unit / Monitoring** menampilkan KPI **Slip Sudah Dilihat** dan kolom *Dilihat Pegawai*, sehingga TU tahu siapa yang belum membuka slipnya.

### L4. Siklus bulanan (Admin Yayasan)
1. **Unggah Rekap (W-04)** → pilih bulan, tahun, jenis → **Unduh Templat** (berisi semua pegawai aktif + rumus Gaji Kotor & THP) → isi nominal → unggah.
2. **Pratinjau & Kirim (W-05)** → pilih **metode kirim** (Email / WhatsApp / Email + WhatsApp) → perbaiki anomali (Daftarkan pegawai, Perbaiki surel / No. WA, Setujui) → **Kirim Slip**.
3. **Progress (W-06)** → pantau real-time per kanal. Bila browser ditutup, pemicu server melanjutkan tiap 1 menit (350 WhatsApp ± 30 menit); bila kuota surel habis, WhatsApp tetap jalan dan surel otomatis lanjut setelah kuota direset.
4. **Monitoring Unit (W-11)** → cek KPI *Slip Sudah Dilihat*; ingatkan pegawai yang belum membuka slip lewat tombol WhatsApp di baris pegawai.
5. Koreksi setelah terkirim → unggah dengan jenis **Revisi Gaji Reguler** (slip lama tetap tersimpan; pegawai menerima tautan baru).

**Jenis pembayaran** (menu *Unggah Rekap Gaji*):

| Jenis | Kegunaan | Kolom nominal di templat |
|---|---|---|
| **Gaji Reguler** | Gaji bulanan | Komponen penghasilan & potongan dari Pengaturan |
| **Gaji THR** | Tunjangan Hari Raya | `THR` |
| **Gaji Bonus 13** | Gaji ke-13 | `Bonus 13` |
| **Revisi Gaji Reguler** | Koreksi slip Gaji Reguler yang sudah terkirim (otomatis bernomor #1, #2, …) | Sama dengan Gaji Reguler |

Nama jenis tampil di slip PDF (mis. *SLIP GAJI THR*), subjek surel, pesan WhatsApp, dan Portal Pegawai. Periode lama otomatis ikut memakai nama baru (ID periode seperti `2026-11-BULANAN` tidak berubah). Subjek surel bawaan menjadi `Slip {{jenis}} {{periode}}`; templat lama yang menulis "Slip Gaji {{jenis}}" otomatis tidak menjadi "Gaji Gaji".

### L5. Logo yayasan
**Pengaturan → Identitas Yayasan → Logo Yayasan → Unggah Logo** (Admin Yayasan).
- Format PNG, JPG, atau WebP (maks. 5 MB). Gambar otomatis dibuat persegi dan dioptimalkan (320 px) di browser sebelum diunggah; PNG berlatar transparan memberi hasil paling rapi.
- Logo langsung dipakai di sidebar, halaman masuk, topbar ponsel, **kop slip PDF**, dan **kepala surel** (gambar inline, tetap tampil di Gmail).
- Berkas disimpan di Drive (*Arsip Slip Gaji Yasma › Logo Yayasan*); logo lama dipindah ke sampah saat diganti. **Hapus Logo** mengembalikan emblem bawaan. Unggah/hapus tercatat di Log Audit.
- Tombol **Lihat di Slip** membuka pratinjau slip dengan logo baru.

### L5a. Unduh Data Pegawai (Excel & PDF)
Menu **Data Pegawai → Unduh Data** → pilih **Excel (.xlsx)** atau **PDF**. Dialog yang muncul berisi:
- **Unit:** *Seluruh Unit* atau salah satu dari 7 unit. Pilihan awal mengikuti filter unit yang sedang aktif.
- **Status:** Aktif & Nonaktif, Aktif saja, atau Nonaktif saja.
- **Format:** bisa diganti langsung di dialog. Jumlah pegawai yang akan diunduh tampil sebelum menekan **Unduh**.

| | Excel (.xlsx) | PDF (A4 mendatar) |
|---|---|---|
| Seluruh unit | Lembar **Rekap** (per unit: guru, karyawan, aktif, nonaktif, jumlah), **Seluruh Unit**, lalu satu lembar per unit | Halaman 1 berisi rekap per unit, lalu tiap unit dimulai di halaman baru |
| Satu unit | Satu lembar untuk unit tersebut | Tabel unit tersebut |
| Kolom | NRP, nama, unit, jabatan, jenis, status kepegawaian, golongan, tanggal lahir, usia, tahun masuk, lama kerja, tanggal pensiun, surel, WhatsApp, bank & rekening, status | Sama, tanpa usia dan **tanpa nomor rekening** |

- **Hak akses:** Admin Yayasan dapat memilih unit mana pun. **Admin Sekolah hanya unitnya sendiri**, tanpa kolom tanggal lahir, golongan, pensiun, dan rekening (data itu memang tidak dikirim ke Admin Sekolah).
- **Format data:** NRP, nomor WhatsApp, dan rekening disimpan sebagai **teks** di Excel, sehingga nol di depan tidak hilang. Urutan data mengikuti urutan resmi unit, lalu nama.
- **Kop dan kaki halaman PDF:** kop memuat logo dan nama yayasan. Kaki halaman memuat waktu cetak, nama pencetak, keterangan *Dokumen internal*, dan nomor halaman. Pegawai nonaktif dicetak abu-abu.
- **Diproses di peramban:** berkas dibuat langsung di peramban (cepat, tanpa membebani kuota GAS). Pustaka PDF baru diunduh saat pertama kali dipakai, sehingga membutuhkan koneksi internet.
- **Log Audit:** setiap unduhan tercatat (*UNDUH DATA PEGAWAI*: format, unit, status, jumlah).
- **Keamanan:** berkas memuat data pribadi pegawai. Simpan dengan aman dan jangan dibagikan ke grup umum.

### L6. Catatan keamanan & batasan GAS
- Sandi dan PIN disimpan sebagai hash HMAC-SHA256 berulang + salt + pepper; 5× salah → akun terkunci 15 menit.
- Seluruh hak akses diperiksa di server. Admin Sekolah **tidak pernah menerima** angka nominal gaji (disaring di server).
- **PDF dari Apps Script tidak bisa diberi sandi.** PIN 6 digit melindungi **unduhan di portal**; lampiran surel tetap PDF biasa (sesuai PRD §6.2). WhatsApp **tidak pernah** memuat nominal maupun PDF — hanya pemberitahuan + tautan pribadi. Folder Drive bersifat privat.
- Tautan pribadi: token acak 192-bit, hanya hash-nya yang disimpan, berlaku sesuai *Masa berlaku tautan*, dicatat di Log Audit. Untuk keamanan lebih ketat pilih *Tautan pribadi di WhatsApp = Wajib sandi*.
- Token WhatsApp gateway disimpan di Script Properties; ganti/hapus kapan saja di *Pengaturan*. Setiap simpan/hapus token dan uji kirim tercatat di Log Audit.
- Sesi berlaku 2 jam tidak aktif dan tersimpan di `sessionStorage` (hilang saat tab ditutup).
- **Arsitektur v2.0:** repo GitHub publik hanya berisi frontend (HTML/CSS/JS) — tidak ada token, sandi, ID spreadsheet, atau data gaji. Semua data & rahasia tetap di Google (Sheets + Script Properties). Token sesi dikirim di body POST, tidak pernah di URL.
- Hak akses tetap diperiksa di server untuk setiap aksi; hanya aksi `api*` yang terdaftar di `API_ACTIONS` yang bisa dipanggil dari luar.
