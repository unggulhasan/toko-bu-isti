"use client"

import { useState } from "react"
import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

type Command = {
  alias: string
  label: string
  run: () => void
}

export function ProductSearchBar({
  query,
  onQueryChange,
  onNewProduct,
  onOpenBackup,
  onNavigate,
  onActivate,
  onPageChange,
}: {
  query: string
  onQueryChange: (value: string) => void
  onNewProduct: () => void
  onOpenBackup: () => void
  onNavigate?: (delta: number) => void
  onActivate?: () => void
  onPageChange?: (delta: number) => void
}) {
  const [commandError, setCommandError] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState(0)

  function runCommand(run: () => void) {
    onQueryChange("")
    setCommandError(null)
    run()
  }

  const commands: Command[] = [
    { alias: "baru", label: "Buat produk baru", run: () => runCommand(onNewProduct) },
    { alias: "cadangan", label: "Cadangkan / pulihkan produk", run: () => runCommand(onOpenBackup) },
  ]

  const isCommandMode = query.startsWith("/")
  const needle = query.slice(1).toLowerCase()
  const commandMatches = isCommandMode
    ? commands.filter((c) => c.alias.startsWith(needle))
    : []
  const activeIndex = Math.min(highlighted, Math.max(commandMatches.length - 1, 0))

  return (
    <div className="flex w-full gap-2.5">
      <div className="relative flex-1">
        <InputGroup
          className={cn(
            "h-16 border-2 border-primary px-4.5 shadow-[0_0_0_4px_rgba(26,92,84,0.1)]",
            commandError && "border-destructive shadow-none"
          )}
        >
          <InputGroupAddon>
            <SearchIcon className="size-4.5 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            placeholder="Cari nama atau barkode, atau ketik /baru"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value)
              setCommandError(null)
              setHighlighted(0)
            }}
            onKeyDown={(e) => {
              if (isCommandMode) {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  if (commandMatches.length > 0) {
                    setHighlighted((i) => (i + 1) % commandMatches.length)
                  }
                  return
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  if (commandMatches.length > 0) {
                    setHighlighted(
                      (i) => (i - 1 + commandMatches.length) % commandMatches.length
                    )
                  }
                  return
                }
                if (e.key === "Enter") {
                  e.preventDefault()
                  if (commandMatches.length > 0) {
                    commandMatches[activeIndex].run()
                  } else {
                    setCommandError("Tidak ditemukan")
                  }
                  return
                }
                if (e.key === "Escape") {
                  e.preventDefault()
                  onQueryChange("")
                  setCommandError(null)
                  return
                }
                return
              }
              if (e.key === "ArrowDown") {
                e.preventDefault()
                onNavigate?.(1)
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                onNavigate?.(-1)
              } else if (e.key === "Enter") {
                e.preventDefault()
                onActivate?.()
              } else if (e.key === "." && !isCommandMode) {
                e.preventDefault()
                onPageChange?.(1)
              } else if (e.key === "," && !isCommandMode) {
                e.preventDefault()
                onPageChange?.(-1)
              }
            }}
            className="text-[19px] md:text-[19px]"
          />
          <InputGroupAddon align="inline-end">
            <span className="text-xs text-muted-foreground">
              {commandError ??
                (isCommandMode
                  ? "↑↓ pilih · Enter jalankan"
                  : "/ untuk perintah · ↑↓ pilih · Enter jalankan · ,. halaman")}
            </span>
          </InputGroupAddon>
        </InputGroup>
        {isCommandMode && commandMatches.length > 0 && (
          <div className="absolute top-full right-0 left-0 z-20 mt-1.5 overflow-hidden rounded-none border border-border bg-card shadow-md">
            {commandMatches.map((c, i) => (
              <button
                key={c.alias}
                type="button"
                onClick={c.run}
                onMouseEnter={() => setHighlighted(i)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left",
                  i === activeIndex ? "bg-primary/8" : "bg-card"
                )}
              >
                <span className="text-[13.5px] text-foreground">/{c.alias}</span>
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Button type="button" onClick={onNewProduct} className="h-16 normal-case">
        + Produk baru
      </Button>
    </div>
  )
}
