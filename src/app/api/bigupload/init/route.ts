import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { MAX_UPLOAD_BYTES, writeSession } from "@/lib/big-upload"

export const dynamic = "force-dynamic"

// ============================================================
// POST /api/bigupload/init — mulai sesi unggah file besar
// Body: { name, sizeBytes, totalChunks, ownerEmail? }
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      name?: unknown
      sizeBytes?: unknown
      totalChunks?: unknown
      ownerEmail?: unknown
    } | null

    if (!body) {
      return NextResponse.json({ error: "Body request tidak valid." }, { status: 400 })
    }

    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
    const sizeBytes = typeof body.sizeBytes === "number" ? Math.floor(body.sizeBytes) : -1
    const totalChunks = typeof body.totalChunks === "number" ? Math.floor(body.totalChunks) : 0
    const ownerEmail =
      typeof body.ownerEmail === "string" && body.ownerEmail.includes("@")
        ? body.ownerEmail
        : null

    if (name === "") {
      return NextResponse.json({ error: "Nama dataset tidak boleh kosong." }, { status: 400 })
    }
    if (sizeBytes <= 0) {
      return NextResponse.json({ error: "Ukuran file tidak valid." }, { status: 400 })
    }
    if (sizeBytes > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Ukuran file melebihi batas 500 MB." },
        { status: 400 }
      )
    }
    if (totalChunks < 1 || totalChunks > 10000) {
      return NextResponse.json({ error: "Jumlah potongan tidak valid." }, { status: 400 })
    }

    const sid = randomUUID()
    writeSession({
      sid,
      name,
      sizeBytes,
      totalChunks,
      receivedCount: 0,
      receivedBytes: 0,
      ownerEmail,
    })

    return NextResponse.json({ sid }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/bigupload/init]", error)
    return NextResponse.json({ error: "Gagal memulai sesi unggah." }, { status: 500 })
  }
}
