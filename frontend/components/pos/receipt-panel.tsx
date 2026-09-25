"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { VoidSaleDialog } from "@/components/pos/void-sale-dialog"
import { formatDateID, formatClock, formatNumber } from "@/lib/format"
import { saleUnits } from "@/lib/pos-calculations"
import { useTransactionsStore } from "@/lib/store/transactions-store"
import { toast } from "@/components/ui/toast"
import type { Transaction } from "@/lib/types"

export function ReceiptPanel({ transaction }: { transaction: Transaction | undefined }) {
  const voidTransaction = useTransactionsStore((s) => s.voidTransaction)
  const [voidOpen, setVoidOpen] = useState(false)

  if (!transaction) {
    return (
      <div className="flex w-80 flex-none items-center justify-center rounded-none border border-border bg-card p-5.5 text-sm text-muted-foreground">
        Pilih transaksi untuk melihat struk.
      </div>
    )
  }

  const isVoided = transaction.status === "voided"
  const createdAt = new Date(transaction.createdAt)

  return (
    <div className="w-80 flex-none rounded-none border border-border bg-card p-5.5">
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
        {formatDateID(createdAt)} {formatClock(createdAt)} · REG {transaction.registerId} ·{" "}
        {transaction.cashierName}
      </div>
      <Separator className="my-4" />
      {transaction.lines.map((line) => (
        <div key={line.id} className="flex justify-between py-1.25 text-[13px] text-foreground">
          <span>
            {line.qty} × {line.name}
          </span>
          <span className="font-mono">{formatNumber(line.price * line.qty)}</span>
        </div>
      ))}
      <Separator className="mt-3.5 mb-0" />
      <div className="pt-3">
        <div className="flex justify-between py-0.75 text-[12.5px] text-muted-foreground">
          <span>Unit</span>
          <span className="font-mono">{saleUnits(transaction.lines)}</span>
        </div>
        <div className="flex items-baseline justify-between pt-2.5">
          <span className="text-[13px] font-semibold text-foreground">Total</span>
          <span className="font-mono text-xl font-bold text-foreground">
            {formatNumber(transaction.total)}
          </span>
        </div>
        <div className="flex justify-between pt-1.5 text-[12.5px] text-muted-foreground">
          <span>Tunai / kembalian</span>
          <span className="font-mono">
            {formatNumber(transaction.tendered)} / {formatNumber(transaction.change)}
          </span>
        </div>
      </div>
      <div className="mt-4.5 flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 normal-case"
          onClick={() =>
            toast.add({ title: "Struk dicetak ulang", description: `Transaksi #${transaction.saleNumber}` })
          }
        >
          Cetak ulang
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={isVoided}
          className="flex-1 normal-case"
          onClick={() => setVoidOpen(true)}
        >
          Batalkan transaksi
        </Button>
      </div>
      <VoidSaleDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        saleNumber={transaction.saleNumber}
        onConfirm={() => {
          voidTransaction(transaction.id)
          setVoidOpen(false)
        }}
      />
    </div>
  )
}
