"use client"

import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import { ApiError } from "@/lib/api/client"
import { exportProductsUrl } from "@/lib/api/products"
import { useImportProducts } from "@/lib/hooks/use-products"
import { formatClock, formatDateID } from "@/lib/format"

type ParsedBackup = {
  fileText: string
  productCount: number
  exportedAt: string
}

export function ProductsBackupDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const importProducts = useImportProducts()
  const [pending, setPending] = useState<ParsedBackup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setPending(null)
    setError(null)
  }

  function handleExport() {
    window.open(exportProductsUrl(), "_blank")
  }

  async function handleFileSelected(file: File) {
    setError(null)
    const fileText = await file.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(fileText)
    } catch {
      setError("Berkas bukan JSON yang valid")
      return
    }
    const envelope = parsed as { productCount?: unknown; exportedAt?: unknown }
    if (
      typeof envelope.productCount !== "number" ||
      typeof envelope.exportedAt !== "string"
    ) {
      setError("Berkas tidak berisi format cadangan produk yang dikenali")
      return
    }
    setPending({
      fileText,
      productCount: envelope.productCount,
      exportedAt: envelope.exportedAt,
    })
  }

  async function handleConfirmImport() {
    if (!pending) return
    try {
      const result = await importProducts.mutateAsync(pending.fileText)
      reset()
      onOpenChange(false)
      toast.add({
        title: "Produk dipulihkan",
        description: `${result.imported} produk (${result.active} aktif, ${result.inactive} nonaktif)`,
      })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Tidak dapat menghubungi server kasir."
      )
    }
  }

  const exportedDate = pending ? new Date(pending.exportedAt) : null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent finalFocus={false}>
        <DialogHeader>
          <DialogTitle>Cadangan produk</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Unduh seluruh katalog produk sebagai berkas cadangan.
          </p>
          <Button type="button" variant="outline" onClick={handleExport}>
            Cadangkan produk
          </Button>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Pulihkan produk dari berkas cadangan. Ini akan{" "}
            <strong>mengganti seluruh katalog produk saat ini</strong> --
            cadangkan dulu jika belum yakin.
          </p>

          {!pending && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (file) handleFileSelected(file)
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Pilih berkas cadangan…
              </Button>
            </>
          )}

          {pending && exportedDate && (
            <div className="rounded-none border border-border bg-muted p-3.5 text-sm">
              <p>
                Impor <strong>{pending.productCount}</strong> produk dari
                cadangan {formatDateID(exportedDate)}, {formatClock(exportedDate)}?
              </p>
              <p className="mt-1 text-muted-foreground">
                Katalog produk saat ini akan diganti seluruhnya dan tidak dapat
                dibatalkan.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {pending ? (
            <>
              <Button type="button" variant="outline" onClick={reset}>
                Batal
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={importProducts.isPending}
                onClick={handleConfirmImport}
              >
                {importProducts.isPending ? "Memulihkan…" : "Ya, ganti katalog"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
