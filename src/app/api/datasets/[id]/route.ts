import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// ============================================================
// API Dataset — detail & hapus
// GET    /api/datasets/[id] : ambil dataset (dataset besar: metadata saja,
//                              dataset kecil: lengkap dengan data)
// DELETE /api/datasets/[id] : hapus dataset + seluruh barisnya
// ============================================================

function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{5,40}$/.test(id)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidId(id)) {
      return NextResponse.json({ error: "ID tidak valid." }, { status: 400 })
    }

    const dataset = await db.dataset.findUnique({ where: { id } })
    if (!dataset) {
      return NextResponse.json(
        { error: "Dataset tidak ditemukan." },
        { status: 404 }
      )
    }

    // Dataset besar: JANGAN kirim seluruh data (bisa ratusan MB) —
    // cukup metadata; baris diambil per halaman lewat /rows.
    if (dataset.sourceType === "big") {
      return NextResponse.json({
        id: dataset.id,
        name: dataset.name,
        columns: Array.isArray(dataset.columns)
          ? (dataset.columns as unknown[])
          : [],
        columnCount: Array.isArray(dataset.columns)
          ? (dataset.columns as unknown[]).length
          : 0,
        rowCount: dataset.rowCount,
        sizeBytes: dataset.sizeBytes,
        ownerEmail: dataset.ownerEmail,
        createdAt: dataset.createdAt.toISOString(),
        status: dataset.status,
        importError: dataset.importError,
        sourceType: dataset.sourceType,
        data: [],
      })
    }

    const columns = Array.isArray(dataset.columns)
      ? (dataset.columns as string[])
      : []

    return NextResponse.json({
      id: dataset.id,
      name: dataset.name,
      columns,
      columnCount: columns.length,
      rowCount: dataset.rowCount,
      sizeBytes: dataset.sizeBytes,
      ownerEmail: dataset.ownerEmail,
      createdAt: dataset.createdAt.toISOString(),
      status: dataset.status,
      sourceType: dataset.sourceType,
      data: Array.isArray(dataset.data) ? (dataset.data as Record<string, string>[]) : [],
    })
  } catch (error) {
    console.error("[GET /api/datasets/:id]", error)
    return NextResponse.json(
      { error: "Gagal mengambil dataset dari database." },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidId(id)) {
      return NextResponse.json({ error: "ID tidak valid." }, { status: 400 })
    }

    // Hapus baris dataset besar lebih dulu, lalu record dataset-nya
    await db.datasetRow.deleteMany({ where: { datasetId: id } })
    const deleted = await db.dataset.delete({ where: { id } }).catch(() => null)
    if (!deleted) {
      return NextResponse.json(
        { error: "Dataset tidak ditemukan." },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[DELETE /api/datasets/:id]", error)
    return NextResponse.json(
      { error: "Gagal menghapus dataset." },
      { status: 500 }
    )
  }
}
