"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateID, formatClock, formatNumber } from "@/lib/format"
import { saleUnits } from "@/lib/pos-calculations"
import { ApiError } from "@/lib/api/client"
import { usePrintTransaction } from "@/lib/hooks/use-transactions"
import { toast } from "@/components/ui/toast"
import type { Transaction } from "@/lib/types"

export function ReceiptPanel({
  transaction,
  isLoading,
  notFound,
  onClear,
}: {
  transaction: Transaction | null
  isLoading: boolean
  notFound: boolean
  onClear: () => void
}) {
  const printTransaction = usePrintTransaction()
  const [printError, setPrintError] = useState<string | null>(null)

  if (notFound) {
    return (
      <div className="flex w-full max-w-md items-center justify-center rounded-none border border-border bg-card p-5.5 text-sm text-muted-foreground">
        Transaksi tidak ditemukan.
      </div>
    )
  }

  if (!transaction && !isLoading) {
    return (
      <div className="flex w-full max-w-md items-center justify-center rounded-none border border-border bg-card p-5.5 text-sm text-muted-foreground">
        Pindai atau ketik nomor transaksi untuk melihat struk.
      </div>
    )
  }

  if (isLoading || !transaction) {
    return (
      <div className="w-full max-w-md rounded-none border border-border bg-card p-5.5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-3 w-40" />
        <Separator className="my-4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-2/3" />
      </div>
    )
  }

  const isVoided = transaction.status === "voided"
  const createdAt = new Date(transaction.createdAt)

  return (
    <div className="w-full max-w-md rounded-none border border-border bg-card p-5.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[15px] font-bold text-foreground">
          Transaksi #{transaction.saleNumber}
        </span>
        {isVoided ? (
          <Badge className="bg-muted px-2 py-0.75 text-[11.5px] text-muted-foreground">
            Dibatalkan
          </Badge>
        ) : (
          <Badge className="bg-primary/10 px-2 py-0.75 text-[11.5px] text-primary">
            Selesai
          </Badge>
        )}
      </div>
      <div className="mt-1.5 font-mono text-[11.5px] text-muted-foreground">
        {formatDateID(createdAt)} {formatClock(createdAt)} ·{" "}
        {transaction.cashierName}
      </div>
      <Separator className="my-4" />
      {transaction.lines.map((line) => (
        <div
          key={line.id}
          className="flex justify-between py-1.25 text-[13px] text-foreground"
        >
          <span>
            {line.qty} × {line.name}
          </span>
          <span className="font-mono">
            {formatNumber(line.price * line.qty)}
          </span>
        </div>
      ))}
      <Separator className="mt-3.5 mb-0" />
      <div className="pt-3">
        <div className="flex justify-between py-0.75 text-[12.5px] text-muted-foreground">
          <span>Unit</span>
          <span className="font-mono">{saleUnits(transaction.lines)}</span>
        </div>
        <div className="flex items-baseline justify-between pt-2.5">
          <span className="text-[13px] font-semibold text-foreground">
            Total
          </span>
          <span className="font-mono text-xl font-bold text-foreground">
            {formatNumber(transaction.total)}
          </span>
        </div>
        <div className="flex justify-between pt-1.5 text-[12.5px] text-muted-foreground">
          <span>Tunai / kembalian</span>
          <span className="font-mono">
            {formatNumber(transaction.tendered)} /{" "}
            {formatNumber(transaction.change)}
          </span>
        </div>
      </div>
      {printError && (
        <p className="mt-3 text-sm text-destructive">{printError}</p>
      )}
      <div className="mt-4.5 flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={printTransaction.isPending}
          className="flex-1 normal-case"
          onClick={() => {
            setPrintError(null)
            printTransaction.mutate(transaction.id, {
              onSuccess: () => {
                toast.add({
                  title: "Struk dicetak ulang",
                  description: `Transaksi #${transaction.saleNumber}`,
                })
              },
              onError: (err) => {
                setPrintError(
                  err instanceof ApiError
                    ? err.message
                    : "Tidak dapat menghubungi printer."
                )
              },
            })
          }}
        >
          Cetak ulang
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1 normal-case"
          onClick={onClear}
        >
          Bersihkan
        </Button>
      </div>
    </div>
  )
}
