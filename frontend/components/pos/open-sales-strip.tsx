"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatRupiah, formatClock, formatDateID } from "@/lib/format"
import { saleTotal, saleUnits } from "@/lib/pos-calculations"
import { useSalesStore } from "@/lib/store/sales-store"

export function OpenSalesStrip() {
  const { sales, activeSaleId, setActiveSaleId, newSale } = useSalesStore()
  const now = new Date()

  return (
    <div className="flex shrink-0 items-center gap-3.5 border-b border-border bg-muted px-6 py-2.75">
      <span className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
        Transaksi terbuka · {sales.length}
      </span>
      <div className="flex items-center gap-2">
        {sales.map((sale) => {
          const isActive = sale.id === activeSaleId
          return (
            <button
              key={sale.id}
              type="button"
              onClick={() => setActiveSaleId(sale.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-none border px-3.25 py-1.75 font-mono text-xs",
                isActive
                  ? "border-transparent bg-shell text-shell-foreground"
                  : "border-border bg-card text-foreground"
              )}
            >
              <span className="text-[12.5px] font-bold">#{sale.number}</span>
              <span
                className={cn(
                  "text-[11px]",
                  isActive ? "text-shell-foreground/60" : "text-muted-foreground"
                )}
              >
                {saleUnits(sale.lines)} barang
              </span>
              <span className="text-[12px]">{formatRupiah(saleTotal(sale.lines))}</span>
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
          className="border-dashed text-[12.5px] normal-case"
          onClick={() => newSale()}
        >
          + Transaksi baru
        </Button>
      </div>
      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
        {formatDateID(now)} · {formatClock(now)}
      </span>
    </div>
  )
}
