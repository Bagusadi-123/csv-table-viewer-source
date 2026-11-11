"use client"

// ============================================================
// CSV Table Viewer — halaman utama (desain berbasis menu)
// Navigasi lewat sidebar: Beranda, Upload CSV, Tampilan
// Tabel, Dataset Tersimpan, dan Panduan & Catatan.
// Alur: upload di sub menu sendiri → hasil konversi dibuka
// otomatis di sub menu Tampilan Tabel → simpan/muat dataset
// dari database. Login opsional via Firebase Authentication.
// ============================================================

import * as React from "react"
import {
  ArrowRight,
  Database,
  Filter,
  Info,
  LayoutDashboard,
  LogIn,
  Table2,
  UploadCloud,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ThemeToggle } from "@/components/theme-toggle"
import { AppSidebar, SECTION_TITLES, type AppSection } from "@/components/csv/AppSidebar"
import { UploadZone } from "@/components/csv/UploadZone"
import { DataTable } from "@/components/csv/DataTable"
import { ServerTable } from "@/components/csv/ServerTable"
import { DatasetList } from "@/components/csv/DatasetList"
import { AuthDialog } from "@/components/csv/AuthDialog"
import { buildColumnMeta } from "@/lib/csv-utils"
import { isFirebaseConfigured, subscribeToAuth } from "@/lib/firebase"
import type {
  ActiveDataset,
  AuthUserInfo,
  CsvColumnMeta,
  DatasetSummary,
  ServerDatasetMeta,
} from "@/types/csv"

const FEATURE_STEPS = [
  {
    icon: UploadCloud,
    title: "1. Unggah CSV",
    description:
      "Di sub menu Upload CSV: file ≤ 10 MB diproses instan di browser, sedangkan file hingga 500 MB diunggah bertahap & diproses streaming di server (jalur big data).",
  },
  {
    icon: Filter,
    title: "2. Filter & Urutkan",
    description:
      "Di sub menu Tampilan Tabel: dataset kecil difilter di browser, dataset besar difilter langsung di database (SQL) dengan pagination server-side.",
  },
  {
    icon: Database,
    title: "3. Simpan ke Database",
    description:
      "Dataset kecil disimpan sebagai blob JSON; dataset besar disimpan per-baris di tabel DatasetRow — muat kembali kapan saja dari sub menu Dataset Tersimpan.",
  },
]

export default function Home() {
  const { toast } = useToast()
  const [section, setSection] = React.useState<AppSection>("beranda")
  const [dataset, setDataset] = React.useState<ActiveDataset | null>(null)
  const [serverDataset, setServerDataset] = React.useState<ServerDatasetMeta | null>(null)
  const [user, setUser] = React.useState<AuthUserInfo | null>(null)
  const [authOpen, setAuthOpen] = React.useState(false)
  const [savedDatasets, setSavedDatasets] = React.useState<DatasetSummary[]>([])
  const [listLoading, setListLoading] = React.useState(true)
  const firebaseReady = React.useMemo(() => isFirebaseConfigured(), [])

  // Berlangganan status login Firebase (noop saat mode demo)
  React.useEffect(() => {
    const unsubscribe = subscribeToAuth(setUser)
    return unsubscribe
  }, [])

  const refreshDatasets = React.useCallback(async () => {
    setListLoading(true)
    try {
      const res = await fetch("/api/datasets")
      if (res.ok) {
        const json = (await res.json()) as DatasetSummary[]
        setSavedDatasets(json)
      }
    } catch {
      // daftar dataset gagal dimuat — biarkan kosong, tidak fatal
    } finally {
      setListLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refreshDatasets()
  }, [refreshDatasets])

  // Upload file kecil selesai → tampilkan di sub menu Tampilan Tabel
  const handleDataLoaded = (loaded: ActiveDataset) => {
    setDataset(loaded)
    setServerDataset(null)
    setSection("tabel")
  }

  // Upload file besar selesai diproses server → buka tabel server-side
  const handleBigUploadComplete = async (datasetId: string) => {
    try {
      const res = await fetch(`/api/datasets/${datasetId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Gagal memuat metadata dataset.")
      setServerDataset({
        id: json.id,
        name: json.name,
        columns: (json.columns ?? []) as CsvColumnMeta[],
        rowCount: json.rowCount ?? 0,
        sizeBytes: json.sizeBytes ?? null,
        ownerEmail: json.ownerEmail ?? null,
        status: json.status,
        sourceType: json.sourceType,
      })
      setDataset(null)
      setSection("tabel")
      void refreshDatasets()
    } catch (error) {
      toast({
        title: "Gagal membuka dataset",
        description: error instanceof Error ? error.message : "Error tidak diketahui.",
        variant: "destructive",
      })
    }
  }

  // Muat dataset tersimpan → arahkan ke jalur yang sesuai
  const handleLoadDataset = async (summary: DatasetSummary) => {
    // Dataset besar → tabel server-side (metadata saja)
    if (summary.sourceType === "big") {
      try {
        const res = await fetch(`/api/datasets/${summary.id}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "Gagal memuat dataset.")
        setServerDataset({
          id: json.id,
          name: json.name,
          columns: (json.columns ?? []) as CsvColumnMeta[],
          rowCount: json.rowCount ?? 0,
          sizeBytes: json.sizeBytes ?? null,
          ownerEmail: json.ownerEmail ?? null,
          status: json.status,
          sourceType: json.sourceType,
        })
        setDataset(null)
        setSection("tabel")
        toast({
          title: "Dataset besar dimuat",
          description: `"${json.name}" (${Number(json.rowCount).toLocaleString("id-ID")} baris) dibuka dalam mode server-side.`,
        })
      } catch (error) {
        toast({
          title: "Gagal memuat dataset",
          description: error instanceof Error ? error.message : "Error tidak diketahui.",
          variant: "destructive",
        })
      }
      return
    }

    // Dataset kecil → jalur browser (ambil blob data)
    try {
      const res = await fetch(`/api/datasets/${summary.id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Gagal memuat dataset.")
      const rows = (json.data ?? []) as Record<string, string>[]
      setDataset({
        name: json.name,
        columns: buildColumnMeta(rows),
        rows,
        sizeBytes: json.sizeBytes ?? undefined,
        dbId: json.id,
      })
      setServerDataset(null)
      setSection("tabel")
      toast({
        title: "Dataset dimuat",
        description: `"${json.name}" (${Number(json.rowCount).toLocaleString("id-ID")} baris) dimuat dari database.`,
      })
    } catch (error) {
      toast({
        title: "Gagal memuat dataset",
        description: error instanceof Error ? error.message : "Error tidak diketahui.",
        variant: "destructive",
      })
    }
  }

  // ===== Konten tiap sub menu =====

  const renderSection = () => {
    switch (section) {
      case "beranda":
        return (
          <section className="space-y-8" aria-label="Beranda">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Selamat datang di CSV Table Viewer
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                Website ini disusun berbasis menu: setiap fitur memiliki sub menu
                sendiri. Buka <span className="font-medium text-foreground">Upload CSV</span>{" "}
                untuk memuat data, hasil konversi otomatis tampil di{" "}
                <span className="font-medium text-foreground">Tampilan Tabel</span>, dan{" "}
                <span className="font-medium text-foreground">Dataset Tersimpan</span>{" "}
                untuk memuat data dari database.
              </p>
            </div>

            {/* Ringkasan status */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="flex flex-col gap-1.5 p-5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Table2 className="h-4 w-4" aria-hidden="true" />
                    <p className="text-xs font-medium uppercase tracking-wide">
                      Dataset Aktif
                    </p>
                  </div>
                  <p
                    className="truncate font-semibold"
                    title={serverDataset?.name ?? dataset?.name ?? ""}
                  >
                    {serverDataset?.name ?? dataset?.name ?? "Belum ada data"}
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {serverDataset
                      ? `${serverDataset.rowCount.toLocaleString("id-ID")} baris • ${serverDataset.columns.length} kolom • server-side`
                      : dataset
                      ? `${dataset.rows.length.toLocaleString("id-ID")} baris • ${dataset.columns.length} kolom`
                      : "Unggah CSV terlebih dahulu"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex flex-col gap-1.5 p-5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Database className="h-4 w-4" aria-hidden="true" />
                    <p className="text-xs font-medium uppercase tracking-wide">
                      Dataset Tersimpan
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums">
                    {listLoading ? "…" : savedDatasets.length.toLocaleString("id-ID")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    dataset tersimpan di database
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex flex-col gap-1.5 p-5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                    <p className="text-xs font-medium uppercase tracking-wide">
                      Status Firebase
                    </p>
                  </div>
                  <p className="font-semibold">
                    {firebaseReady ? "Firebase aktif" : "Mode Demo"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {firebaseReady
                      ? "Login Firebase Authentication siap digunakan."
                      : "Isi NEXT_PUBLIC_FIREBASE_* di .env untuk mengaktifkan login."}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Aksi cepat */}
            <div className="flex flex-wrap gap-2">
              <Button className="h-11 gap-2" onClick={() => setSection("upload")}>
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                Upload CSV Sekarang
              </Button>
              <Button
                variant="outline"
                className="h-11 gap-2"
                disabled={!dataset}
                onClick={() => setSection("tabel")}
              >
                <Table2 className="h-4 w-4" aria-hidden="true" />
                Lihat Tampilan Tabel
              </Button>
              <Button
                variant="outline"
                className="h-11 gap-2"
                onClick={() => setSection("dataset")}
              >
                <Database className="h-4 w-4" aria-hidden="true" />
                Dataset Tersimpan
              </Button>
            </div>

            {/* Ringkasan alur */}
            <section aria-label="Cara kerja aplikasi" className="grid gap-4 sm:grid-cols-3">
              {FEATURE_STEPS.map((step) => (
                <Card key={step.title} className="border-muted">
                  <CardContent className="flex flex-col gap-2 p-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <step.icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </div>
                    <p className="font-semibold">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </CardContent>
                </Card>
              ))}
            </section>
          </section>
        )

      case "upload":
        return (
          <section className="space-y-5" aria-label="Upload CSV">
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Upload CSV
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Muat file CSV di sini — hasil konversi akan otomatis dibuka di
                sub menu <span className="font-medium text-foreground">Tampilan Tabel</span>.
              </p>
            </div>
            <UploadZone
              onDataLoaded={handleDataLoaded}
              onBigUploadComplete={(id) => void handleBigUploadComplete(id)}
              ownerEmail={user?.email ?? null}
            />
            {(dataset || serverDataset) && (
              <Card className="border-dashed bg-muted/30">
                <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <p className="text-sm text-muted-foreground">
                    Dataset saat ini:{" "}
                    <span className="font-medium text-foreground">
                      {serverDataset?.name ?? dataset?.name}
                    </span>{" "}
                    ({(serverDataset?.rowCount ?? dataset?.rows.length ?? 0).toLocaleString("id-ID")}{" "}
                    baris) — sudah ditampilkan di sub menu Tampilan Tabel.
                  </p>
                  <Button
                    variant="outline"
                    className="h-10 gap-2"
                    onClick={() => setSection("tabel")}
                  >
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    Buka Tampilan Tabel
                  </Button>
                </CardContent>
              </Card>
            )}
          </section>
        )

      case "tabel":
        return (
          <section className="space-y-5" aria-label="Tampilan Tabel">
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Tampilan Tabel
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Hasil konversi CSV ditampilkan di sini. Dataset kecil difilter di
                browser; dataset besar (Big Data) difilter, diurutkan, dan
                dipaginasi di sisi server/database.
              </p>
            </div>
            {serverDataset ? (
              <ServerTable
                dataset={serverDataset}
                onReset={() => {
                  setServerDataset(null)
                  setSection("upload")
                }}
              />
            ) : dataset ? (
              <DataTable
                dataset={dataset}
                user={user}
                onDatasetSaved={() => void refreshDatasets()}
                onReset={() => setSection("upload")}
              />
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 p-10 text-center sm:p-14">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Table2 className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <p className="font-semibold">Belum ada data untuk ditampilkan</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Hasil konversi CSV akan muncul di sub menu ini — termasuk
                    dataset besar (hingga 500 MB) yang diproses di server. Buka
                    sub menu Upload CSV atau pilih dataset tersimpan dari
                    database.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button className="h-11 gap-2" onClick={() => setSection("upload")}>
                      <UploadCloud className="h-4 w-4" aria-hidden="true" />
                      Buka Upload CSV
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 gap-2"
                      onClick={() => setSection("dataset")}
                    >
                      <Database className="h-4 w-4" aria-hidden="true" />
                      Dataset Tersimpan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        )

      case "dataset":
        return (
          <section className="space-y-5" aria-label="Dataset Tersimpan">
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Dataset Tersimpan
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Dataset yang disimpan ke database melalui Prisma ORM
                (MySQL-ready). Muat dataset untuk membukanya di sub menu
                Tampilan Tabel.
              </p>
            </div>
            <DatasetList
              datasets={savedDatasets}
              loading={listLoading}
              onLoad={(ds) => void handleLoadDataset(ds)}
              onDeleted={() => void refreshDatasets()}
              onRefresh={() => void refreshDatasets()}
            />
          </section>
        )

      case "panduan":
        return (
          <section className="space-y-6" aria-label="Panduan dan Catatan">
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Panduan &amp; Catatan
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Cara menggunakan website ini sub menu demi sub menu, plus catatan
                teknis integrasi MySQL dan Firebase.
              </p>
            </div>

            {/* Alur pemakaian per sub menu */}
            <Card className="border-muted">
              <CardContent className="p-5 sm:p-6">
                <p className="mb-4 font-semibold">Alur penggunaan</p>
                <ol className="space-y-4">
                  <li className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      1
                    </span>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Upload CSV</span> —
                      file ≤ 10 MB diproses instan di browser (progress bar untuk file
                      besar di sisi browser). File 10–500 MB otomatis masuk jalur{" "}
                      <span className="font-medium text-foreground">big data</span>:
                      diunggah bertahap per 8 MB ke server, diparse streaming, lalu
                      disisipkan per batch ke tabel DatasetRow di database.
                    </p>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      2
                    </span>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Tampilan Tabel</span> —
                      dataset kecil: pencarian global, filter per kolom, sorting, dan
                      pagination di browser. Dataset besar: pencarian, filter, sort,
                      dan pagination diproses SQL di server — hanya 25–200 baris per
                      halaman yang dikirim ke browser.
                    </p>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      3
                    </span>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Simpan ke Database</span> —
                      dataset kecil (maks. 5.000 baris) disimpan sebagai blob JSON.
                      Dataset besar otomatis tersimpan per-baris di tabel DatasetRow
                      (jutaan baris didukung) dan bisa dimuat ulang kapan saja.
                    </p>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      4
                    </span>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Dataset Tersimpan</span> —
                      daftar dataset di database: muat untuk membukanya di Tampilan
                      Tabel, atau hapus dengan konfirmasi.
                    </p>
                  </li>
                </ol>
              </CardContent>
            </Card>

            {/* Catatan teknis */}
            <Card className="border-dashed bg-muted/30">
              <CardContent className="flex gap-3 p-4 sm:p-5">
                <Info
                  className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Catatan big data:</span>{" "}
                    file 10–500 MB diunggah bertahap ke{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      /api/bigupload
                    </code>{" "}
                    lalu diparse streaming dan disisipkan per batch (500 baris) ke
                    tabel{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      DatasetRow
                    </code>
                    . Filter/pagination dataset besar dieksekusi sebagai SQL di
                    database (kompatibel SQLite &amp; MySQL). Jika MySQL Anda
                    menolak batch dengan error "packet too big", kecilkan
                    BATCH_SIZE di{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      src/lib/big-import.ts
                    </code>{" "}
                    atau naikkan{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      max_allowed_packet
                    </code>
                    .
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Catatan MySQL:</span>{" "}
                    demo ini berjalan dengan database SQLite melalui Prisma. Skema
                    database sudah kompatibel MySQL — di komputer Anda cukup ubah{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      provider = "mysql"
                    </code>{" "}
                    di{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      prisma/schema.prisma
                    </code>{" "}
                    dan isi{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      DATABASE_URL
                    </code>{" "}
                    dengan koneksi MySQL Anda.
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Catatan Firebase:</span>{" "}
                    login Firebase aktif otomatis setelah variabel{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      NEXT_PUBLIC_FIREBASE_*
                    </code>{" "}
                    diisi pada file .env.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        )
    }
  }

  return (
    <SidebarProvider>
      {/* Menu utama → sub menu */}
      <AppSidebar
        activeSection={section}
        onNavigate={setSection}
        datasetRowCount={serverDataset?.rowCount ?? dataset?.rows.length}
        savedCount={savedDatasets.length}
      />

      <SidebarInset className="flex min-h-screen flex-col">
        {/* ===== Header ===== */}
        <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex h-16 items-center gap-2 px-4 sm:px-6">
            <SidebarTrigger className="-ml-1" aria-label="Buka atau tutup menu" />
            <Separator orientation="vertical" className="!h-5" />
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white md:hidden">
                  <Table2 className="h-4 w-4" aria-hidden="true" />
                </div>
                <p className="truncate font-semibold leading-tight">
                  {SECTION_TITLES[section]}
                </p>
                <p className="hidden truncate text-xs text-muted-foreground lg:block">
                  — CSV Table Viewer
                </p>
              </div>

              <div className="flex items-center gap-2">
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant={firebaseReady ? "secondary" : "outline"}
                        className={`hidden gap-1.5 px-2.5 py-1 sm:inline-flex ${
                          firebaseReady
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            firebaseReady ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                          aria-hidden="true"
                        />
                        {firebaseReady ? "Firebase aktif" : "Mode Demo"}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-64 text-xs">
                      {firebaseReady
                        ? "Firebase Authentication aktif — login tersedia."
                        : "Firebase belum dikonfigurasi (env kosong). Fitur CSV & database tetap berfungsi penuh; login nonaktif. Klik Masuk untuk panduan."}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <ThemeToggle />

                {user ? (
                  <Button
                    variant="outline"
                    className="h-10 max-w-52 gap-2 px-2 sm:px-3"
                    onClick={() => setAuthOpen(true)}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden truncate sm:inline">
                      {user.displayName ?? user.email}
                    </span>
                  </Button>
                ) : (
                  <Button className="h-10 gap-2" onClick={() => setAuthOpen(true)}>
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    Masuk
                  </Button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ===== Konten sub menu ===== */}
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {renderSection()}
        </div>

        {/* ===== Footer ===== */}
        <footer className="mt-auto border-t">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 sm:text-left lg:px-8">
            <p>CSV Table Viewer — dibuat dengan Next.js, TypeScript & Tailwind CSS</p>
            <p>PapaParse • TanStack Table • Prisma ORM (MySQL-ready) • Firebase Auth</p>
          </div>
        </footer>
      </SidebarInset>

      {/* Dialog auth */}
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        user={user}
        onUserChange={setUser}
      />
    </SidebarProvider>
  )
}
