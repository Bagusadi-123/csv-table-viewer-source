"use client"

// ============================================================
// Utilitas CSV — parsing, inferensi tipe kolom, dan export
// ============================================================

import Papa from "papaparse"
import type { CsvColumnMeta, CsvRow } from "@/types/csv"

/** Hasil parsing CSV */
export interface ParseResult {
  name: string
  columns: CsvColumnMeta[]
  rows: CsvRow[]
  sizeBytes?: number
}

/** Batas ukuran file yang diizinkan (100 MB) — dibaca bertahap (streaming) */
export const MAX_FILE_SIZE = 100 * 1024 * 1024

/** Laporan kemajuan saat parsing file besar */
export interface ParseProgress {
  /** Fraksi kemajuan 0..1 */
  fraction: number
  /** Jumlah baris yang sudah terbaca */
  rowCount: number
}

/** Periksa apakah sebuah string adalah angka valid */
function isNumericValue(value: string): boolean {
  if (value.trim() === "") return false
  return Number.isFinite(Number(value.replace(",", ".")))
}

/** Bangun metadata kolom (nama + apakah numerik) dari baris data */
export function buildColumnMeta(rows: CsvRow[]): CsvColumnMeta[] {
  const headerSet = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) headerSet.add(key)
  }
  return Array.from(headerSet).map((key) => {
    const isNumeric = rows.every(
      (row) => row[key] === undefined || row[key] === "" || isNumericValue(row[key])
    )
    return { key, isNumeric }
  })
}

/**
 * Parse teks CSV menjadi kolom + baris.
 * Delimiter (koma / titik-koma / tab) dideteksi otomatis oleh PapaParse.
 */
export function parseCsvText(text: string, name: string, sizeBytes?: number): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    // hindari bertabrakan dengan nama field internal PapaParse
    transformHeader: (h: string, index: number) => {
      const trimmed = h.trim()
      return trimmed === "" ? `Kolom_${index + 1}` : trimmed
    },
  })

  const rows = (parsed.data ?? []).filter(
    (row) => row && typeof row === "object"
  ) as CsvRow[]

  // Susun daftar kolom dari field pertama yang tersedia
  const headerSet = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) headerSet.add(key)
  }
  // Jika tidak ada baris tapi ada hasil header dari Papa, pakai itu
  if (headerSet.size === 0 && parsed.meta.fields && parsed.meta.fields.length > 0) {
    for (const key of parsed.meta.fields) headerSet.add(key)
  }

  const columns: CsvColumnMeta[] = Array.from(headerSet).map((key) => {
    const isNumeric = rows.every(
      (row) => row[key] === undefined || row[key] === "" || isNumericValue(row[key])
    )
    return { key, isNumeric }
  })

  // Pastikan setiap baris memiliki semua key (sel kosong = "")
  const normalizedRows: CsvRow[] = rows.map((row) => {
    const normalized: CsvRow = {}
    for (const col of columns) {
      const value = row[col.key]
      normalized[col.key] = value === undefined || value === null ? "" : String(value)
    }
    return normalized
  })

  return { name, columns, rows: normalizedRows, sizeBytes }
}

/**
 * Parse object File CSV (dipakai saat upload dari disk).
 * File dibaca bertahap (chunk 4 MB) lewat FileReader sehingga UI tetap
 * responsif dan memori tidak meledak untuk file hingga 100 MB.
 */
export function parseCsvFile(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `Ukuran file ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 100 MB.`
    )
  }
  const datasetName = file.name.replace(/\.(csv|txt)$/i, "")

  return new Promise<ParseResult>((resolve, reject) => {
    const rows: CsvRow[] = []
    const columnKeys: string[] = []
    const columnKeySet = new Set<string>()
    const nonNumericColumns = new Set<string>()

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h: string, index: number) => {
        const trimmed = h.trim()
        return trimmed === "" ? `Kolom_${index + 1}` : trimmed
      },
      chunkSize: 4 * 1024 * 1024,
      chunk: (results) => {
        // Daftarkan kolom (header terbaca pada potongan pertama)
        for (const field of results.meta.fields ?? []) {
          if (!columnKeySet.has(field)) {
            columnKeySet.add(field)
            columnKeys.push(field)
          }
        }
        for (const raw of results.data) {
          if (!raw || typeof raw !== "object") continue
          // CSV tidak rapi: kolom baru yang muncul di tengah data tetap disimpan
          for (const extraKey of Object.keys(raw)) {
            if (!columnKeySet.has(extraKey)) {
              columnKeySet.add(extraKey)
              columnKeys.push(extraKey)
            }
          }
          const normalized: CsvRow = {}
          for (const key of columnKeys) {
            const value = raw[key]
            normalized[key] = value === undefined || value === null ? "" : String(value)
          }
          // Tandai kolom yang mengandung nilai non-numerik
          for (const key of columnKeys) {
            const value = normalized[key]
            if (
              value !== "" &&
              !nonNumericColumns.has(key) &&
              !isNumericValue(value)
            ) {
              nonNumericColumns.add(key)
            }
          }
          rows.push(normalized)
        }
        onProgress?.({
          fraction:
            file.size === 0
              ? 1
              : Math.min(1, (results.meta.cursor ?? 0) / file.size),
          rowCount: rows.length,
        })
      },
      complete: () => {
        if (columnKeys.length === 0) {
          reject(
            new Error("File CSV kosong atau tidak memiliki kolom yang terbaca.")
          )
          return
        }
        const columns: CsvColumnMeta[] = columnKeys.map((key) => ({
          key,
          isNumeric: !nonNumericColumns.has(key),
        }))
        resolve({ name: datasetName, columns, rows, sizeBytes: file.size })
      },
      error: (error: Error) =>
        reject(new Error(error.message || "Gagal membaca file CSV.")),
    })
  })
}

/**
 * Gabungkan nilai sel dan escape sesuai format CSV:
 * tambahkan tanda kutip jika mengandung delimiter / kutip / newline.
 */
function escapeCsvCell(value: string, delimiter: string): string {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Export baris yang sudah difilter kembali menjadi file CSV */
export function exportRowsToCsv(
  columns: CsvColumnMeta[],
  rows: CsvRow[],
  filename: string,
  delimiter = ","
): void {
  const headerLine = columns.map((c) => escapeCsvCell(c.key, delimiter)).join(delimiter)
  const bodyLines = rows.map((row) =>
    columns.map((c) => escapeCsvCell(row[c.key] ?? "", delimiter)).join(delimiter)
  )
  const csv = [headerLine, ...bodyLines].join("\r\n")

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Format ukuran file menjadi teks yang mudah dibaca */
export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) return "-"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** Format tanggal ke Bahasa Indonesia */
export function formatDateId(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}
