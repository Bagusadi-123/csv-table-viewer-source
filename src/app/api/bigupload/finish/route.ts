import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import { Prisma } from "@prisma/client"
import {
  isValidSid,
  partPath,
  readSession,
  removeSessionMeta,
} from "@/lib/big-upload"
import { startImport } from "@/lib/big-import"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// ============================================================
// POST /api/bigupload/finish?sid=...
// Verifikasi kelengkapan file, buat record Dataset (status
// "processing"), lalu mulai import streaming di background.
// ============================================================

/** Cari nama dataset yang belum dipakai (nama unik di database) */
async function generateUniqueName(base: string): Promise<string> {
  let candidate = base.slice(0, 100)
  let suffix = 2
  while (true) {
    const existing = await db.dataset.findUnique({ where: { name: candidate } })
    if (!existing) return candidate
    candidate = `${base.slice(0, 94)} (${suffix})`
    suffix += 1
    if (suffix > 999) return `${base.slice(0, 80)} (${Date.now()})`
  }
}

export async function POST(request: NextRequest) {
  try {
    const sid = request.nextUrl.searchParams.get("sid") ?? ""
    if (!isValidSid(sid)) {
      return NextResponse.json({ error: "Parameter tidak valid." }, { status: 400 })
    }

    const session = readSession(sid)
    if (!session) {
      return NextResponse.json(
        { error: "Sesi unggah tidak ditemukan atau sudah kedaluwarsa." },
        { status: 404 }
      )
    }

    // Verifikasi ukuran file yang terkumpul
    let partSize = 0
    try {
      partSize = (await fs.promises.stat(partPath(sid))).size
    } catch {
      return NextResponse.json(
        { error: "File terkumpul tidak ditemukan — unggah ulang dari awal." },
        { status: 400 }
      )
    }
    if (partSize !== session.sizeBytes) {
      return NextResponse.json(
        {
          error: `Ukuran file terkumpul (${partSize} B) tidak cocok dengan yang dilaporkan (${session.sizeBytes} B).`,
        },
        { status: 400 }
      )
    }

    const name = await generateUniqueName(
      session.name.trim() === "" ? "Dataset Besar" : session.name.trim()
    )

    const dataset = await db.dataset.create({
      data: {
        name,
        sourceType: "big",
        status: "processing",
        columns: [],
        // Field Json opsional harus eksplisit: NULL database (bukan JSON null)
        data: Prisma.DbNull,
        rowCount: 0,
        sizeBytes: session.sizeBytes,
        ownerEmail: session.ownerEmail,
      },
    })

    // Import berjalan di background (fire-and-forget); file sementara
    // dihapus oleh startImport setelah selesai/gagal.
    startImport(dataset.id, partPath(sid))
    removeSessionMeta(sid)

    return NextResponse.json({ id: dataset.id }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/bigupload/finish]", error)
    return NextResponse.json(
      { error: "Gagal menyelesaikan unggahan." },
      { status: 500 }
    )
  }
}
