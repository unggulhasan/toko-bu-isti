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

const COMMAND_ALIAS = "baru"

export function ProductSearchBar({
  query,
  onQueryChange,
  onNewProduct,
  onNavigate,
  onActivate,
}: {
  query: string
  onQueryChange: (value: string) => void
  onNewProduct: () => void
  onNavigate?: (delta: number) => void
  onActivate?: () => void
}) {
  const [commandError, setCommandError] = useState<string | null>(null)

  const isCommandMode = query.startsWith("/")
  const commandMatches = isCommandMode && COMMAND_ALIAS.startsWith(query.slice(1))

  function runNewProductCommand() {
    onQueryChange("")
    setCommandError(null)
    onNewProduct()
  }

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
            }}
            onKeyDown={(e) => {
              if (isCommandMode) {
                if (e.key === "Enter") {
                  e.preventDefault()
                  if (commandMatches) {
                    runNewProductCommand()
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
              }
            }}
            className="text-[19px] md:text-[19px]"
          />
          <InputGroupAddon align="inline-end">
            <span className="text-xs text-muted-foreground">
              {commandError ??
                (isCommandMode ? "/baru produk baru · Enter jalankan" : null)}
            </span>
          </InputGroupAddon>
        </InputGroup>
        {isCommandMode && commandMatches && (
          <div className="absolute top-full right-0 left-0 z-20 mt-1.5 overflow-hidden rounded-none border border-border bg-card shadow-md">
            <button
              type="button"
              onClick={runNewProductCommand}
              className="flex w-full items-center justify-between gap-3 bg-primary/8 px-4 py-2.5 text-left"
            >
              <span className="text-[13.5px] text-foreground">/{COMMAND_ALIAS}</span>
              <span className="text-xs text-muted-foreground">Buat produk baru</span>
            </button>
          </div>
        )}
      </div>
      <Button type="button" onClick={onNewProduct} className="h-16 normal-case">
        + Produk baru
      </Button>
    </div>
  )
}
