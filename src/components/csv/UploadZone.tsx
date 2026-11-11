"use client"

// ============================================================
// UploadZone — area upload CSV
// ------------------------------------------------------------
// Dua jalur otomatis berdasarkan ukuran file:
//  ≤ 10 MB  → diparse di browser (instan, filter lokal)
//  > 10 MB  → jalur BIG DATA: unggah bertahap (chunk 8 MB) ke
//             server, parsing streaming + simpan per-baris ke
//             database, lalu dibuka di tabel server-side.
// Maksimal total: 500 MB.
// ============================================================

import * as React from "react"
import { useToast } from "@/hooks/use-toast"
import {
  FileSpreadsheet,
  ClipboardPaste,
  Loader2,
  Server,
  Sparkles,
  UploadCloud,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { formatBytes, parseCsvFile, parseCsvText } from "@/lib/csv-utils"
import type { ActiveDataset } from "@/types/csv"

/** Di atas ukuran ini file diunggah lewat jalur server (big data) */
const CLIENT_PARSE_LIMIT = 10 * 1024 * 1024
/** Ukuran satu potongan unggahan */
const CHUNK_SIZE = 8 * 1024 * 1024
/** Batas total file untuk jalur big data */
const MAX_TOTAL_UPLOAD = 500 * 1024 * 1024

interface BigProgress {
  phase: "mengunggah" | "memproses"
  pct: number
  uploadedBytes: number
  totalBytes: number
  rowsImported: number
  name: string
}

interface UploadZoneProps {
  onDataLoaded: (dataset: ActiveDataset) => void
  /** Dipanggil setelah dataset besar selesai diproses di server */
  onBigUploadComplete: (datasetId: string) => void
  /** Email pemilik (opsional, untuk menandai kepemilikan dataset) */
  ownerEmail?: string | null
}

export function UploadZone({
  onDataLoaded,
  onBigUploadComplete,
  ownerEmail,
}: UploadZoneProps) {
  const { toast } = useToast()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [isParsing, setIsParsing] = React.useState(false)
  const [parseProgress, setParseProgress] = React.useState<{ fraction: number; rowCount: number } | null>(null)
  const [pasteOpen, setPasteOpen] = React.useState(false)
  const [pasteText, setPasteText] = React.useState("")
  const [pasteName, setPasteName] = React.useState("Data Tempelan")
  const [big, setBig] = React.useState<BigProgress | null>(null)

  // ===== Jalur BIG DATA: unggah bertahap + import server =====
  const handleBigUpload = async (file: File) => {
    if (file.size > MAX_TOTAL_UPLOAD) {
      toast({
        title: "File terlalu besar",
        description: "Ukuran file melebihi batas 500 MB.",
        variant: "destructive",
      })
      return
    }

    const datasetName = file.name.replace(/\.(csv|txt)$/i, "")
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
    setBig({
      phase: "mengunggah",
      pct: 0,
      uploadedBytes: 0,
      totalBytes: file.size,
      rowsImported: 0,
      name: datasetName,
    })

    try {
      // 1. Mulai sesi unggahan
      const initRes = await fetch("/api/bigupload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: datasetName,
          sizeBytes: file.size,
          totalChunks,
          ownerEmail: ownerEmail ?? null,
        }),
      })
      const initJson = (await initRes.json().catch(() => ({}))) as {
        sid?: string
        error?: string
      }
      if (!initRes.ok || !initJson.sid) {
        throw new Error(initJson.error ?? "Gagal memulai sesi unggah.")
      }
      const sid = initJson.sid

      // 2. Kirim potongan file satu per satu (dengan retry)
      let uploaded = 0
      for (let i = 0; i < totalChunks; i++) {
        const blob = file.slice(
          i * CHUNK_SIZE,
          Math.min((i + 1) * CHUNK_SIZE, file.size)
        )
        let ok = false
        let lastError: unknown = null
        for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
          try {
            const res = await fetch(
              `/api/bigupload/chunk?sid=${sid}&index=${i}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream" },
                body: blob,
              }
            )
            if (res.ok) {
              ok = true
            } else if (res.status === 409) {
              throw new Error("Urutan potongan tidak sesuai — ulangi unggahan.")
            } else {
              const json = (await res.json().catch(() => ({}))) as { error?: string }
              lastError = new Error(
                json.error ?? `Gagal mengirim potongan ke-${i + 1}.`
              )
            }
          } catch (error) {
            lastError = error
          }
        }
        if (!ok) {
          throw lastError instanceof Error
            ? lastError
            : new Error(`Gagal mengirim potongan ke-${i + 1}.`)
        }
        uploaded += blob.size
        setBig((current) =>
          current
            ? {
                ...current,
                uploadedBytes: uploaded,
                pct: Math.round((uploaded / file.size) * 100),
              }
            : current
        )
      }

      // 3. Selesaikan unggahan → mulai import di server
      const finishRes = await fetch(`/api/bigupload/finish?sid=${sid}`, {
        method: "POST",
      })
      const finishJson = (await finishRes.json().catch(() => ({}))) as {
        id?: string
        error?: string
      }
      if (!finishRes.ok || !finishJson.id) {
        throw new Error(finishJson.error ?? "Gagal menyelesaikan unggahan.")
      }
      const datasetId = finishJson.id

      // 4. Tunggu import streaming selesai (polling status)
      setBig((current) =>
        current ? { ...current, phase: "memproses", pct: 100 } : current
      )
      for (let poll = 0; poll < 3000; poll++) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const res = await fetch(`/api/datasets/${datasetId}`)
        if (!res.ok) {
          throw new Error("Gagal memeriksa status pemrosesan dataset.")
        }
        const meta = (await res.json()) as {
          status?: string
          rowCount?: number
          importError?: string | null
        }
        setBig((current) =>
          current
            ? { ...current, rowsImported: meta.rowCount ?? 0 }
            : current
        )
        if (meta.status === "failed") {
          throw new Error(
            meta.importError || "Pemrosesan dataset di server gagal."
          )
        }
        if (meta.status === "done") break
      }

      setBig(null)
      toast({
        title: "Dataset besar tersimpan di database",
        description: `"${datasetName}" selesai diproses — dibuka di sub menu Tampilan Tabel (mode server-side).`,
      })
      onBigUploadComplete(datasetId)
    } catch (error) {
      setBig(null)
      toast({
        title: "Upload file besar gagal",
        description: error instanceof Error ? error.message : "Error tidak diketahui.",
        variant: "destructive",
      })
    }
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!/\.(csv|txt)$/i.test(file.name)) {
      toast({
        title: "Format file tidak didukung",
        description: "Silakan pilih file dengan ekstensi .csv",
        variant: "destructive",
      })
      return
    }

    // File besar → jalur server (big data)
    if (file.size > CLIENT_PARSE_LIMIT) {
      void handleBigUpload(file)
      return
    }

    // File kecil → parse di browser
    setIsParsing(true)
    setParseProgress(null)
    try {
      const result = await parseCsvFile(file, setParseProgress)
      onDataLoaded({
        name: result.name,
        columns: result.columns,
        rows: result.rows,
        sizeBytes: result.sizeBytes,
      })
      toast({
        title: "CSV berhasil dimuat",
        description: `${result.rows.length.toLocaleString("id-ID")} baris dan ${result.columns.length} kolom terbaca.`,
      })
    } catch (error) {
      toast({
        title: "Gagal membaca CSV",
        description: error instanceof Error ? error.message : "Error tidak diketahui.",
        variant: "destructive",
      })
    } finally {
      setIsParsing(false)
      setParseProgress(null)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const handlePasteSubmit = () => {
    if (pasteText.trim() === "") {
      toast({
        title: "Data kosong",
        description: "Tempel minimal baris header dan satu baris data.",
        variant: "destructive",
      })
      return
    }
    try {
      const name = pasteName.trim() === "" ? "Data Tempelan" : pasteName.trim()
      const result = parseCsvText(pasteText, name)
      if (result.rows.length === 0 || result.columns.length === 0) {
        throw new Error("Tidak ada baris data yang terbaca.")
      }
      onDataLoaded({
        name: result.name,
        columns: result.columns,
        rows: result.rows,
      })
      toast({
        title: "Data berhasil dimuat",
        description: `${result.rows.length.toLocaleString("id-ID")} baris dan ${result.columns.length} kolom terbaca.`,
      })
      setPasteOpen(false)
      setPasteText("")
    } catch (error) {
      toast({
        title: "Gagal membaca data",
        description: error instanceof Error ? error.message : "Error tidak diketahui.",
        variant: "destructive",
      })
    }
  }

  const handleLoadSample = async () => {
    setIsParsing(true)
    setParseProgress(null)
    try {
      const res = await fetch("/sample-data.csv")
      if (!res.ok) throw new Error("File contoh tidak ditemukan.")
      const text = await res.text()
      const result = parseCsvText(text, "Contoh Data Penjualan", text.length)
      onDataLoaded({
        name: result.name,
        columns: result.columns,
        rows: result.rows,
        sizeBytes: result.sizeBytes,
      })
      toast({
        title: "Contoh data dimuat",
        description: `${result.rows.length} baris data penjualan siap difilter.`,
      })
    } catch (error) {
      toast({
        title: "Gagal memuat contoh",
        description: error instanceof Error ? error.message : "Error tidak diketahui.",
        variant: "destructive",
      })
    } finally {
      setIsParsing(false)
    }
  }

  return (
    <div className="w-full">
      <Card
        data-dragging={isDragging ? "true" : undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          void handleFiles(e.dataTransfer.files)
        }}
        className={`relative flex flex-col items-center justify-center gap-4 border-2 border-dashed p-8 text-center transition-colors sm:p-12 ${
          isDragging
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
            : "border-muted-foreground/25 bg-muted/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,.txt"
          className="sr-only"
          onChange={(e) => void handleFiles(e.target.files)}
          aria-label="Pilih file CSV"
          disabled={big !== null}
        />

        {/* ===== Progres jalur BIG DATA ===== */}
        {big !== null ? (
          <div className="flex w-full max-w-md flex-col items-center gap-4 py-4" aria-live="polite">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {big.phase === "mengunggah" ? (
                <UploadCloud className="h-8 w-8" aria-hidden="true" />
              ) : (
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold sm:text-lg">
                {big.phase === "mengunggah"
                  ? `Mengunggah "${big.name}" ke server…`
                  : "Memproses & menyimpan ke database…"}
              </p>
              <p className="text-sm text-muted-foreground">
                {big.phase === "mengunggah"
                  ? `${formatBytes(big.uploadedBytes)} dari ${formatBytes(big.totalBytes)} • potongan 8 MB`
                  : `${big.rowsImported.toLocaleString("id-ID")} baris tersimpan — jalur big data (server-side)`}
              </p>
            </div>
            {big.phase === "mengunggah" && (
              <div className="w-full space-y-1.5">
                <Progress
                  value={big.pct}
                  aria-label="Kemajuan unggahan file ke server"
                />
                <p className="text-center text-xs tabular-nums text-muted-foreground">
                  {big.pct}%
                </p>
              </div>
            )}
            <p className="max-w-sm text-xs text-muted-foreground">
              {big.phase === "memproses"
                ? "File diproses streaming di server dan disisipkan per batch ke database — biarkan halaman ini tetap terbuka."
                : "Jangan tutup halaman sampai unggahan selesai."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {isParsing ? (
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
              ) : (
                <UploadCloud className="h-8 w-8" aria-hidden="true" />
              )}
            </div>

            <div className="space-y-1">
              <p className="text-base font-semibold sm:text-lg">
                Tarik & lepas file CSV ke sini
              </p>
              <p className="text-sm text-muted-foreground">
                Pemisah koma, titik-koma, atau tab terdeteksi otomatis — maksimal
                500 MB
              </p>
              <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <Server className="h-3 w-3" aria-hidden="true" />
                File di atas 10 MB otomatis diunggah bertahap &amp; diproses di
                server (jalur big data)
              </p>
            </div>

            {/* Indikator progres parsing browser (file kecil) */}
            {isParsing && (
              <div className="w-full max-w-sm space-y-1.5" aria-live="polite">
                <Progress
                  value={Math.round((parseProgress?.fraction ?? 0) * 100)}
                  aria-label="Kemajuan pembacaan file CSV"
                />
                <p className="text-center text-xs tabular-nums text-muted-foreground">
                  Memproses CSV… {Math.round((parseProgress?.fraction ?? 0) * 100)}%
                  {parseProgress
                    ? ` • ${parseProgress.rowCount.toLocaleString("id-ID")} baris terbaca`
                    : ""}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
              <Button
                onClick={() => inputRef.current?.click()}
                disabled={isParsing}
                className="h-11 px-6"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
                Pilih File CSV
              </Button>

              <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="h-11" disabled={isParsing}>
                    <ClipboardPaste className="mr-2 h-4 w-4" aria-hidden="true" />
                    Tempel Data CSV
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Tempel Data CSV</DialogTitle>
                    <DialogDescription>
                      Tempel teks CSV (termasuk baris header) di bawah ini, lalu klik
                      Muat Data.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="dataset-name">Nama dataset</Label>
                      <Input
                        id="dataset-name"
                        value={pasteName}
                        onChange={(e) => setPasteName(e.target.value)}
                        placeholder="mis. Data Penjualan Q1"
                        maxLength={120}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="csv-text">Isi data CSV</Label>
                      <Textarea
                        id="csv-text"
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        placeholder={"Nama,Kota,Umur\nBudi,Jakarta,29\nSiti,Bandung,34"}
                        className="min-h-40 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setPasteOpen(false)}
                      className="h-11"
                    >
                      Batal
                    </Button>
                    <Button onClick={handlePasteSubmit} className="h-11">
                      Muat Data
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                variant="outline"
                onClick={handleLoadSample}
                disabled={isParsing}
                className="h-11"
              >
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                Muat Contoh Data
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
