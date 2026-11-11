import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import type { CsvColumnMeta, CsvRow } from "@/types/csv"

export const dynamic = "force-dynamic"

// ============================================================
// GET /api/datasets/[id]/rows — baris dataset besar dengan
// filter, sort, dan pagination DI SISI SERVER (SQL), sehingga
// jutaan baris tetap bisa ditelusuri tanpa memuat semuanya.
//
// Query params:
//   page       : nomor halaman (mulai 1)
//   pageSize   : baris per halaman (25..200)
//   search     : pencarian global (semua kolom)
//   sortCol    : nama kolom untuk pengurutan
//   sortDir    : asc | desc
//   f:<kolom>  : filter "mengandung teks" per kolom
// ============================================================

const MAX_SEARCH_LENGTH = 100

/** Deteksi dialek database dari DATABASE_URL (mysql di komputer user, sqlite di sandbox) */
const isMysql = (process.env.DATABASE_URL ?? "").startsWith("mysql")

/** Ekstraksi nilai satu kolom dari JSON sebagai teks (kompatibel SQLite & MySQL) */
function jsonCol(column: string): Prisma.Sql {
  // Escape tanda kutip/backslash pada nama kolom di dalam path JSON
  const path = `$."${column.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  return isMysql
    ? Prisma.sql`JSON_UNQUOTE(JSON_EXTRACT(data, ${path}))`
    : Prisma.sql`json_extract(data, ${path})`
}

/** Cast seluruh objek JSON menjadi teks (untuk pencarian global) */
function castText(): Prisma.Sql {
  return isMysql ? Prisma.sql`CAST(data AS CHAR)` : Prisma.sql`CAST(data AS TEXT)`
}

function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{5,40}$/.test(id)
}

interface QueryParams {
  page: number
  pageSize: number
  search: string
  sortCol: string | null
  sortDir: "asc" | "desc"
  filters: { column: string; value: string }[]
}

function parseParams(request: NextRequest, validColumns: string[]): QueryParams {
  const sp = request.nextUrl.searchParams
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    200,
    Math.max(1, Number.parseInt(sp.get("pageSize") ?? "25", 10) || 25)
  )
  const search = (sp.get("search") ?? "").trim().slice(0, MAX_SEARCH_LENGTH)

  const sortColRaw = sp.get("sortCol")
  const sortCol =
    sortColRaw !== null && validColumns.includes(sortColRaw) ? sortColRaw : null
  const sortDir = sp.get("sortDir") === "desc" ? "desc" : "asc"

  const filters: { column: string; value: string }[] = []
  for (const [key, rawValue] of sp.entries()) {
    if (!key.startsWith("f:")) continue
    const column = key.slice(2)
    if (!validColumns.includes(column)) continue
    const value = rawValue.trim().slice(0, MAX_SEARCH_LENGTH)
    if (value !== "") filters.push({ column, value })
  }

  return { page, pageSize, search, sortCol, sortDir, filters }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidId(id)) {
      return NextResponse.json({ error: "ID tidak valid." }, { status: 400 })
    }

    const dataset = await db.dataset.findUnique({ where: { id } })
    if (!dataset) {
      return NextResponse.json({ error: "Dataset tidak ditemukan." }, { status: 404 })
    }
    if (dataset.sourceType !== "big") {
      return NextResponse.json(
        { error: "Endpoint ini khusus untuk dataset besar (sourceType big)." },
        { status: 400 }
      )
    }

    // Metadata kolom dataset besar: [{key, isNumeric}]
    const columns = Array.isArray(dataset.columns)
      ? (dataset.columns as unknown[]).filter(
          (c): c is CsvColumnMeta =>
            !!c &&
            typeof c === "object" &&
            typeof (c as CsvColumnMeta).key === "string"
        )
      : []
    const validColumns = columns.map((c) => c.key)

    const { page, pageSize, search, sortCol, sortDir, filters } = parseParams(
      request,
      validColumns
    )

    // ---- Bangun klausa WHERE (parameter terikat, aman injection) ----
    const conditions: Prisma.Sql[] = [Prisma.sql`datasetId = ${id}`]
    if (search !== "") {
      conditions.push(
        Prisma.sql`lower(${castText()}) LIKE ${`%${search.toLowerCase()}%`}`
      )
    }
    for (const filter of filters) {
      conditions.push(
        Prisma.sql`lower(${jsonCol(filter.column)}) LIKE ${`%${filter.value.toLowerCase()}%`}`
      )
    }
    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`

    // ---- Klausa ORDER BY ----
    let orderClause: Prisma.Sql
    if (sortCol !== null) {
      const meta = columns.find((c) => c.key === sortCol)
      const direction = Prisma.raw(sortDir === "desc" ? "DESC" : "ASC")
      if (meta?.isNumeric) {
        // Kolom numerik: urutkan sebagai angka agar 9 < 10 benar
        orderClause = isMysql
          ? Prisma.sql`CAST(${jsonCol(sortCol)} AS DECIMAL(65,4)) ${direction}, id ASC`
          : Prisma.sql`CAST(${jsonCol(sortCol)} AS REAL) ${direction}, id ASC`
      } else {
        orderClause = Prisma.sql`lower(${jsonCol(sortCol)}) ${direction}, id ASC`
      }
    } else {
      orderClause = Prisma.sql`id ASC`
    }

    // ---- Ambil baris halaman ini + total baris (dengan filter sama) ----
    const offset = (page - 1) * pageSize
    const rawRows = await db.$queryRaw<{ data: string }[]>(
      Prisma.sql`SELECT ${castText()} AS data FROM DatasetRow ${whereClause} ORDER BY ${orderClause} LIMIT ${pageSize} OFFSET ${offset}`
    )
    const totalResult = await db.$queryRaw<{ n: number | bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS n FROM DatasetRow ${whereClause}`
    )
    const total = Number(totalResult[0]?.n ?? 0)

    // ---- Normalisasi baris: semua kolom string, kolom hilang = "" ----
    const rows: CsvRow[] = rawRows.map((raw) => {
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(raw.data) as Record<string, unknown>
      } catch {
        parsed = {}
      }
      const row: CsvRow = {}
      for (const col of validColumns) {
        const value = parsed[col]
        row[col] = value === undefined || value === null ? "" : String(value)
      }
      return row
    })

    return NextResponse.json({
      rows,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (error) {
    console.error("[GET /api/datasets/:id/rows]", error)
    return NextResponse.json(
      { error: "Gagal mengambil baris dataset dari database." },
      { status: 500 }
    )
  }
}
