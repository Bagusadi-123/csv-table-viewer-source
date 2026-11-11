// ============================================================
// big-upload — utilitas sesi unggah file besar di sisi server
// ------------------------------------------------------------
// File besar (10 MB s.d. 500 MB) diunggah secara BERTAHAP
// (chunk) dari browser: tiap potongan di-POST ke
// /api/bigupload/chunk dan ditambahkan ke file sementara di
// db/uploads/<sid>.part. Status sesi disimpan di
// db/uploads/<sid>.json sehingga tahan terhadap hot-reload.
// ============================================================

import fs from "fs"
import path from "path"

/** Batas total ukuran file untuk jalur big data */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

/** Ukuran satu potongan yang dikirim browser (8 MB) */
export const CHUNK_SIZE = 8 * 1024 * 1024

/** Folder penyimpanan sementara (dibuat otomatis) */
export const UPLOADS_DIR = path.join(process.cwd(), "db", "uploads")

export interface UploadSession {
  sid: string
  name: string
  sizeBytes: number
  totalChunks: number
  /** jumlah potongan yang sudah diterima berurutan */
  receivedCount: number
  /** total byte yang sudah diterima */
  receivedBytes: number
  ownerEmail: string | null
}

/** Format SID yang valid (UUID v4 dari crypto.randomUUID) */
export function isValidSid(sid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sid)
}

export function sessionPath(sid: string): string {
  return path.join(UPLOADS_DIR, `${sid}.json`)
}

export function partPath(sid: string): string {
  return path.join(UPLOADS_DIR, `${sid}.part`)
}

export function readSession(sid: string): UploadSession | null {
  try {
    const raw = fs.readFileSync(sessionPath(sid), "utf8")
    return JSON.parse(raw) as UploadSession
  } catch {
    return null
  }
}

export function writeSession(session: UploadSession): void {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  fs.writeFileSync(sessionPath(session.sid), JSON.stringify(session), "utf8")
}

/** Hapus file meta sesi (dipanggil setelah finish) */
export function removeSessionMeta(sid: string): void {
  void fs.promises.unlink(sessionPath(sid)).catch(() => undefined)
}
