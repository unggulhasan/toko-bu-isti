"use client"

import { useState } from "react"

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
import { useSessionStore } from "@/lib/store/session-store"
import { toast } from "@/components/ui/toast"

export function CashPaymentDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { sale: activeSale, activeIndex } = useActiveSale()
  const activeSaleNumber = activeIndex + 1
  const checkout = useCheckout()
  const printTransaction = usePrintTransaction()
  const logout = useSessionStore((s) => s.logout)
  const [tenderedRaw, setTenderedRaw] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const lines = activeSale?.lines ?? []
  const total = activeSale?.total ?? 0
  const units = activeSale?.units ?? 0
  const tendered = parseRupiahInput(tenderedRaw)
  const change = tendered - total
  const canConfirm =
    activeSale != null &&
    lines.length > 0 &&
    tendered >= total &&
    !checkout.isPending

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
      setTenderedRaw("")
      onOpenChange(false)
      // The sale is already committed at this point -- a print failure must not
      // undo or block the checkout, so it only swaps which toast is shown.
      printTransaction.mutate(txn.id, {
        onSuccess: () => {
          toast.add({
            title: "Struk dicetak",
            description: `Transaksi #${txn.saleNumber} selesai.`,
          })
        },
        onError: (err) => {
          toast.add({
            title: "Transaksi selesai, struk gagal dicetak",
            description:
              err instanceof ApiError
                ? err.message
                : `Transaksi #${txn.saleNumber} -- cetak ulang dari halaman transaksi.`,
          })
        },
      })
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
        } else if (err.code === "UNKNOWN_CASHIER") {
          logout()
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
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setTenderedRaw("")
          setErrorMessage(null)
        }
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
              Transaksi #{activeSaleNumber} · {lines.length} baris · {units}{" "}
              unit
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
              {checkout.isPending ? "Memproses…" : "Konfirmasi & cetak struk"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
