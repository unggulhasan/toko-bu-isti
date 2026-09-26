"use client"

import { useState } from "react"

import { TransactionsStatStrip } from "@/components/pos/transactions-stat-strip"
import { TransactionsTable } from "@/components/pos/transactions-table"
import { ReceiptPanel } from "@/components/pos/receipt-panel"
import { formatDateID } from "@/lib/format"
import {
  useTransactionSummary,
  useTransactions,
} from "@/lib/hooks/use-transactions"

export default function TransactionsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data } = useTransactions({ page: 0, statusFilter: "all" })
  const { data: summary } = useTransactionSummary()

  const items = data?.items ?? []
  // A derivation, not an effect syncing state to props: an explicit
  // selection sticks across refetches, and with none the first row shows.
  // (The old code initialized selectedId from transactions[0]?.id once at
  // mount, which ran against an empty array before data loaded and was
  // permanently null -- masked only by this same fallback.)
  const effectiveId = selectedId ?? items[0]?.id ?? null

  return (
    <div className="px-6.5 py-6">
      <div className="mb-4.5 flex items-end justify-between">
        <div>
          <div className="text-[23px] font-semibold tracking-tight text-foreground">
            Transaksi
          </div>
          <div className="mt-1 text-[12.5px] text-muted-foreground">
            {formatDateID(new Date())}
          </div>
        </div>
      </div>
      <TransactionsStatStrip
        salesCount={summary?.salesCount ?? 0}
        gross={summary?.gross ?? 0}
        cashInDrawer={summary?.cashInDrawer ?? 0}
        voidedCount={summary?.voidedCount ?? 0}
      />
      <div className="flex items-start gap-5">
        <TransactionsTable
          transactions={items}
          selectedId={effectiveId}
          onSelect={setSelectedId}
        />
        <ReceiptPanel transactionId={effectiveId} />
      </div>
    </div>
  )
}
