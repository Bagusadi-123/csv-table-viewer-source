// Tipe data bersama untuk CSV Table Viewer

/** Satu baris data CSV — key = nama kolom, value = isi sel (string) */
export type CsvRow = Record<string, string>

/** Metadata kolom hasil parsing CSV */
export interface CsvColumnMeta {
  /** Nama kolom persis seperti di header CSV */
  key: string
  /** true jika semua nilai non-kosong di kolom ini adalah angka */
  isNumeric: boolean
}

/** Dataset yang sedang aktif di tabel */
export interface ActiveDataset {
  name: string
  columns: CsvColumnMeta[]
  rows: CsvRow[]
  sizeBytes?: number
  /** id dataset di database jika dimuat dari database */
  dbId?: string
}

/** Ringkasan dataset tersimpan (untuk daftar, tanpa data penuh) */
export interface DatasetSummary {
  id: string
  name: string
  rowCount: number
  columnCount: number
  columns: string[]
  sizeBytes?: number | null
  ownerEmail?: string | null
  createdAt: string
  /** "small" = blob JSON (browser-side); "big" = per-baris (server-side) */
  sourceType?: DatasetSourceType
  /** "processing" | "done" | "failed" (status import file besar) */
  status?: DatasetStatus
  importError?: string | null
}

/** Dataset lengkap dari API */
export interface DatasetDetail extends DatasetSummary {
  data: CsvRow[]
}

/** Sumber penyimpanan dataset */
export type DatasetSourceType = "small" | "big"

/** Status import dataset besar */
export type DatasetStatus = "processing" | "done" | "failed"

/** Metadata dataset besar untuk tabel server-side */
export interface ServerDatasetMeta {
  id: string
  name: string
  columns: CsvColumnMeta[]
  rowCount: number
  sizeBytes?: number | null
  ownerEmail?: string | null
  status?: DatasetStatus
  sourceType?: DatasetSourceType
}

/** Respon API /api/datasets/[id]/rows */
export interface ServerRowsPage {
  rows: CsvRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

/** Info pengguna Firebase yang sedang login */
export interface AuthUserInfo {
  uid: string
  email: string | null
  displayName: string | null
}
