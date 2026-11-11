"use client"

// ============================================================
// DatasetList — daftar dataset yang tersimpan di database
// Fitur: muat dataset ke tabel, hapus dataset (dengan konfirmasi)
// ============================================================

import * as React from "react"
import {
  AlertTriangle,
  Database,
  FolderOpen,
  Loader2,
  RefreshCw,
  Server,
  Trash2,
  UserRound,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatBytes, formatDateId } from "@/lib/csv-utils"
import type { DatasetSummary } from "@/types/csv"

interface DatasetListProps {
  datasets: DatasetSummary[]
  loading: boolean
  onLoad: (dataset: DatasetSummary) => void
  onDeleted: () => void
  /** tombol muat ulang daftar (opsional) */
  onRefresh?: () => void
}

export function DatasetList({ datasets, loading, onLoad, onDeleted, onRefresh }: DatasetListProps) {
  const { toast } = useToast()
  const [deleteTarget, setDeleteTarget] = React.useState<DatasetSummary | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/datasets/${deleteTarget.id}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? "Gagal menghapus dataset.")
      toast({
        title: "Dataset dihapus",
        description: `"${deleteTarget.name}" dihapus dari database.`,
      })
      setDeleteTarget(null)
      onDeleted()
    } catch (error) {
      toast({
        title: "Gagal menghapus",
        description: error instanceof Error ? error.message : "Error tidak diketahui.",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section aria-labelledby="saved-datasets-title" className="space-y-4">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        <h2 id="saved-datasets-title" className="text-lg font-semibold">
          Dataset Tersimpan
        </h2>
        <Badge variant="secondary" className="tabular-nums">
          {datasets.length}
        </Badge>
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 gap-1 text-muted-foreground"
            onClick={onRefresh}
            aria-label="Muat ulang daftar dataset"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Muat Ulang
          </Button>
        )}
      </div>

      {datasets.length === 0 && !loading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <FolderOpen
              className="h-10 w-10 text-muted-foreground/50"
              aria-hidden="true"
            />
            <p className="font-medium">Belum ada dataset tersimpan</p>
            <p className="text-sm text-muted-foreground">
              Unggah CSV lalu klik{" "}
              <span className="font-medium text-foreground">Simpan ke Database</span>{" "}
              agar datanya tersimpan permanen dan bisa dimuat kembali.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {datasets.map((ds) => {
            const isBig = ds.sourceType === "big"
            const isProcessing = ds.status === "processing"
            const isFailed = ds.status === "failed"
            const canLoad = !isProcessing && !isFailed
            return (
            <Card key={ds.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold" title={ds.name}>
                      {ds.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateId(ds.createdAt)}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    {ds.rowCount.toLocaleString("id-ID")} baris
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {isBig && (
                    <Badge
                      variant="secondary"
                      className="gap-1 font-normal text-emerald-700 dark:text-emerald-300"
                    >
                      <Server className="h-3 w-3" aria-hidden="true" />
                      Big Data
                    </Badge>
                  )}
                  <Badge variant="secondary" className="font-normal tabular-nums">
                    {ds.columnCount} kolom
                  </Badge>
                  <Badge variant="secondary" className="font-normal">
                    {formatBytes(ds.sizeBytes)}
                  </Badge>
                  {ds.ownerEmail ? (
                    <Badge variant="secondary" className="max-w-44 font-normal">
                      <UserRound className="mr-1 h-3 w-3" aria-hidden="true" />
                      <span className="truncate">{ds.ownerEmail}</span>
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="font-normal">
                      Tanpa pemilik
                    </Badge>
                  )}
                </div>

                {/* Status import dataset besar */}
                {isProcessing && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Sedang diproses di server — {ds.rowCount.toLocaleString("id-ID")}{" "}
                    baris tersimpan…
                  </p>
                )}
                {isFailed && (
                  <p
                    className="flex items-start gap-1.5 text-xs text-destructive"
                    title={ds.importError ?? undefined}
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="line-clamp-2">
                      Import gagal: {ds.importError ?? "error tidak diketahui"}
                    </span>
                  </p>
                )}

                <div className="mt-auto flex gap-2">
                  <Button
                    size="sm"
                    className="h-9 flex-1 gap-1.5"
                    disabled={!canLoad}
                    onClick={() => onLoad(ds)}
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    Muat
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteTarget(ds)}
                    aria-label={`Hapus dataset ${ds.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}

      {/* Dialog konfirmasi hapus */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus dataset ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Dataset{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span>{" "}
              beserta{" "}
              {deleteTarget?.rowCount.toLocaleString("id-ID")} baris datanya akan
              dihapus permanen dari database. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              {deleting ? "Menghapus…" : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
