"use client"

import { forwardRef, useImperativeHandle, useRef, useState } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

export type TransactionLookupInputHandle = {
  focus: () => void
}

export const TransactionLookupInput = forwardRef<
  TransactionLookupInputHandle,
  { onLookup: (saleNumber: number) => void }
>(function TransactionLookupInput({ onLookup }, ref) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  function handleSubmit() {
    const trimmed = value.trim()
    const n = Number(trimmed)
    if (!trimmed || !Number.isInteger(n) || n <= 0) {
      setError("Nomor transaksi tidak valid")
      return
    }
    setError(null)
    onLookup(n)
    setValue("")
    inputRef.current?.focus()
  }

  return (
    <InputGroup
      className={cn(
        "h-16 border-2 border-primary px-4.5 shadow-[0_0_0_4px_rgba(26,92,84,0.1)]",
        error && "border-destructive shadow-none"
      )}
    >
      <InputGroupAddon>
        <BarcodeGlyph />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        autoFocus
        placeholder="Pindai atau ketik nomor transaksi"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            handleSubmit()
          }
        }}
        className="font-mono text-[19px] md:text-[19px]"
      />
      <InputGroupAddon align="inline-end">
        <span className="text-xs text-muted-foreground">
          {error ?? "Scan atau ketik nomor transaksi"}
        </span>
      </InputGroupAddon>
    </InputGroup>
  )
})

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
