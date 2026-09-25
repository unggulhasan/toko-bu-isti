"use client"

import { createContext, useContext, useMemo } from "react"

import { useLocalStorageState } from "@/hooks/use-local-storage-state"
import { SEED_TRANSACTIONS } from "@/lib/data/seed-transactions"
import type { OpenSale, Transaction } from "@/lib/types"

type TransactionsContextValue = {
  transactions: Transaction[]
  commitSale: (
    sale: OpenSale,
    total: number,
    tendered: number,
    cashierName: string,
    registerId: string
  ) => Transaction
  voidTransaction: (id: string) => void
}

const TransactionsContext = createContext<TransactionsContextValue | null>(
  null
)

export function TransactionsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [transactions, setTransactions] = useLocalStorageState<Transaction[]>(
    "pos:transactions",
    SEED_TRANSACTIONS
  )

  const value = useMemo<TransactionsContextValue>(
    () => ({
      transactions,
      commitSale: (sale, total, tendered, cashierName, registerId) => {
        const transaction: Transaction = {
          id: `t-${sale.number}-${Date.now()}`,
          saleNumber: sale.number,
          lines: sale.lines,
          total,
          tendered,
          change: tendered - total,
          cashierName,
          registerId,
          createdAt: new Date().toISOString(),
          status: "completed",
        }
        setTransactions((prev) => [transaction, ...prev])
        return transaction
      },
      voidTransaction: (id) => {
        setTransactions((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: "voided" } : t))
        )
      },
    }),
    [transactions, setTransactions]
  )

  return (
    <TransactionsContext.Provider value={value}>
      {children}
    </TransactionsContext.Provider>
  )
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext)
  if (!ctx)
    throw new Error("useTransactions must be used within TransactionsProvider")
  return ctx
}
