import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// ============================================================
// API Dataset — daftar & simpan
// POST /api/datasets  : simpan dataset baru
// GET  /api/datasets  : daftar ringkasan dataset tersimpan
// ============================================================

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nama dataset tidak boleh kosong")
    .max(120, "Nama dataset maksimal 120 karakter"),
  columns: z
    .array(z.string().min(1).max(120))
    .min(1, "Dataset harus punya minimal 1 kolom")
    .max(100, "Dataset maksimal 100 kolom"),
  data: z
    .array(z.record(z.string(), z.string()))
    .max(5000, "Maksimal 5000 baris dapat disimpan"),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  ownerEmail: z.string().email().nullable().optional(),
})

export async function GET() {
  try {
    const datasets = await db.dataset.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        columns: true,
        rowCount: true,
        sizeBytes: true,
        ownerEmail: true,
        createdAt: true,
        sourceType: true,
        status: true,
        importError: true,
      },
    })

    return NextResponse.json(
      datasets.map((d) => ({
        id: d.id,
        name: d.name,
        columns: Array.isArray(d.columns) ? (d.columns as string[]) : [],
        columnCount: Array.isArray(d.columns) ? (d.columns as unknown[]).length : 0,
        rowCount: d.rowCount,
        sizeBytes: d.sizeBytes,
        ownerEmail: d.ownerEmail,
        createdAt: d.createdAt.toISOString(),
        sourceType: d.sourceType,
        status: d.status,
        importError: d.importError,
      }))
    )
  } catch (error) {
    console.error("[GET /api/datasets]", error)
    return NextResponse.json(
      { error: "Gagal mengambil daftar dataset dari database." },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "Data tidak valid"
      return NextResponse.json({ error: firstIssue }, { status: 400 })
    }

    const { name, columns, data, sizeBytes, ownerEmail } = parsed.data

    // Cek duplikat nama dataset
    const existing = await db.dataset.findUnique({ where: { name } })
    if (existing) {
      return NextResponse.json(
        { error: `Nama dataset "${name}" sudah dipakai. Gunakan nama lain.` },
        { status: 409 }
      )
    }

    const dataset = await db.dataset.create({
      data: {
        name,
        columns,
        data,
        rowCount: data.length,
        sizeBytes: sizeBytes ?? null,
        ownerEmail: ownerEmail ?? null,
      },
    })

    return NextResponse.json(
      {
        id: dataset.id,
        name: dataset.name,
        columns,
        columnCount: columns.length,
        rowCount: dataset.rowCount,
        sizeBytes: dataset.sizeBytes,
        ownerEmail: dataset.ownerEmail,
        createdAt: dataset.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[POST /api/datasets]", error)
    return NextResponse.json(
      { error: "Gagal menyimpan dataset ke database." },
      { status: 500 }
    )
  }
}
