"use client"

import { useState } from "react"

import { OpenSalesStrip } from "@/components/pos/open-sales-strip"
import { ScanInput } from "@/components/pos/scan-input"
import { CartTable } from "@/components/pos/cart-table"
import { CartSummaryPanel } from "@/components/pos/cart-summary-panel"
import { CashPaymentDialog } from "@/components/pos/cash-payment-dialog"
import { useHotkeys } from "@/hooks/use-hotkeys"
import { useSales } from "@/lib/state/sales-provider"
import { saleUnits } from "@/lib/pos-calculations"

export default function CheckoutPage() {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const { activeSale, holdActiveSale, cycleActiveSale, jumpToSale } = useSales()
  const lines = activeSale?.lines ?? []

  useHotkeys({
    disabled: paymentOpen,
    onHold: holdActiveSale,
    onPay: () => {
      if (lines.length > 0) setPaymentOpen(true)
    },
    onNextSale: cycleActiveSale,
    onJumpToSale: jumpToSale,
  })

  return (
    <div className="flex flex-col">
      <OpenSalesStrip />
      <div className="flex gap-px bg-border">
        <div className="flex-1 bg-background px-6 py-5.5">
          <ScanInput />
          <div className="mt-6.5 mb-2.5 flex items-baseline justify-between">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Transaksi ini
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {lines.length} baris · {saleUnits(lines)} unit · ↑↓ pilih baris · ketik untuk ubah jumlah
            </span>
          </div>
          <CartTable />
        </div>
        <CartSummaryPanel onPay={() => lines.length > 0 && setPaymentOpen(true)} />
      </div>
      <CashPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} />
    </div>
  )
}
