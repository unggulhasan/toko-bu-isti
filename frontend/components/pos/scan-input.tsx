"use client"

import { useRef, useState } from "react"

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"
import { useProducts } from "@/lib/state/products-provider"
import { useSales } from "@/lib/state/sales-provider"

export function ScanInput() {
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const { findByBarcode } = useProducts()
  const { scanBarcode, scanError } = useSales()

  function handleAdd() {
    const barcode = value.trim()
    if (!barcode) return
    scanBarcode(barcode, findByBarcode(barcode))
    setValue("")
    inputRef.current?.focus()
  }

  return (
    <InputGroup
      className={cn(
        "h-16 border-2 border-primary px-4.5 shadow-[0_0_0_4px_rgba(26,92,84,0.1)]",
        scanError && "border-destructive shadow-none"
      )}
    >
      <InputGroupAddon>
        <BarcodeGlyph />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        autoFocus
        placeholder="Pindai atau ketik barkode"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            handleAdd()
          }
        }}
        className="font-mono text-[19px]"
      />
      <InputGroupAddon align="inline-end">
        <span className="text-xs text-muted-foreground">
          {scanError ?? "Scan atau ketik barkode · Enter untuk menambah"}
        </span>
      </InputGroupAddon>
    </InputGroup>
  )
}

function BarcodeGlyph() {
  const bars = [2, 4, 2, 1, 5, 2, 3]
  return (
    <div className="flex h-6.5 items-end gap-0.5">
      {bars.map((w, i) => (
        <div key={i} style={{ width: w }} className="h-full bg-foreground" />
      ))}
    </div>
  )
}
