"use client"

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react"

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"
import { useProductsStore } from "@/lib/store/products-store"
import { useSalesStore } from "@/lib/store/sales-store"
import {
  matchCommandsByAlias,
  matchCommandsByPrefix,
  type CommandDefinition,
} from "@/lib/commands"
import type { Product } from "@/lib/types"

type Match =
  | { kind: "command"; command: CommandDefinition }
  | { kind: "product"; product: Product }

export type ScanInputHandle = {
  focus: () => void
}

export const ScanInput = forwardRef<ScanInputHandle, { onPay: () => void }>(
  function ScanInput({ onPay }, ref) {
    const [value, setValue] = useState("")
    const [highlightedIndex, setHighlightedIndex] = useState(0)
    const [commandError, setCommandError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }))

    const { products, findByBarcode } = useProductsStore()
    const {
      scanBarcode,
      scanError,
      selectedLineId,
      setLineQty,
      removeLine,
      holdActiveSale,
      newSale,
      cycleActiveSale,
    } = useSalesStore()

    const isCommandMode = value.startsWith("/")
    const commandText = value.slice(1)
    const [firstWord, ...rest] = commandText.split(" ")
    const argText = rest.join(" ").trim()

    const matches = useMemo<Match[]>(() => {
      if (!isCommandMode) return []
      const commandMatches = matchCommandsByPrefix(firstWord).map<Match>((c) => ({
        kind: "command",
        command: c,
      }))
      // "/cari <text>" or "/find <text>" always search products by name.
      // Otherwise, only fall back to a product-name search when no action
      // command's alias prefix-matches what was typed (e.g. "/mangkuk").
      const isExplicitLookup = firstWord === "cari" || firstWord === "find"
      const productQuery = isExplicitLookup
        ? argText
        : commandMatches.length === 0
          ? firstWord
          : ""
      const productMatches = productQuery
        ? products
            .filter((p) => p.name.toLowerCase().includes(productQuery.toLowerCase()))
            .slice(0, 8)
            .map<Match>((p) => ({ kind: "product", product: p }))
        : []
      return [...commandMatches, ...productMatches]
    }, [isCommandMode, firstWord, argText, products])

    function resetInput() {
      setValue("")
      setHighlightedIndex(0)
      setCommandError(null)
      inputRef.current?.focus()
    }

    function runCommand(command: CommandDefinition, arg: string) {
      setCommandError(null)
      switch (command.name) {
        case "pay":
          onPay()
          break
        case "hold":
          holdActiveSale()
          break
        case "new":
          newSale()
          break
        case "next":
          cycleActiveSale()
          break
        case "void":
          if (!selectedLineId) {
            setCommandError("Pilih baris dulu")
            return
          }
          removeLine(selectedLineId)
          break
        case "qty": {
          if (!selectedLineId) {
            setCommandError("Pilih baris dulu")
            return
          }
          const qty = Number(arg)
          if (!arg || !Number.isFinite(qty) || qty <= 0) {
            setCommandError("Jumlah tidak valid")
            return
          }
          setLineQty(selectedLineId, qty)
          break
        }
      }
      resetInput()
    }

    function handleAdd() {
      if (isCommandMode) {
        if (matches.length > 0) {
          const match = matches[Math.min(highlightedIndex, matches.length - 1)]
          if (match.kind === "command") {
            runCommand(match.command, argText)
          } else {
            scanBarcode(match.product.barcode, match.product)
            resetInput()
          }
          return
        }
        const directCommand = matchCommandsByAlias(firstWord)
        if (directCommand) {
          runCommand(directCommand, argText)
          return
        }
        setCommandError("Tidak ditemukan")
        return
      }

      const barcode = value.trim()
      if (!barcode) return
      scanBarcode(barcode, findByBarcode(barcode))
      setValue("")
      inputRef.current?.focus()
    }

    return (
      <div className="relative">
        <InputGroup
          className={cn(
            "h-16 border-2 border-primary px-4.5 shadow-[0_0_0_4px_rgba(26,92,84,0.1)]",
            (scanError || commandError) && "border-destructive shadow-none"
          )}
        >
          <InputGroupAddon>
            <BarcodeGlyph dimmed={isCommandMode} />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            autoFocus
            placeholder="Pindai barkode atau ketik / untuk perintah"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setHighlightedIndex(0)
              setCommandError(null)
            }}
            onKeyDown={(e) => {
              if (isCommandMode && matches.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setHighlightedIndex((i) => (i + 1) % matches.length)
                  return
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setHighlightedIndex((i) => (i - 1 + matches.length) % matches.length)
                  return
                }
              }
              if (e.key === "Enter") {
                e.preventDefault()
                handleAdd()
              } else if (e.key === "Escape" && isCommandMode) {
                e.preventDefault()
                resetInput()
              }
            }}
            className="font-mono text-[19px]"
          />
          <InputGroupAddon align="inline-end">
            <span className="text-xs text-muted-foreground">
              {commandError ??
                scanError ??
                (isCommandMode
                  ? "/ untuk perintah · ↑↓ pilih · Enter jalankan"
                  : "Scan atau ketik barkode · Enter untuk menambah")}
            </span>
          </InputGroupAddon>
        </InputGroup>
        {isCommandMode && matches.length > 0 && (
          <div className="absolute top-full right-0 left-0 z-10 mt-1.5 overflow-hidden rounded-none border border-border bg-card shadow-md">
            {matches.map((match, index) => {
              const isHighlighted = index === highlightedIndex
              const key =
                match.kind === "command" ? `cmd-${match.command.name}` : `prod-${match.product.id}`
              return (
                <button
                  key={key}
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => {
                    if (match.kind === "command") {
                      runCommand(match.command, argText)
                    } else {
                      scanBarcode(match.product.barcode, match.product)
                      resetInput()
                    }
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-left last:border-b-0",
                    isHighlighted ? "bg-primary/8" : "bg-card"
                  )}
                >
                  {match.kind === "command" ? (
                    <>
                      <span className="text-[13.5px] text-foreground">/{match.command.aliases[0]}</span>
                      <span className="text-xs text-muted-foreground">{match.command.description}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[13.5px] text-foreground">{match.product.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {match.product.barcode}
                      </span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }
)

function BarcodeGlyph({ dimmed }: { dimmed?: boolean }) {
  const bars = [2, 4, 2, 1, 5, 2, 3]
  return (
    <div className={cn("flex h-6.5 items-end gap-0.5", dimmed && "opacity-30")}>
      {bars.map((w, i) => (
        <div key={i} style={{ width: w }} className="h-full bg-foreground" />
      ))}
    </div>
  )
}
