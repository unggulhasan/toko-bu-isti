"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatClock, formatNumber } from "@/lib/format"
import type { TransactionListItem } from "@/lib/types"

export function TransactionsTable({
  transactions,
  selectedId,
  onSelect,
}: {
  transactions: TransactionListItem[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex-1 overflow-hidden rounded-none border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Transaksi</TableHead>
            <TableHead className="w-22.5">Waktu</TableHead>
            <TableHead>Kasir</TableHead>
            <TableHead className="w-23 text-right">Barang</TableHead>
            <TableHead className="w-30 text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t) => {
            const isSelected = t.id === selectedId
            const isVoided = t.status === "voided"
            return (
              <TableRow
                key={t.id}
                onClick={() => onSelect(t.id)}
                className={cn(
                  "cursor-pointer font-mono text-[13px]",
                  isSelected && "border-l-3 border-l-primary bg-primary/8",
                  isVoided && "text-muted-foreground"
                )}
              >
                <TableCell
                  className={cn(
                    "font-bold",
                    isVoided && "font-normal line-through"
                  )}
                >
                  #{t.saleNumber}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatClock(new Date(t.createdAt))}
                </TableCell>
                <TableCell className="font-sans text-[13.5px]">
                  {t.cashierName}
                  {isVoided && " · dibatalkan"}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {t.units}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-semibold",
                    isVoided && "font-normal line-through"
                  )}
                >
                  {formatNumber(t.total)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
