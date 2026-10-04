"use client"

import { useRef, useState, type ReactNode } from "react"

import { OpenSalesStrip } from "@/components/pos/open-sales-strip"
import { ScanInput, type ScanInputHandle } from "@/components/pos/scan-input"
import { CartTable, type CartTableHandle } from "@/components/pos/cart-table"
import { CartSummaryPanel } from "@/components/pos/cart-summary-panel"
import { CashPaymentDialog } from "@/components/pos/cash-payment-dialog"
import { Spinner } from "@/components/ui/spinner"
import { useHotkeys } from "@/hooks/use-hotkeys"
import { ApiError } from "@/lib/api/client"
import { useActiveSale, useCycleActiveSale } from "@/lib/hooks/use-active-sale"
import { useOpenSales } from "@/lib/hooks/use-open-sales"

export default function CheckoutPage() {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const scanInputRef = useRef<ScanInputHandle>(null)
  const cartTableRef = useRef<CartTableHandle>(null)

  // This page owns the open-sales bootstrap (POSTs a cart when the list
  // comes back empty) -- mount useOpenSales() nowhere else, or the guard
  // that prevents duplicate carts stops working.
  const openSales = useOpenSales()
  const { sale: activeSale } = useActiveSale()
  const cycleActiveSale = useCycleActiveSale()
  const lines = activeSale?.lines ?? []

  function openPayment() {
    if (lines.length > 0) setPaymentOpen(true)
  }

  useHotkeys({
    disabled: paymentOpen,
    onPay: openPayment,
    onNextSale: () => cycleActiveSale(1),
  })

  let body: ReactNode
  if (openSales.isError) {
    const message =
      openSales.error instanceof ApiError && openSales.error.kind === "network"
        ? openSales.error.message
        : "Tidak dapat memuat transaksi. Muat ulang halaman."
    body = (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background">
        <p className="text-sm text-destructive">{message}</p>
      </div>
    )
  } else if (openSales.isLoading || !activeSale) {
    body = (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  } else {
    body = (
      <>
        <OpenSalesStrip />
        <div className="flex min-h-0 flex-1 gap-px bg-border">
          <div className="flex min-h-0 flex-1 flex-col bg-background px-6 py-5.5">
            <div className="shrink-0">
              <ScanInput
                ref={scanInputRef}
                autoFocus={!paymentOpen}
                onPay={openPayment}
                onFocusQty={(lineId) => cartTableRef.current?.focusQty(lineId)}
              />
            </div>
            <div className="mt-6.5 mb-2.5 flex shrink-0 items-baseline justify-between">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Transaksi ini
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {activeSale.lineCount} baris · {activeSale.units} unit · ↑↓
                pilih baris · ketik untuk ubah jumlah
              </span>
            </div>
            <CartTable
              ref={cartTableRef}
              onQtyEnter={() => scanInputRef.current?.focus()}
            />
          </div>
          <CartSummaryPanel onPay={openPayment} />
        </div>
      </>
    )
  }

  // The dialog is rendered outside the loading/error branches on purpose:
  // checkout consumes the open sale, so activeSale is briefly undefined while
  // the replacement cart is bootstrapped, and unmounting here would drop the
  // dialog's post-payment (reprint) state.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {body}
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
