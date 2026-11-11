# CSV Table Viewer

Aplikasi web untuk mengubah file CSV menjadi **tabel interaktif** dengan fitur filtering, sorting, pagination, penyimpanan dataset ke database, dan login opsional Firebase.

Desainnya berbasis **menu → sub menu**: setiap fitur berada di halaman sub menu sendiri di sidebar (Upload CSV, Tampilan Tabel, Dataset Tersimpan, Panduan & Catatan) — bukan satu halaman konverter panjang seperti website pengubah CSV pada umumnya.

## Fitur

- **Menu & sub menu** — sidebar navigasi: Beranda, Upload CSV, Tampilan Tabel, Dataset Tersimpan, Panduan & Catatan; hasil upload otomatis dibuka di sub menu Tampilan Tabel
- **Upload CSV** — drag & drop, pilih file, tempel teks CSV, atau muat contoh data
- **Filtering** — pencarian global di semua kolom + filter per kolom
- **Sorting** — klik judul kolom untuk mengurutkan (angka diurutkan secara numerik)
- **Pagination** — 10/25/50/100 baris per halaman atau tampilkan semua
- **Visibilitas kolom** — pilih kolom mana yang ditampilkan
- **Export CSV** — unduh hasil filter saat itu juga
- **Simpan ke database** — dataset tersimpan permanen via Prisma ORM, bisa dimuat ulang
- **BIG DATA (10 MB – 500 MB)** — upload bertahap per 8 MB ke server, parsing streaming, penyimpanan per-baris di tabel `DatasetRow`, dan tabel server-side (filter/sort/pagination dieksekusi sebagai SQL di database) — dirancang untuk jutaan baris
- **Login Firebase** (opsional) — email/password & Google, dataset ditandai pemiliknya
- **Dark mode** & tampilan responsif (mobile + desktop)

## Teknologi

| Bagian | Teknologi |
| --- | --- |
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS 4 + shadcn/ui + Lucide icons |
| Tabel | TanStack Table v8 |
| Parsing CSV | PapaParse |
| Database | Prisma ORM (SQLite untuk demo, **siap MySQL**) |
| Login | Firebase Authentication |

## Menjalankan di Komputer Anda (dari Nol)

### Langkah 1 — Install Node.js

1. Kunjungi https://nodejs.org → unduh versi **LTS** (mis. 22.x)
2. Instal seperti aplikasi biasa (Windows: next-next-finish)
3. Buka terminal **baru** (atau CMD/PowerShell), cek:

```bash
node --version   # harus muncul v22.x.x (atau lebih)
npm --version    # harus muncul 10.x.x (atau lebih)
```

### Langkah 2 — Install dependencies project

```bash
cd csv-table-viewer
npm install
```

### Langkah 3 — Siapkan database

**Opsi A — MySQL (sesuai kebutuhan Anda):**

1. Install MySQL Server / XAMPP / Laragon
2. Buat database (contoh via MySQL Shell / phpMyAdmin):

```sql
CREATE DATABASE csv_viewer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. Ubah `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "mysql"          // sebelumnya "sqlite"
  url      = env("DATABASE_URL")
}
```

4. Isi `DATABASE_URL` di file `.env`:

```
DATABASE_URL="mysql://root:password_anda@localhost:3306/csv_viewer"
```

**Opsi B — SQLite (paling cepat untuk mencoba):**

Biarkan `provider = "sqlite"` dan isi `.env`:

```
DATABASE_URL="file:./db/custom.db"
```

5. Buat tabel di database:

```bash
npx prisma db push
```

### Langkah 4 — (Opsional) Aktifkan login Firebase

1. Buat project gratis di https://console.firebase.google.com
2. **Authentication → Sign-in method** → aktifkan **Email/Password** dan **Google**
3. **Project Settings → Your apps → Web app** → salin `firebaseConfig`
4. Isi file `.env`:

```
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
NEXT_PUBLIC_FIREBASE_PROJECT_ID="..."
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="..."
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
NEXT_PUBLIC_FIREBASE_APP_ID="..."
```

5. Daftarkan `localhost` di **Authentication → Settings → Authorized domains** (sudah otomatis untuk `localhost`)

> Tanpa langkah ini aplikasi tetap berjalan penuh dalam **Mode Demo** (tanpa login).

### Langkah 5 — Jalankan

```bash
npm run dev
```

Buka http://localhost:3000 di browser.

## Struktur Penting

```
prisma/schema.prisma        → skema database (model Dataset + DatasetRow)
src/app/page.tsx            → halaman utama (routing sub menu + konten tiap sub menu)
src/components/csv/AppSidebar.tsx → menu utama & daftar sub menu
src/components/csv/         → UploadZone, DataTable, ServerTable, DatasetList, AuthDialog
src/app/api/bigupload/      → API unggah bertahap (init/chunk/finish)
src/app/api/datasets/       → API dataset (daftar/simpan/muat/hapus + rows server-side)
src/lib/big-upload.ts       → manajemen sesi unggahan file besar
src/lib/big-import.ts       → import CSV besar streaming (PapaParse + batch INSERT)
src/lib/firebase.ts         → konfigurasi & fungsi login Firebase
src/lib/csv-utils.ts        → parsing & export CSV
public/sample-data.csv      → contoh data untuk uji coba
```

## Arsitektur Big Data (file 10 MB – 500 MB)

```
Browser                        Server (Next.js)                Database
────────                       ────────────────                 ────────
File 12 MB
  │ slice per 8 MB
  ├─ POST /api/bigupload/init ──→ buat sesi + file sementara
  ├─ POST /api/bigupload/chunk → append per potongan            db/uploads/*.part
  └─ POST /api/bigupload/finish → record Dataset (processing)
                                   │ streaming parse (PapaParse)
                                   │ INSERT batch 500 baris ────→ tabel DatasetRow
  poll /api/datasets/[id] ←───────┘ status: processing → done
  │
  └─ GET /api/datasets/[id]/rows?search=&f:Kolom=&sortCol=&page=
       filter/sort/pagination dieksekusi sebagai SQL ────────→ hanya 25–200
                                                                 baris/halaman
                                                                 dikirim ke browser
```

- Batas total file: **500 MB**; ambang jalur server: **10 MB** (di bawahnya diproses instan di browser).
- Import berjalan di background — progress (jumlah baris tersimpan) terlihat di halaman upload dan di daftar Dataset Tersimpan.
- Kompatibel SQLite (demo) dan MySQL (kompatibel MariaDB/XAMPP) — SQL dibangun per-dialek dengan parameter terikat.

### Hasil uji terverifikasi (sandbox, SQLite, laptop biasa akan lebih cepat dengan MySQL)

| Skenario | Hasil |
| --- | --- |
| Upload 435 MB (55 potongan × 8 MB) | 7,1 detik |
| Import streaming 9,53 juta baris (file 435 MB) | 332 detik (±29.000 baris/detik) |
| Import streaming 1,9 juta baris (file 86 MB) | 67 detik |
| Pencarian global "Jakarta" di 9,53 juta baris | 11,9 detik |
| Pencarian global "Jakarta" di 1,9 juta baris | 0,68 detik |
| Filter per kolom + sort numerik + halaman ke-5000 dari 381.301 | benar & responsif |
| Memori server selama import 9,53 juta baris | stabil, kembali normal setelah selesai |

## Catatan

- File ≤ 10 MB: diparse di browser dengan filter lokal; file 10 MB – 500 MB: jalur big data server-side (lihat diagram di atas).
- Dataset kecil disimpan sebagai blob JSON (maks. 5.000 baris); dataset besar otomatis per-baris di tabel `DatasetRow` (jutaan baris didukung).
- **PENTING bagi pemilik versi lama:** skema database berubah (field baru `sourceType`/`status`/`importError` + tabel `DatasetRow`). Jalankan ulang `npx prisma db push` setelah memakai versi ini.
- Jika MySQL menolak batch dengan error "packet too big": kecilkan `BATCH_SIZE` di `src/lib/big-import.ts` atau naikkan `max_allowed_packet` di `my.ini`.
- Filter/pencarian dataset besar memindai seluruh baris (query JSON per baris) — pada 9,5 juta baris butuh ±10 detik. Ini normal untuk tugas big data; untuk mempercepat: aktifkan `PRAGMA`/index di MySQL atau pecah dataset.
- Demo sandbox memakai SQLite; skema kompatibel MySQL 5.7+ / MariaDB (tipe `Json`).
- Untuk produksi: verifikasi token Firebase di sisi server (firebase-admin) sebelum percaya `ownerEmail` dari client.
