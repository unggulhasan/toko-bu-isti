"use client"

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react"

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
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
import { ProductSearchDialog } from "@/components/pos/product-search-dialog"
import { cn } from "@/lib/utils"
import { useProductsStore } from "@/lib/store/products-store"
import { useSalesStore } from "@/lib/store/sales-store"
import {
  matchCommandsByAlias,
  matchCommandsByPrefix,
  type CommandDefinition,
} from "@/lib/commands"

type Match = { kind: "command"; command: CommandDefinition }

export type ScanInputHandle = {
  focus: () => void
}

export const ScanInput = forwardRef<
  ScanInputHandle,
  { onPay: () => void; onFocusQty?: (lineId: string) => void }
>(function ScanInput({ onPay, onFocusQty }, ref) {
    const [value, setValue] = useState("")
    const [highlightedIndex, setHighlightedIndex] = useState(0)
    const [commandError, setCommandError] = useState<string | null>(null)
    const [confirmDeleteSale, setConfirmDeleteSale] = useState(false)
    const [productSearchOpen, setProductSearchOpen] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }))

    const { findByBarcode } = useProductsStore()
    const {
      sales,
      activeSaleId,
      scanBarcode,
      scanError,
      selectedLineId,
      newSale,
      cycleActiveSale,
      moveSelection,
      removeActiveSale,
      activeSale: getActiveSale,
    } = useSalesStore()
    const activeSale = getActiveSale()
    const activeSaleNumber = sales.findIndex((s) => s.id === activeSaleId) + 1

    const isCommandMode = value.startsWith("/")
    const commandText = value.slice(1)
    const [firstWord] = commandText.split(" ")

    const matches = useMemo<Match[]>(() => {
      if (!isCommandMode) return []
      return matchCommandsByPrefix(firstWord).map<Match>((c) => ({
        kind: "command",
        command: c,
      }))
    }, [isCommandMode, firstWord])

    function resetInput() {
      setValue("")
      setHighlightedIndex(0)
      setCommandError(null)
      inputRef.current?.focus()
    }

    function runCommand(command: CommandDefinition) {
      setCommandError(null)
      switch (command.name) {
        case "pay":
          onPay()
          break
        case "new":
          newSale()
          break
        case "deleteSale":
          setValue("")
          setConfirmDeleteSale(true)
          return
        case "cari":
          setValue("")
          setProductSearchOpen(true)
          return
      }
      resetInput()
    }

    function handleAdd() {
      if (isCommandMode) {
        if (matches.length > 0) {
          const match = matches[Math.min(highlightedIndex, matches.length - 1)]
          runCommand(match.command)
          return
        }
        const directCommand = matchCommandsByAlias(firstWord)
        if (directCommand) {
          runCommand(directCommand)
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
              if (!isCommandMode && !value) {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  moveSelection(1)
                  return
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  moveSelection(-1)
                  return
                }
                if (e.key === "Enter" && selectedLineId) {
                  e.preventDefault()
                  onFocusQty?.(selectedLineId)
                  return
                }
                if (e.key === ".") {
                  e.preventDefault()
                  cycleActiveSale(1)
                  return
                }
                if (e.key === ",") {
                  e.preventDefault()
                  cycleActiveSale(-1)
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
            className="font-mono text-[19px] md:text-[19px]"
          />
          <InputGroupAddon align="inline-end">
            <span className="text-xs text-muted-foreground">
              {commandError ??
                scanError ??
                (isCommandMode
                  ? "/ untuk perintah · ↑↓ pilih · Enter jalankan"
                  : "Scan atau ketik barkode")}
            </span>
          </InputGroupAddon>
        </InputGroup>
        {isCommandMode && matches.length > 0 && (
          <div className="absolute top-full right-0 left-0 z-20 mt-1.5 overflow-hidden rounded-none border border-border bg-card shadow-md">
            {matches.map((match, index) => {
              const isHighlighted = index === highlightedIndex
              return (
                <button
                  key={`cmd-${match.command.name}`}
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => runCommand(match.command)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-left last:border-b-0",
                    isHighlighted ? "bg-primary/8" : "bg-card"
                  )}
                >
                  <span className="text-[13.5px] text-foreground">/{match.command.aliases[0]}</span>
                  <span className="text-xs text-muted-foreground">{match.command.description}</span>
                </button>
              )
            })}
          </div>
        )}
        <AlertDialog
          open={confirmDeleteSale}
          onOpenChange={(open) => {
            setConfirmDeleteSale(open)
            if (!open) inputRef.current?.focus()
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus transaksi</AlertDialogTitle>
              <AlertDialogDescription>
                Transaksi #{activeSaleNumber} akan dihapus beserta semua barisnya. Tindakan ini
                tidak dapat dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  removeActiveSale()
                  setConfirmDeleteSale(false)
                }}
              >
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <ProductSearchDialog
          open={productSearchOpen}
          onOpenChange={(open) => {
            setProductSearchOpen(open)
            if (!open) inputRef.current?.focus()
          }}
        />
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
