"use client"

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { DailyReportDialog } from "@/components/pos/daily-report-dialog"
import { cn } from "@/lib/utils"
import {
  matchTransactionCommandsByAlias,
  matchTransactionCommandsByPrefix,
  type TransactionCommandDefinition,
} from "@/lib/commands"

export type TransactionLookupInputHandle = {
  focus: () => void
}

export const TransactionLookupInput = forwardRef<
  TransactionLookupInputHandle,
  { onLookup: (saleNumber: number) => void }
>(function TransactionLookupInput({ onLookup }, ref) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  const isCommandMode = value.startsWith("/")
  const commandText = value.slice(1)
  const [firstWord] = commandText.split(" ")

  const matches = useMemo<TransactionCommandDefinition[]>(() => {
    if (!isCommandMode) return []
    return matchTransactionCommandsByPrefix(firstWord)
  }, [isCommandMode, firstWord])

  function resetInput() {
    setValue("")
    setHighlightedIndex(0)
    setError(null)
    inputRef.current?.focus()
  }

  function runCommand(command: TransactionCommandDefinition) {
    setError(null)
    switch (command.name) {
      case "laporanHarian":
        setValue("")
        setReportDialogOpen(true)
        return
    }
  }

  function handleCommandSubmit() {
    if (matches.length > 0) {
      const match = matches[Math.min(highlightedIndex, matches.length - 1)]
      runCommand(match)
      return
    }
    const direct = matchTransactionCommandsByAlias(firstWord)
    if (direct) {
      runCommand(direct)
      return
    }
    setError("Tidak ditemukan")
  }

  function handleLookupSubmit() {
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
    <div className="relative">
      <InputGroup
        className={cn(
          "h-16 border-2 border-primary px-4.5 shadow-[0_0_0_4px_rgba(26,92,84,0.1)]",
          error && "border-destructive shadow-none"
        )}
      >
        <InputGroupAddon>
          <BarcodeGlyph dimmed={isCommandMode} />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          autoFocus
          placeholder="Pindai atau ketik nomor transaksi, / untuk perintah"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setHighlightedIndex(0)
            setError(null)
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
              if (isCommandMode) {
                handleCommandSubmit()
              } else {
                handleLookupSubmit()
              }
            } else if (e.key === "Escape" && isCommandMode) {
              e.preventDefault()
              resetInput()
            }
          }}
          className="font-mono text-[19px] md:text-[19px]"
        />
        <InputGroupAddon align="inline-end">
          <span className="text-xs text-muted-foreground">
            {error ??
              (isCommandMode
                ? "/ untuk perintah · ↑↓ pilih · Enter jalankan"
                : "Scan atau ketik nomor transaksi")}
          </span>
        </InputGroupAddon>
      </InputGroup>
      {isCommandMode && matches.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1.5 overflow-hidden rounded-none border border-border bg-card shadow-md">
          {matches.map((match, index) => {
            const isHighlighted = index === highlightedIndex
            return (
              <button
                key={`cmd-${match.name}`}
                type="button"
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => runCommand(match)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-left last:border-b-0",
                  isHighlighted ? "bg-primary/8" : "bg-card"
                )}
              >
                <span className="text-[13.5px] text-foreground">
                  /{match.aliases[0]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {match.description}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <DailyReportDialog
        open={reportDialogOpen}
        onOpenChange={(open) => {
          setReportDialogOpen(open)
          if (!open) inputRef.current?.focus()
        }}
      />
    </div>
  )
})

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
