"use client"

// ============================================================
// ServerTable — tabel interaktif untuk DATASET BESAR (100–500 MB)
// Filter, pencarian, pengurutan, dan pagination diproses di
// SERVER (SQL ke tabel DatasetRow), sehingga jutaan baris bisa
// ditelusuri tanpa memuat seluruh data ke browser.
// ============================================================

import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Columns3,
  Database,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Server,
  X,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { exportRowsToCsv, formatBytes } from "@/lib/csv-utils"
import type { CsvColumnMeta, ServerDatasetMeta, ServerRowsPage } from "@/types/csv"

interface ServerTableProps {
  dataset: ServerDatasetMeta
  onReset: () => void
}

/** Debounce sederhana untuk input pencarian/filter */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

type SortState = { col: string; dir: "asc" | "desc" } | null

export function ServerTable({ dataset, onReset }: ServerTableProps) {
  const { toast } = useToast()
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)
  const [searchInput, setSearchInput] = React.useState("")
  const [filterInputs, setFilterInputs] = React.useState<Record<string, string>>({})
  const [sort, setSort] = React.useState<SortState>(null)
  const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({})
  const [result, setResult] = React.useState<ServerRowsPage | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [reloadKey, setReloadKey] = React.useState(0)

  const search = useDebounced(searchInput.trim(), 500)
  const filters = useDebounced(filterInputs, 500)

  // Reset state saat berganti dataset
  React.useEffect(() => {
    setPage(1)
    setSearchInput("")
    setFilterInputs({})
    setSort(null)
    setColumnVisibility({})
  }, [dataset.id])

  // Bangun query params dari state
  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("pageSize", String(pageSize))
    if (search !== "") params.set("search", search)
    if (sort) {
      params.set("sortCol", sort.col)
      params.set("sortDir", sort.dir)
    }
    for (const [col, value] of Object.entries(filters)) {
      if (value.trim() !== "") params.set(`f:${col}`, value.trim())
    }
    return params.toString()
  }, [page, pageSize, search, filters, sort, dataset.id])

  // Ambil baris dari server setiap kali query berubah
  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/datasets/${dataset.id}/rows?${queryParams}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as ServerRowsPage & {
          error?: string
        }
        if (!res.ok) throw new Error(json.error ?? "Gagal memuat baris dataset.")
        setResult(json)
      })
      .catch((error: unknown) => {
        if ((error as Error).name === "AbortError") return
        toast({
          title: "Gagal memuat data",
          description: error instanceof Error ? error.message : "Error tidak diketahui.",
          variant: "destructive",
        })
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [queryParams, reloadKey])

  const visibleColumns: CsvColumnMeta[] = dataset.columns.filter(
    (col) => columnVisibility[col.key] !== false
  )
  const hasActiveFilter =
    search !== "" || Object.values(filters).some((v) => v.trim() !== "")
  const total = result?.total ?? 0
  const pageCount = result?.pageCount ?? 1
  const rows = result?.rows ?? []

  const resetAllFilters = () => {
    setSearchInput("")
    setFilterInputs({})
    setPage(1)
  }

  const toggleSort = (col: string) => {
    setSort((current) => {
      if (current === null || current.col !== col) return { col, dir: "asc" }
      if (current.dir === "asc") return { col, dir: "desc" }
      return null
    })
    setPage(1)
  }

  const handleExportPage = () => {
    exportRowsToCsv(visibleColumns, rows, `${dataset.name}-halaman-${page}`)
    toast({
      title: "Export halaman berhasil",
      description: `${rows.length.toLocaleString("id-ID")} baris pada halaman ini diunduh sebagai CSV.`,
    })
  }

  return (
    <div className="w-full space-y-4">
      {/* ===== Info dataset ===== */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{dataset.name}</h2>
        <Badge variant="secondary" className="gap-1">
          <Server className="h-3 w-3" aria-hidden="true" />
          Big Data • server-side
        </Badge>
        <Badge variant="outline" className="tabular-nums">
          {total.toLocaleString("id-ID")} baris
        </Badge>
        {dataset.sizeBytes != null && (
          <Badge variant="outline" className="tabular-nums">
            {formatBytes(dataset.sizeBytes)}
          </Badge>
        )}
        {hasActiveFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetAllFilters}
            className="h-8 gap-1 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Hapus filter
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="ml-auto h-8 gap-1 text-muted-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Upload CSV Lain
        </Button>
      </div>

      {/* ===== Toolbar ===== */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-56">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              setPage(1)
            }}
            placeholder="Cari di semua kolom (server)…"
            className="h-10 pl-9"
            aria-label="Cari di semua kolom"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-10 gap-2">
              <Columns3 className="h-4 w-4" aria-hidden="true" />
              Kolom
              <Badge variant="secondary" className="ml-1 tabular-nums">
                {visibleColumns.length}/{dataset.columns.length}
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <p className="mb-2 text-sm font-medium">Kolom yang ditampilkan</p>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {dataset.columns.map((col) => (
                <label
                  key={col.key}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={columnVisibility[col.key] !== false}
                    onCheckedChange={(value) =>
                      setColumnVisibility((current) => ({
                        ...current,
                        [col.key]: Boolean(value),
                      }))
                    }
                  />
                  <span className="truncate">{col.key}</span>
                </label>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setColumnVisibility({})}
            >
              Tampilkan semua
            </Button>
          </PopoverContent>
        </Popover>

        <Button variant="outline" className="h-10 gap-2" onClick={handleExportPage}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Export Halaman Ini
        </Button>

        <Button
          variant="outline"
          className="h-10 gap-2"
          onClick={() => setReloadKey((k) => k + 1)}
          aria-label="Muat ulang data dari server"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Muat Ulang
        </Button>
      </div>

      {/* ===== Tabel ===== */}
      <div className="overflow-hidden rounded-lg border">
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
              {/* Baris judul kolom */}
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 bg-background text-center font-medium text-muted-foreground">
                  #
                </TableHead>
                {visibleColumns.map((col) => (
                  <TableHead key={col.key} className="bg-background">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="group flex w-full items-center gap-1 text-left font-semibold"
                      aria-label={`Urutkan berdasarkan ${col.key}`}
                    >
                      <span className="truncate">{col.key}</span>
                      <span className="shrink-0 text-muted-foreground/50">
                        {sort?.col === col.key && sort.dir === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        ) : sort?.col === col.key && sort.dir === "desc" ? (
                          <ArrowDown className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown
                            className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </button>
                  </TableHead>
                ))}
              </TableRow>
              {/* Baris filter per kolom */}
              <TableRow className="hover:bg-transparent">
                <TableHead className="bg-muted/60 text-center font-medium text-muted-foreground">
                  <Search className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
                </TableHead>
                {visibleColumns.map((col) => (
                  <TableHead key={`filter-${col.key}`} className="bg-muted/60 p-1.5">
                    <Input
                      value={filterInputs[col.key] ?? ""}
                      onChange={(e) => {
                        setFilterInputs((current) => ({
                          ...current,
                          [col.key]: e.target.value,
                        }))
                        setPage(1)
                      }}
                      placeholder="Filter…"
                      className="h-8 border-transparent bg-background/80 text-xs focus-visible:ring-1"
                      aria-label={`Filter kolom ${col.key}`}
                    />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length + 1}
                    className="h-24 text-center text-muted-foreground"
                  >
                    <Loader2
                      className="mx-auto h-5 w-5 animate-spin"
                      aria-hidden="true"
                    />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length + 1}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Tidak ada baris yang cocok dengan filter.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow
                    key={`${page}-${index}`}
                    className={index % 2 === 1 ? "bg-muted/30 hover:bg-muted/50" : ""}
                  >
                    <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                      {(page - 1) * pageSize + index + 1}
                    </TableCell>
                    {visibleColumns.map((col) => {
                      const value = row[col.key] ?? ""
                      return (
                        <TableCell key={col.key}>
                          <div
                            title={value}
                            className={`max-w-64 truncate ${
                              col.isNumeric ? "text-right tabular-nums" : ""
                            }`}
                          >
                            {value === "" ? (
                              <span className="text-muted-foreground/40">—</span>
                            ) : (
                              value
                            )}
                          </div>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ===== Pagination ===== */}
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          <span>
            Halaman{" "}
            <strong className="text-foreground tabular-nums">{page}</strong>{" "}
            dari{" "}
            <strong className="text-foreground tabular-nums">{pageCount}</strong>
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value))
              setPage(1)
            }}
          >
            <SelectTrigger className="h-9 w-28" aria-label="Baris per halaman">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / hal.
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Sebelumnya
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount || loading}
          >
            Berikutnya
          </Button>
        </div>
      </div>

      {/* ===== Catatan arsitektur ===== */}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Dataset besar: pencarian, filter, pengurutan, dan pagination diproses di
        server melalui SQL (tabel DatasetRow di database) — browser hanya menerima{" "}
        {pageSize} baris per halaman.
      </p>
    </div>
  )
}
