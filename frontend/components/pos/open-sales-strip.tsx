"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatRupiah, formatClock, formatDateID } from "@/lib/format"
import {
  useOpenSalesQuery,
  useCreateOpenSale,
} from "@/lib/hooks/use-open-sales"
import { usePosUiStore } from "@/lib/store/pos-ui-store"

export function OpenSalesStrip() {
  const { data: sales = [] } = useOpenSalesQuery()
  const activeSaleId = usePosUiStore((s) => s.activeSaleId)
  const setActiveSaleId = usePosUiStore((s) => s.setActiveSaleId)
  const createOpenSale = useCreateOpenSale()
  const now = new Date()
  const activeTabRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    })
  }, [activeSaleId])

  return (
    <div className="flex shrink-0 items-center gap-3.5 border-b border-border bg-muted px-6 py-2.75">
      <span className="shrink-0 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
        Transaksi terbuka · {sales.length}
      </span>
      <div className="flex items-center gap-2 overflow-x-auto">
        {sales.map((sale, index) => {
          const isActive = sale.id === activeSaleId
          return (
            <button
              key={sale.id}
              ref={isActive ? activeTabRef : undefined}
              type="button"
              onClick={() => setActiveSaleId(sale.id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-none border px-3.25 py-1.75 font-mono text-xs",
                isActive
                  ? "border-transparent bg-shell text-shell-foreground"
                  : "border-border bg-card text-foreground"
              )}
            >
              {/*
                Deliberately the 1-based array index, NOT sale.position + 1.
                position is a monotonically increasing append counter that
                never renumbers on delete (so it can show gaps like 0,2 after
                a middle cart is removed) -- it's the API's sort key, not a
                cashier-facing label. Keeping index+1 matches the ,/./F3
                cycling order and stays gap-free.
              */}
              <span className="text-[12.5px] font-bold">#{index + 1}</span>
              <span
                className={cn(
                  "text-[11px]",
                  isActive
                    ? "text-shell-foreground/60"
                    : "text-muted-foreground"
                )}
              >
                {sale.units} barang
              </span>
              <span className="text-[12px]">{formatRupiah(sale.total)}</span>
              {!isActive && (
                <Badge className="bg-waiting-bg px-1.5 py-0.5 text-[10.5px] text-waiting-foreground">
                  menunggu
                </Badge>
              )}
            </button>
          )
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={createOpenSale.isPending}
          className="shrink-0 border-dashed text-[12.5px] normal-case"
          onClick={() => createOpenSale.mutate()}
        >
          + Transaksi baru
        </Button>
      </div>
      <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
        {formatDateID(now)} · {formatClock(now)}
      </span>
    </div>
  )
}
