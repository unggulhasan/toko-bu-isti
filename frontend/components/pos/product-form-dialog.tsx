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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { formatDateID, parseRupiahInput } from "@/lib/format"
import { useProductsStore } from "@/lib/store/products-store"
import { useSessionStore } from "@/lib/store/session-store"
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
  const { addProduct, updateProduct, deleteProduct } = useProductsStore()
  const cashierName = useSessionStore((s) => s.cashierName)
  const [barcode, setBarcode] = useState("")
  const [name, setName] = useState("")
  const [priceRaw, setPriceRaw] = useState("")

  useEffect(() => {
    if (open) {
      setBarcode(product?.barcode ?? "")
      setName(product?.name ?? "")
      setPriceRaw(product ? String(product.price) : "")
    }
  }, [open, product])

  const isEditing = product != null

  function handleSave() {
    const price = parseRupiahInput(priceRaw)
    if (!barcode.trim() || !name.trim() || price <= 0) return
    if (isEditing) {
      updateProduct(product.id, { barcode: barcode.trim(), name: name.trim(), price }, cashierName)
    } else {
      addProduct({ barcode: barcode.trim(), name: name.trim(), price }, cashierName)
    }
    onOpenChange(false)
  }

  function handleDelete() {
    if (isEditing) {
      deleteProduct(product.id)
      onOpenChange(false)
    }
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
                Diperbarui {formatDateID(new Date(product.updatedAt))} oleh {product.updatedBy}
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
              onChange={(e) => setBarcode(e.target.value)}
              className="border-b-2 font-mono text-[15px]"
              placeholder="Pindai atau ketik barkode"
            />
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
                <span className="font-mono text-sm text-muted-foreground/60">Rp</span>
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
              onClick={() => onOpenChange(false)}
              className="normal-case"
            >
              Batal
            </Button>
            <Button type="button" onClick={handleSave} className="normal-case">
              Simpan produk
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
