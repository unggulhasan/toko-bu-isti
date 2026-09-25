"use client"

import { useRef, useState } from "react"

import { OpenSalesStrip } from "@/components/pos/open-sales-strip"
import { ScanInput, type ScanInputHandle } from "@/components/pos/scan-input"
import { CartTable } from "@/components/pos/cart-table"
import { CartSummaryPanel } from "@/components/pos/cart-summary-panel"
import { CashPaymentDialog } from "@/components/pos/cash-payment-dialog"
import { useHotkeys } from "@/hooks/use-hotkeys"
import { useSalesStore } from "@/lib/store/sales-store"
import { saleUnits } from "@/lib/pos-calculations"

export default function CheckoutPage() {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const scanInputRef = useRef<ScanInputHandle>(null)
  const activeSale = useSalesStore((s) => s.activeSale())
  const cycleActiveSale = useSalesStore((s) => s.cycleActiveSale)
  const jumpToSale = useSalesStore((s) => s.jumpToSale)
  const lines = activeSale?.lines ?? []

  function openPayment() {
    if (lines.length > 0) setPaymentOpen(true)
  }

  useHotkeys({
    disabled: paymentOpen,
    onPay: openPayment,
    onNextSale: cycleActiveSale,
    onJumpToSale: jumpToSale,
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OpenSalesStrip />
      <div className="flex min-h-0 flex-1 gap-px bg-border">
        <div className="flex min-h-0 flex-1 flex-col bg-background px-6 py-5.5">
          <div className="shrink-0">
            <ScanInput ref={scanInputRef} onPay={openPayment} />
          </div>
          <div className="mt-6.5 mb-2.5 flex shrink-0 items-baseline justify-between">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Transaksi ini
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {lines.length} baris · {saleUnits(lines)} unit · ↑↓ pilih baris · ketik untuk ubah jumlah
            </span>
          </div>
          <CartTable />
        </div>
        <CartSummaryPanel onPay={openPayment} />
      </div>
      <CashPaymentDialog
        open={paymentOpen}
        onOpenChange={(open) => {
          setPaymentOpen(open)
          if (!open) scanInputRef.current?.focus()
        }}
      />
    </div>
  )
}
