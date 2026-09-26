"use client"

import { useEffect, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { formatDateID, parseRupiahInput } from "@/lib/format"
import { ApiError } from "@/lib/api/client"
import {
  useCreateProduct,
  useDeleteProduct,
  useUpdateProduct,
} from "@/lib/hooks/use-products"
import type { Product } from "@/lib/types"

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
}) {
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const deleteProduct = useDeleteProduct()
  const [barcode, setBarcode] = useState("")
  const [name, setName] = useState("")
  const [priceRaw, setPriceRaw] = useState("")
  const [barcodeError, setBarcodeError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setBarcode(product?.barcode ?? "")
      setName(product?.name ?? "")
      setPriceRaw(product ? String(product.price) : "")
      setBarcodeError(null)
    }
  }, [open, product])

  const isEditing = product != null
  const isSaving = createProduct.isPending || updateProduct.isPending

  async function handleSave() {
    const price = parseRupiahInput(priceRaw)
    if (!barcode.trim() || !name.trim() || price <= 0) return
    setBarcodeError(null)
    try {
      if (isEditing) {
        await updateProduct.mutateAsync({
          id: product.id,
          input: { barcode: barcode.trim(), name: name.trim(), price },
        })
      } else {
        await createProduct.mutateAsync({
          barcode: barcode.trim(),
          name: name.trim(),
          price,
        })
      }
      onOpenChange(false)
    } catch (err) {
      // BARCODE_TAKEN's message is already Indonesian ("Barkode ... sudah
      // dipakai produk lain") -- render it next to the field it's about,
      // rather than in a toast.
      setBarcodeError(
        err instanceof ApiError
          ? err.message
          : "Tidak dapat menghubungi server kasir."
      )
    }
  }

  async function handleDelete() {
    if (!isEditing) return
    await deleteProduct.mutateAsync(product.id)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="flex-row items-baseline justify-between border-b border-border p-6">
          <div>
            <DialogTitle className="font-sans text-[19px] font-semibold tracking-normal normal-case">
              {isEditing ? "Ubah produk" : "Produk baru"}
            </DialogTitle>
            {isEditing && (
              <div className="mt-1 font-mono text-[11.5px] text-muted-foreground">
                Diperbarui {formatDateID(new Date(product.updatedAt))} oleh{" "}
                {product.updatedBy}
              </div>
            )}
          </div>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-5.5 p-7">
          <div className="col-span-2">
            <Label htmlFor="barcode" className="mb-2">
              Barkode
            </Label>
            <Input
              id="barcode"
              value={barcode}
              onChange={(e) => {
                setBarcode(e.target.value)
                setBarcodeError(null)
              }}
              className="border-b-2 font-mono text-[15px]"
              placeholder="Pindai atau ketik barkode"
            />
            {barcodeError && (
              <p className="mt-1.5 text-sm text-destructive">{barcodeError}</p>
            )}
          </div>
          <div className="col-span-2">
            <Label htmlFor="name" className="mb-2">
              Nama produk
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-[15px] normal-case"
            />
          </div>
          <div>
            <Label htmlFor="price" className="mb-2">
              Harga
            </Label>
            <InputGroup>
              <InputGroupAddon>
                <span className="font-mono text-sm text-muted-foreground/60">
                  Rp
                </span>
              </InputGroupAddon>
              <InputGroupInput
                id="price"
                inputMode="numeric"
                value={priceRaw}
                onChange={(e) => setPriceRaw(e.target.value.replace(/\D/g, ""))}
                className="font-mono text-[15px] md:text-[15px]"
              />
            </InputGroup>
          </div>
          <div className="col-span-2 font-mono text-[11px] text-muted-foreground">
            Tab antar kolom · Enter untuk simpan · Esc untuk batal
          </div>
        </div>
        <DialogFooter className="flex-row items-center justify-between border-t border-border bg-muted p-4.5 sm:justify-between">
          {isEditing ? (
            <Button
              type="button"
              variant="destructive"
              disabled={deleteProduct.isPending}
              onClick={handleDelete}
              className="normal-case"
            >
              Hapus produk
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2.5">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
              className="normal-case"
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="normal-case"
            >
              {isSaving ? "Menyimpan…" : "Simpan produk"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
