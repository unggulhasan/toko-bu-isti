"use client"

import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { formatRupiah } from "@/lib/format"
import { saleTotal, saleUnits } from "@/lib/pos-calculations"
import { useSalesStore } from "@/lib/store/sales-store"

export function CartSummaryPanel({ onPay }: { onPay: () => void }) {
  const activeSale = useSalesStore((s) => s.activeSale())
  const lines = activeSale?.lines ?? []
  const units = saleUnits(lines)
  const total = saleTotal(lines)

  return (
    <div className="flex w-88 flex-none flex-col bg-card p-6">
      <div className="flex justify-between py-1.75 text-[13.5px] text-muted-foreground">
        <span>Jenis Barang</span>
        <span className="font-mono text-foreground">{lines.length}</span>
      </div>
      <div className="flex justify-between border-b border-border py-1.75 text-[13.5px] text-muted-foreground">
        <span>Jumlah Barang</span>
        <span className="font-mono text-foreground">{units}</span>
      </div>
      <div className="flex flex-col pt-4.5 pb-1.5">
        <span className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
          Total bayar
        </span>
        <span className="font-mono text-[38px] font-bold tracking-tight text-foreground">
          {formatRupiah(total)}
        </span>
      </div>
      <Button
        type="button"
        onClick={onPay}
        disabled={lines.length === 0}
        className="mt-auto h-auto py-4.75 text-lg normal-case"
      >
        Bayar · F9
      </Button>
      <div className="mt-3.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
        <KbdGroup>
          <Kbd>F3</Kbd>
          <span>/</span>
          <Kbd>.</Kbd>
        </KbdGroup>
        : transaksi berikutnya <br />
        <KbdGroup>
          <Kbd>,</Kbd>
        </KbdGroup>
        : transaksi sebelumnya
      </div>
    </div>
  )
}
