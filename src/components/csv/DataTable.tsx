"use client"

// ============================================================
// DataTable — tabel interaktif hasil parsing CSV
// Fitur: pencarian global, filter per kolom, sorting,
//        pagination, visibilitas kolom, export CSV,
//        dan simpan dataset ke database (Prisma/MySQL)
// ============================================================

import * as React from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
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
  X,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { exportRowsToCsv } from "@/lib/csv-utils"
import type { ActiveDataset, AuthUserInfo, CsvRow } from "@/types/csv"

interface DataTableProps {
  dataset: ActiveDataset
  user: AuthUserInfo | null
  onDatasetSaved: () => void
  onReset: () => void
}

/** Sorting yang paham angka (kolom numerik diurutkan secara numerik) */
function smartSortingFn(rowA: { getValue: (id: string) => unknown }, rowB: { getValue: (id: string) => unknown }, columnId: string): number {
  const a = String(rowA.getValue(columnId) ?? "")
  const b = String(rowB.getValue(columnId) ?? "")
  if (a === "" && b === "") return 0
  if (a === "") return 1 // baris kosong selalu di bawah
  if (b === "") return -1
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    // hindari "1" dianggap angka padahal bagian dari teks seperti "PROD-001"
    if (/^-?\d+(\.\d+)?$/.test(a.trim()) || /^-?\d+(\.\d+)?$/.test(b.trim())) {
      if (/^-?\d+(\.\d+)?$/.test(a.trim()) && /^-?\d+(\.\d+)?$/.test(b.trim())) {
        return na - nb
      }
    }
  }
  return a.localeCompare(b, "id", { numeric: true, sensitivity: "base" })
}

/** Filter "mengandung teks" (case-insensitive) untuk satu kolom */
function containsFilter(
  row: { getValue: (id: string) => unknown },
  columnId: string,
  filterValue: unknown
): boolean {
  const value = String(row.getValue(columnId) ?? "")
  const search = String(filterValue ?? "").toLowerCase()
  if (search === "") return true
  return value.toLowerCase().includes(search)
}

export function DataTable({ dataset, user, onDatasetSaved, onReset }: DataTableProps) {
  const { toast } = useToast()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [saveName, setSaveName] = React.useState(dataset.name)
  const [saving, setSaving] = React.useState(false)

  // Sinkronkan nama & reset state ketika dataset berubah
  React.useEffect(() => {
    setSaveName(dataset.name)
    setSorting([])
    setColumnFilters([])
    setColumnVisibility({})
    setGlobalFilter("")
  }, [dataset])

  const columns = React.useMemo<ColumnDef<CsvRow>[]>(
    () =>
      dataset.columns.map((col) => ({
        accessorKey: col.key,
        header: col.key,
        filterFn: containsFilter,
        sortingFn: smartSortingFn,
        cell: ({ row }) => {
          const value = String(row.getValue(col.key) ?? "")
          return (
            <div
              title={value}
              className={`max-w-64 truncate ${col.isNumeric ? "text-right tabular-nums" : ""}`}
            >
              {value === "" ? <span className="text-muted-foreground/40">—</span> : value}
            </div>
          )
        },
      })),
    [dataset.columns]
  )

  const table = useReactTable({
    data: dataset.rows,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
    initialState: { pagination: { pageSize: 10 } },
  })

  const filteredCount = table.getFilteredRowModel().rows.length
  const totalCount = dataset.rows.length
  const hasActiveFilter =
    globalFilter !== "" || columnFilters.length > 0
  const pageCount = table.getPageCount()

  const handleExport = () => {
    const filteredRows = table.getFilteredRowModel().rows.map((r) => r.original)
    exportRowsToCsv(
      dataset.columns,
      filteredRows,
      `${dataset.name}-tersaring`,
      ","
    )
    toast({
      title: "Export CSV berhasil",
      description: `${filteredRows.length.toLocaleString("id-ID")} baris (hasil filter) diunduh.`,
    })
  }

  const handleSave = async () => {
    const name = saveName.trim()
    if (name === "") {
      toast({
        title: "Nama kosong",
        description: "Isi nama dataset terlebih dahulu.",
        variant: "destructive",
      })
      return
    }
    if (totalCount > 5000) {
      toast({
        title: "Dataset terlalu besar",
        description: "Maksimal 5.000 baris dapat disimpan ke database.",
        variant: "destructive",
      })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          columns: dataset.columns.map((c) => c.key),
          data: dataset.rows,
          sizeBytes: dataset.sizeBytes ?? null,
          ownerEmail: user?.email ?? null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error ?? "Gagal menyimpan dataset.")
      }
      toast({
        title: "Dataset tersimpan ke database",
        description: `"${name}" (${totalCount.toLocaleString("id-ID")} baris) berhasil disimpan${
          user?.email ? ` atas nama ${user.email}` : ""
        }.`,
      })
      setSaveOpen(false)
      onDatasetSaved()
    } catch (error) {
      toast({
        title: "Gagal menyimpan",
        description: error instanceof Error ? error.message : "Error tidak diketahui.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const resetAllFilters = () => {
    setGlobalFilter("")
    setColumnFilters([])
    table.resetColumnFilters()
  }

  return (
    <div className="w-full space-y-4">
      {/* ===== Info dataset ===== */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{dataset.name}</h2>
        {dataset.dbId && (
          <Badge variant="secondary" className="gap-1">
            <Database className="h-3 w-3" aria-hidden="true" />
            Dimuat dari database
          </Badge>
        )}
        <Badge variant="outline" className="tabular-nums">
          {filteredCount.toLocaleString("id-ID")} / {totalCount.toLocaleString("id-ID")} baris
        </Badge>
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
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Cari di semua kolom…"
            className="h-10 pl-9"
            aria-label="Cari di semua kolom"
          />
        </div>

        {/* Dropdown visibilitas kolom */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-10 gap-2">
              <Columns3 className="h-4 w-4" aria-hidden="true" />
              Kolom
              <Badge variant="secondary" className="ml-1 tabular-nums">
                {table.getVisibleLeafColumns().length}/{dataset.columns.length}
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
                    checked={table.getColumn(col.key)?.getIsVisible() ?? true}
                    onCheckedChange={(value) =>
                      table.getColumn(col.key)?.toggleVisibility(Boolean(value))
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

        <Button variant="outline" className="h-10 gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </Button>

        <Button className="h-10 gap-2" onClick={() => setSaveOpen(true)}>
          <Database className="h-4 w-4" aria-hidden="true" />
          Simpan ke Database
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
                {table.getHeaderGroups()[0]?.headers.map((header) => (
                  <TableHead key={header.id} className="bg-background">
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="group flex w-full items-center gap-1 text-left font-semibold"
                      aria-label={`Urutkan berdasarkan ${String(header.column.columnDef.header)}`}
                    >
                      <span className="truncate">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      <span className="shrink-0 text-muted-foreground/50">
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        ) : header.column.getIsSorted() === "desc" ? (
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
                {table.getHeaderGroups()[0]?.headers.map((header) => {
                  const filterValue = (header.column.getFilterValue() as string) ?? ""
                  return (
                    <TableHead key={`filter-${header.id}`} className="bg-muted/60 p-1.5">
                      <Input
                        value={filterValue}
                        onChange={(e) =>
                          header.column.setFilterValue(e.target.value === "" ? undefined : e.target.value)
                        }
                        placeholder="Filter…"
                        className="h-8 border-transparent bg-background/80 text-xs focus-visible:ring-1"
                        aria-label={`Filter kolom ${String(header.column.columnDef.header)}`}
                      />
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={dataset.columns.length + 1}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Tidak ada baris yang cocok dengan filter.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row, displayIndex) => (
                  <TableRow
                    key={row.id}
                    className={displayIndex % 2 === 1 ? "bg-muted/30 hover:bg-muted/50" : ""}
                  >
                    <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                      {displayIndex + 1 + table.getState().pagination.pageIndex * table.getState().pagination.pageSize}
                    </TableCell>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
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
          <span>
            Halaman{" "}
            <strong className="text-foreground tabular-nums">
              {pageCount === 0 ? 0 : table.getState().pagination.pageIndex + 1}
            </strong>{" "}
            dari{" "}
            <strong className="text-foreground tabular-nums">{pageCount}</strong>
          </span>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger className="h-9 w-28" aria-label="Baris per halaman">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / hal.
                </SelectItem>
              ))}
              <SelectItem value="999999">Semua</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Sebelumnya
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Berikutnya
          </Button>
        </div>
      </div>

      {/* ===== Dialog simpan ke database ===== */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Simpan ke Database</DialogTitle>
            <DialogDescription>
              Dataset akan disimpan melalui Prisma ORM ke database
              (MySQL-ready) dan bisa dimuat kembali kapan saja.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="save-name">Nama dataset</Label>
              <Input
                id="save-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                maxLength={120}
                placeholder="mis. Data Penjualan Q1"
              />
              <p className="text-xs text-muted-foreground">
                {totalCount.toLocaleString("id-ID")} baris •{" "}
                {dataset.columns.length} kolom akan disimpan.
                {user?.email
                  ? ` Pemilik: ${user.email}`
                  : " Belum login — dataset akan tersimpan tanpa pemilik."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setSaveOpen(false)}>
              Batal
            </Button>
            <Button className="h-11 gap-2" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Database className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
