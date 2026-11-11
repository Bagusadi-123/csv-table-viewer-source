// ============================================================
// big-import — import CSV besar ke database secara STREAMING
// ------------------------------------------------------------
// File sementara (hasil unggah bertahap) dibaca sebagai stream
// Node.js, diparse PapaParse per potongan (backpressure via
// parser.pause/resume), lalu disisipkan ke tabel DatasetRow
// per batch 500 baris. Berjalan di background setelah route
// finish merespons, sehingga request HTTP tidak menunggu.
// Progress dilaporkan lewat Dataset.rowCount (status:
// processing → done/failed) yang dipolling client.
// ============================================================

import fs from "fs"
import Papa from "papaparse"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"

/** Jumlah baris per INSERT (batch) — aman untuk max_allowed_packet MySQL default */
const BATCH_SIZE = 500

/**
 * Perbarui Dataset.rowCount tiap N batch (bukan tiap batch) — mengurangi
 * beban query & logging saat import jutaan baris. Progress tetap terlihat
 * (akurat per 5.000 baris).
 */
const UPDATE_EVERY_N_BATCHES = 10

/** Metadata kolom hasil import */
interface ImportedColumn {
  key: string
  isNumeric: boolean
}

/**
 * Mulai import di background (fire-and-forget).
 * Selalu menghapus file sementara setelah selesai/gagal.
 */
export function startImport(datasetId: string, filePath: string): void {
  void runImport(datasetId, filePath)
    .catch(async (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Error tidak diketahui saat import."
      console.error(`[big-import] Gagal dataset ${datasetId}:`, message)
      try {
        await db.dataset.update({
          where: { id: datasetId },
          data: { status: "failed", importError: message.slice(0, 500) },
        })
      } catch {
        // dataset mungkin sudah dihapus pengguna — abaikan
      }
    })
    .finally(() => {
      void fs.promises.unlink(filePath).catch(() => undefined)
    })
}

function isNumericValue(value: string): boolean {
  if (value.trim() === "") return false
  return Number.isFinite(Number(value.replace(",", ".")))
}

async function runImport(datasetId: string, filePath: string): Promise<void> {
  const columnKeys: string[] = []
  const columnKeySet = new Set<string>()
  const nonNumericColumns = new Set<string>()
  let batch: Record<string, string>[] = []
  let imported = 0
  let batchesSinceUpdate = 0

  /** Daftarkan kolom baru yang muncul di tengah data (CSV tidak rata) */
  function registerColumns(raw: Record<string, unknown>): void {
    for (const key of Object.keys(raw)) {
      // __parsed_extra = field internal PapaParse untuk baris berlebih
      if (key === "__parsed_extra") continue
      if (!columnKeySet.has(key)) {
        columnKeySet.add(key)
        columnKeys.push(key)
      }
    }
  }

  /** Normalisasi satu baris: semua nilai jadi string, kolom hilang = "" */
  function toRowData(raw: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {}
    for (const key of columnKeys) {
      const value = raw[key]
      out[key] = value === undefined || value === null ? "" : String(value)
    }
    for (const key of columnKeys) {
      const value = out[key]
      if (
        value !== "" &&
        !nonNumericColumns.has(key) &&
        !isNumericValue(value)
      ) {
        nonNumericColumns.add(key)
      }
    }
    return out
  }

  /** Simpan batch ke database + perbarui hitungan progres (tiap N batch) */
  async function flush(): Promise<void> {
    if (batch.length === 0) return
    await db.datasetRow.createMany({
      data: batch.map((row) => ({ datasetId, data: row })),
    })
    imported += batch.length
    batch = []
    batchesSinceUpdate += 1
    if (batchesSinceUpdate >= UPDATE_EVERY_N_BATCHES) {
      batchesSinceUpdate = 0
      await db.dataset.update({
        where: { id: datasetId },
        data: { rowCount: imported },
      })
    }
  }

  return new Promise<void>((resolve, reject) => {
    let pending: Promise<void> = Promise.resolve()
    let settled = false
    const fail = (error: unknown): void => {
      if (!settled) {
        settled = true
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    }
    const succeed = (): void => {
      if (!settled) {
        settled = true
        resolve()
      }
    }

    Papa.parse<Record<string, unknown>>(fs.createReadStream(filePath), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h: string, index: number) => {
        const trimmed = h.trim()
        return trimmed === "" ? `Kolom_${index + 1}` : trimmed
      },
      chunk: (results, parser) => {
        // Backpressure: hentikan pembacaan sampai batch ini tersimpan
        parser.pause()
        pending = pending
          .then(async () => {
            for (const raw of results.data) {
              if (!raw || typeof raw !== "object") continue
              registerColumns(raw)
              batch.push(toRowData(raw))
              if (batch.length >= BATCH_SIZE) await flush()
            }
          })
          .then(() => {
            parser.resume()
          })
          .catch(fail)
      },
      complete: () => {
        // Tunggu pemrosesan potongan terakhir sebelum finalisasi
        pending
          .then(async () => {
            if (columnKeys.length === 0) {
              throw new Error("File CSV kosong atau tidak memiliki kolom yang terbaca.")
            }
            await flush()
            const columns: ImportedColumn[] = columnKeys.map((key) => ({
              key,
              isNumeric: !nonNumericColumns.has(key),
            }))
            await db.dataset.update({
              where: { id: datasetId },
              data: {
                status: "done",
                columns: columns as unknown as Prisma.InputJsonValue,
                rowCount: imported,
              },
            })
          })
          .then(succeed, fail)
      },
      error: (error: Error) => fail(error),
    })
  })
}
