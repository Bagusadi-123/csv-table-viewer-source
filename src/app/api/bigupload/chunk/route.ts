import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import {
  isValidSid,
  partPath,
  readSession,
  writeSession,
} from "@/lib/big-upload"

export const dynamic = "force-dynamic"

// ============================================================
// POST /api/bigupload/chunk?sid=...&index=...
// Body: bytes mentah (application/octet-stream) — satu potongan
// file yang ditambahkan ke file sementara server.
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const sid = request.nextUrl.searchParams.get("sid") ?? ""
    const indexParam = request.nextUrl.searchParams.get("index") ?? ""

    if (!isValidSid(sid) || !/^\d+$/.test(indexParam)) {
      return NextResponse.json({ error: "Parameter tidak valid." }, { status: 400 })
    }

    const session = readSession(sid)
    if (!session) {
      return NextResponse.json(
        { error: "Sesi unggah tidak ditemukan atau sudah kedaluwarsa." },
        { status: 404 }
      )
    }

    const index = Number(indexParam)
    if (index < 0 || index >= session.totalChunks) {
      return NextResponse.json({ error: "Nomor potongan di luar jangkauan." }, { status: 400 })
    }

    const buffer = Buffer.from(await request.arrayBuffer())
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Potongan kosong." }, { status: 400 })
    }

    // Potongan duplikat (retry dari client setelah sukses) → idempoten
    if (index < session.receivedCount) {
      return NextResponse.json({
        received: session.receivedCount,
        total: session.totalChunks,
      })
    }

    // Harus berurutan: hanya terima potongan berikutnya
    if (index > session.receivedCount) {
      return NextResponse.json(
        { error: "Urutan potongan tidak sesuai." },
        { status: 409 }
      )
    }

    if (session.receivedBytes + buffer.length > session.sizeBytes) {
      return NextResponse.json(
        { error: "Total potongan melebihi ukuran file yang dilaporkan." },
        { status: 400 }
      )
    }

    await fs.promises.appendFile(partPath(sid), buffer)

    session.receivedCount += 1
    session.receivedBytes += buffer.length
    writeSession(session)

    return NextResponse.json({
      received: session.receivedCount,
      total: session.totalChunks,
    })
  } catch (error) {
    console.error("[POST /api/bigupload/chunk]", error)
    return NextResponse.json({ error: "Gagal menerima potongan file." }, { status: 500 })
  }
}
