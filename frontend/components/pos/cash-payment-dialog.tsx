"use client"

import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { formatNumber, formatRupiah, parseRupiahInput } from "@/lib/format"
import { saleTotal, saleUnits } from "@/lib/pos-calculations"
import { useSalesStore } from "@/lib/store/sales-store"
import { useTransactionsStore } from "@/lib/store/transactions-store"
import { useSessionStore } from "@/lib/store/session-store"
import { toast } from "@/components/ui/toast"

export function CashPaymentDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const activeSale = useSalesStore((s) => s.activeSale())
  const activeSaleNumber = useSalesStore(
    (s) => s.sales.findIndex((sale) => sale.id === s.activeSaleId) + 1
  )
  const clearActiveSaleAfterPayment = useSalesStore(
    (s) => s.clearActiveSaleAfterPayment
  )
  const commitSale = useTransactionsStore((s) => s.commitSale)
  const { cashierName } = useSessionStore()
  const [tenderedRaw, setTenderedRaw] = useState("")

  const lines = activeSale?.lines ?? []
  const total = saleTotal(lines)
  const units = saleUnits(lines)
  const tendered = parseRupiahInput(tenderedRaw)
  const change = tendered - total
  const canConfirm = activeSale != null && lines.length > 0 && tendered >= total

  function handleConfirm() {
    if (!canConfirm || !activeSale) return
    commitSale(activeSale, total, tendered, cashierName)
    clearActiveSaleAfterPayment()
    setTenderedRaw("")
    onOpenChange(false)
    toast.add({ title: "Struk dicetak", description: `Transaksi #${activeSaleNumber} selesai.` })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setTenderedRaw("")
      }}
    >
      <DialogContent
        finalFocus={false}
        className="max-w-[calc(100%-2rem)] gap-0 p-0 sm:max-w-3xl"
      >
        <DialogHeader className="flex-row items-baseline justify-between border-b border-border p-6.5">
          <div>
            <DialogTitle className="font-sans text-2xl font-semibold tracking-normal normal-case">
              Pembayaran tunai
            </DialogTitle>
            <div className="mt-1 font-mono text-[14px] text-muted-foreground">
              Transaksi #{activeSaleNumber} · {lines.length} baris · {units} unit
            </div>
          </div>
        </DialogHeader>
        <div className="flex flex-col gap-px bg-border sm:flex-row">
          <div className="flex-1 bg-card p-6.5">
            <div className="flex justify-between py-1.5 text-base text-muted-foreground">
              <span>Total bayar</span>
              <span className="font-mono text-xl font-semibold text-foreground">
                {formatRupiah(total)}
              </span>
            </div>
            <div className="mt-5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Uang diterima
            </div>
            <InputGroup className="mt-2.5 h-auto border-2 border-primary px-4.5 py-3.5 shadow-[0_0_0_4px_rgba(26,92,84,0.1)]">
              <InputGroupAddon>
                <span className="font-mono text-3xl text-muted-foreground/60">Rp</span>
              </InputGroupAddon>
              <InputGroupInput
                autoFocus
                inputMode="numeric"
                value={tendered > 0 ? formatNumber(tendered) : ""}
                onChange={(e) => setTenderedRaw(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleConfirm()
                  }
                }}
                className="font-mono text-[38px] font-semibold md:text-[38px]"
                placeholder="0"
              />
            </InputGroup>
            <div className="mt-6 font-mono text-sm leading-relaxed text-muted-foreground">
              Enter untuk konfirmasi · Esc untuk batal
              <br />
              Laci kas terbuka setelah konfirmasi
            </div>
          </div>
          <div className="flex w-full flex-none flex-col justify-between bg-primary p-6.5 text-primary-foreground sm:w-85">
            <div>
              <div className="text-sm font-semibold tracking-widest text-primary-foreground/65 uppercase">
                Kembalian
              </div>
              <div className="mt-2.5 font-mono text-4xl font-bold tracking-tight whitespace-nowrap">
                {formatRupiah(Math.max(0, change))}
              </div>
              {tendered > 0 && tendered < total && (
                <div className="mt-2 text-base text-primary-foreground/80">
                  Kurang {formatRupiah(total - tendered)}
                </div>
              )}
            </div>
            <Button
              type="button"
              disabled={!canConfirm}
              onClick={handleConfirm}
              className="mt-6 h-auto w-full bg-card py-4.5 text-base text-primary normal-case hover:bg-card/90"
            >
              Konfirmasi &amp; cetak struk
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
