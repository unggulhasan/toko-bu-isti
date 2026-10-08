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
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ApiError } from "@/lib/api/client"
import { useExportProducts, useImportProducts } from "@/lib/hooks/use-products"
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
  const exportProducts = useExportProducts()
  const [pending, setPending] = useState<ParsedBackup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)
  // Held in component state only -- never persisted, never logged.
  const [backupPassword, setBackupPassword] = useState("")
  const [restorePassword, setRestorePassword] = useState("")
  const [isReadingFile, setIsReadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setPending(null)
    setError(null)
    setBackupError(null)
    setBackupPassword("")
    setRestorePassword("")
  }

  async function handleExport() {
    setBackupError(null)
    try {
      const blob = await exportProducts.mutateAsync(backupPassword)
      // Same name the server's Content-Disposition would have given:
      // produk-cadangan-YYYYMMDD-HHMMSS.json (UTC).
      const stamp = new Date()
        .toISOString()
        .replace(/\.\d+Z$/, "")
        .replace(/[-:]/g, "")
        .replace("T", "-")
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `produk-cadangan-${stamp}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setBackupPassword("")
    } catch (err) {
      setBackupPassword("")
      setBackupError(
        err instanceof ApiError
          ? err.message
          : "Tidak dapat menghubungi server kasir."
      )
    }
  }

  async function handleFileSelected(file: File) {
    setError(null)
    setIsReadingFile(true)
    try {
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
    } finally {
      setIsReadingFile(false)
    }
  }

  async function handleConfirmImport() {
    if (!pending) return
    try {
      const result = await importProducts.mutateAsync({
        fileText: pending.fileText,
        password: restorePassword,
      })
      reset()
      onOpenChange(false)
      toast.add({
        title: "Produk dipulihkan",
        description: `${result.imported} produk (${result.active} aktif, ${result.inactive} nonaktif)`,
      })
    } catch (err) {
      setRestorePassword("")
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
        // Ignore Escape/outside-click while a restore is in flight -- closing
        // mid-request would desync the dialog from a mutation still running.
        if (!next && importProducts.isPending) return
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
          <Input
            type="password"
            autoComplete="off"
            placeholder="Kata sandi cadangan"
            value={backupPassword}
            disabled={exportProducts.isPending}
            onChange={(e) => setBackupPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && backupPassword && !exportProducts.isPending) {
                handleExport()
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={exportProducts.isPending || !backupPassword}
            onClick={handleExport}
          >
            {exportProducts.isPending && <Spinner className="text-current" />}
            Cadangkan produk
          </Button>
          {backupError && <p className="text-sm text-destructive">{backupError}</p>}
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
                disabled={isReadingFile}
                onClick={() => fileInputRef.current?.click()}
              >
                {isReadingFile && <Spinner className="text-current" />}
                {isReadingFile ? "Membaca berkas…" : "Pilih berkas cadangan…"}
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
              <Input
                type="password"
                autoComplete="off"
                className="mt-3"
                placeholder="Kata sandi pemulihan"
                value={restorePassword}
                disabled={importProducts.isPending}
                onChange={(e) => setRestorePassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && restorePassword && !importProducts.isPending) {
                    handleConfirmImport()
                  }
                }}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {pending ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={importProducts.isPending}
                onClick={reset}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={importProducts.isPending || !restorePassword}
                onClick={handleConfirmImport}
              >
                {importProducts.isPending && <Spinner className="text-current" />}
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
