"use client"

import { useRef, useState } from "react"

import {
  TransactionLookupInput,
  type TransactionLookupInputHandle,
} from "@/components/pos/transaction-lookup-input"
import { ReceiptPanel } from "@/components/pos/receipt-panel"
import { useTransactionByNumber } from "@/lib/hooks/use-transactions"

export default function TransactionsPage() {
  const [saleNumber, setSaleNumber] = useState<number | null>(null)
  const inputRef = useRef<TransactionLookupInputHandle>(null)
  const { data: transaction, isLoading, isError } =
    useTransactionByNumber(saleNumber)

  return (
    <div className="px-6.5 py-6">
      <TransactionLookupInput ref={inputRef} onLookup={setSaleNumber} />
      <div className="mt-4.5">
        <ReceiptPanel
          transaction={transaction ?? null}
          isLoading={saleNumber != null && isLoading}
          notFound={saleNumber != null && isError}
          onClear={() => {
            setSaleNumber(null)
            inputRef.current?.focus()
          }}
        />
      </div>
    </div>
  )
}
