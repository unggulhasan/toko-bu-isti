"use client"

import { useEffect, useRef, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { formatNumber, formatRupiah, parseRupiahInput } from "@/lib/format"
import { ApiError } from "@/lib/api/client"
import { useActiveSale } from "@/lib/hooks/use-active-sale"
import { usePrintTransaction, useCheckout } from "@/lib/hooks/use-transactions"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

// Pulsing amber halo for the dialog's buttons when focused (see globals.css).
const FOCUS_PULSE =
  "focus:animate-focus-pulse focus:[--focus-pulse-color:var(--color-amber-300)] motion-reduce:focus:animate-none motion-reduce:focus:[box-shadow:0_0_0_5px_var(--color-amber-300)]"

// What the dialog keeps showing after checkout: the open sale is consumed by
// the server, so the live active sale is already a different (empty) cart.
type PaidReceipt = {
  txnId: string
  saleNumber: number
  cartPosition: number
  lineCount: number
  units: number
  total: number
}

export function CashPaymentDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { sale: activeSale, activeIndex } = useActiveSale()
  const checkout = useCheckout()
  const printTransaction = usePrintTransaction()
  const [tenderedRaw, setTenderedRaw] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [paid, setPaid] = useState<PaidReceipt | null>(null)
  const reprintRef = useRef<HTMLButtonElement>(null)

  // The tender input is disabled in the same render that mounts the buttons,
  // and the dialog's focus manager can pull focus elsewhere when the focused
  // input goes away -- so move it explicitly rather than relying on autoFocus.
  useEffect(() => {
    if (paid) reprintRef.current?.focus()
  }, [paid])

  const lines = activeSale?.lines ?? []
  const lineCount = paid?.lineCount ?? lines.length
  const total = paid?.total ?? activeSale?.total ?? 0
  const units = paid?.units ?? activeSale?.units ?? 0
  const cartPosition = paid?.cartPosition ?? activeIndex + 1
  const tendered = parseRupiahInput(tenderedRaw)
  const change = tendered - total
  const canConfirm =
    paid == null &&
    activeSale != null &&
    lines.length > 0 &&
    tendered >= total &&
    !checkout.isPending

  // The sale is already committed when this runs -- a print failure must not
  // undo or block the checkout, so it only swaps which toast is shown.
  function printReceipt(txnId: string, saleNumber: number) {
    printTransaction.mutate(txnId, {
      onSuccess: () => {
        toast.add({
          title: "Struk dicetak",
          description: `Transaksi #${saleNumber} selesai.`,
        })
      },
      onError: (err) => {
        toast.add({
          title: "Struk gagal dicetak",
          description:
            err instanceof ApiError
              ? err.message
              : `Transaksi #${saleNumber} -- coba cetak ulang.`,
        })
      },
    })
  }

  function handleReprint() {
    if (!paid || printTransaction.isPending) return
    printReceipt(paid.txnId, paid.saleNumber)
  }

  function handleClose() {
    onOpenChange(false)
    setTenderedRaw("")
    setErrorMessage(null)
    setPaid(null)
  }

  async function handleConfirm() {
    if (!canConfirm || !activeSale) return
    setErrorMessage(null)
    try {
      const txn = await checkout.mutateAsync({
        openSaleId: activeSale.id,
        tendered,
      })
      // The server deletes the open sale and invalidation drops it from the
      // strip / moves the active cart on -- no client-side cart surgery here.
      // The dialog stays open so the cashier can reprint; the snapshot keeps
      // showing the sale that was just paid.
      setPaid({
        txnId: txn.id,
        saleNumber: txn.saleNumber,
        cartPosition,
        lineCount: lines.length,
        units,
        total,
      })
      printReceipt(txn.id, txn.saleNumber)
    } catch (err) {
      // Deliberately do NOT close the dialog or clear the cart on failure --
      // the old code cleared the cart unconditionally, which would have
      // silently lost a sale on a failed commit.
      if (err instanceof ApiError) {
        if (err.code === "INSUFFICIENT_TENDER") {
          setErrorMessage(
            "Uang diterima kurang dari total. Total telah diperbarui."
          )
        } else if (
          err.code === "EMPTY_SALE" ||
          err.code === "OPEN_SALE_NOT_FOUND"
        ) {
          // Another terminal paid or deleted this cart first.
          setErrorMessage(err.message)
          onOpenChange(false)
        } else if (
          err.code === "UNKNOWN_CASHIER" ||
          err.code === "SESSION_INVALID"
        ) {
          // lib/api/client.ts already ended the session; the layout redirects.
        } else {
          setErrorMessage(err.message)
        }
      } else {
        setErrorMessage("Tidak dapat menghubungi server kasir. Coba lagi.")
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        // Once paid, only Esc or "Tutup" dismiss -- a stray click on the
        // backdrop shouldn't drop the reprint option.
        if (!next && paid && details.reason === "outside-press") return
        if (next) onOpenChange(true)
        else handleClose()
      }}
    >
      <DialogContent
        finalFocus={false}
        showCloseButton={paid == null}
        onKeyDown={(e) => {
          // Enter reprints no matter where focus ended up. When a button has
          // focus, its own click handles Enter -- don't fire twice.
          if (!paid || e.key !== "Enter" || e.repeat) return
          if ((e.target as HTMLElement).closest("button")) return
          e.preventDefault()
          handleReprint()
        }}
        className="max-w-[calc(100%-2rem)] gap-0 p-0 sm:max-w-3xl"
      >
        <DialogHeader className="flex-row items-baseline justify-between border-b border-border p-6.5">
          <div>
            <DialogTitle className="font-sans text-2xl font-semibold tracking-normal normal-case">
              Pembayaran tunai
            </DialogTitle>
            <div className="mt-1 font-mono text-[14px] text-muted-foreground">
              Transaksi #{cartPosition} · {lineCount} baris · {units} unit
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
                <span className="font-mono text-3xl text-muted-foreground/60">
                  Rp
                </span>
              </InputGroupAddon>
              <InputGroupInput
                autoFocus
                inputMode="numeric"
                disabled={paid != null}
                value={tendered > 0 ? formatNumber(tendered) : ""}
                onChange={(e) => {
                  setTenderedRaw(e.target.value.replace(/\D/g, ""))
                  setErrorMessage(null)
                }}
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
            {errorMessage && (
              <p className="mt-2.5 text-sm text-destructive">{errorMessage}</p>
            )}
            <div className="mt-6 font-mono text-sm leading-relaxed text-muted-foreground">
              {paid
                ? "Enter untuk cetak ulang · Esc untuk tutup"
                : "Enter untuk konfirmasi · Esc untuk batal"}
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
            {paid ? (
              <div className="mt-6 flex flex-col gap-2.5">
                <Button
                  ref={reprintRef}
                  type="button"
                  onClick={handleReprint}
                  className={cn(
                    "h-auto w-full bg-card py-4.5 text-base text-primary normal-case hover:bg-card/90",
                    FOCUS_PULSE
                  )}
                >
                  {printTransaction.isPending ? "Mencetak…" : "Cetak Ulang"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className={cn(
                    "h-auto w-full border-primary-foreground/40 py-4.5 text-base text-primary-foreground normal-case hover:bg-primary-foreground/10 hover:text-primary-foreground",
                    FOCUS_PULSE
                  )}
                >
                  Tutup
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                disabled={!canConfirm}
                onClick={handleConfirm}
                className={cn(
                  "mt-6 h-auto w-full bg-card py-4.5 text-base text-primary normal-case hover:bg-card/90",
                  FOCUS_PULSE
                )}
              >
                {checkout.isPending ? "Memproses…" : "Konfirmasi & Cetak Struk"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
