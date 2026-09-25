"use client"

import { useMemo, useState } from "react"

import { TransactionsStatStrip } from "@/components/pos/transactions-stat-strip"
import { TransactionsTable } from "@/components/pos/transactions-table"
import { ReceiptPanel } from "@/components/pos/receipt-panel"
import { formatDateID } from "@/lib/format"
import { saleTotal } from "@/lib/pos-calculations"
import { useSession } from "@/lib/state/session-provider"
import { useTransactions } from "@/lib/state/transactions-provider"

export default function TransactionsPage() {
  const { transactions } = useTransactions()
  const { registerId } = useSession()
  const [selectedId, setSelectedId] = useState<string | null>(
    transactions[0]?.id ?? null
  )

  const stats = useMemo(() => {
    const completed = transactions.filter((t) => t.status === "completed")
    const voided = transactions.filter((t) => t.status === "voided")
    return {
      salesCount: completed.length,
      gross: completed.reduce((sum, t) => sum + saleTotal(t.lines), 0),
      cashInDrawer: completed.reduce((sum, t) => sum + t.total, 0),
      voidedCount: voided.length,
    }
  }, [transactions])

  const selected = transactions.find((t) => t.id === selectedId) ?? transactions[0]

  return (
    <div className="px-6.5 py-6">
      <div className="mb-4.5 flex items-end justify-between">
        <div>
          <div className="text-[23px] font-semibold tracking-tight text-foreground">
            Transaksi
          </div>
          <div className="mt-1 text-[12.5px] text-muted-foreground">
            {formatDateID(new Date())} · register {registerId}
          </div>
        </div>
      </div>
      <TransactionsStatStrip {...stats} />
      <div className="flex items-start gap-5">
        <TransactionsTable
          transactions={transactions}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />
        <ReceiptPanel transaction={selected} />
      </div>
    </div>
  )
}
