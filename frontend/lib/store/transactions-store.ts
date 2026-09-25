import { create } from "zustand"
import { persist } from "zustand/middleware"

import { SEED_TRANSACTIONS } from "@/lib/data/seed-transactions"
import type { OpenSale, Transaction } from "@/lib/types"

type TransactionsState = {
  transactions: Transaction[]
}

type TransactionsActions = {
  commitSale: (
    sale: OpenSale,
    total: number,
    tendered: number,
    cashierName: string,
    registerId: string
  ) => Transaction
  voidTransaction: (id: string) => void
}

export const useTransactionsStore = create<
  TransactionsState & TransactionsActions
>()(
  persist(
    (set) => ({
      transactions: SEED_TRANSACTIONS,
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
        set((state) => ({ transactions: [transaction, ...state.transactions] }))
        return transaction
      },
      voidTransaction: (id) => {
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === id ? { ...t, status: "voided" } : t
          ),
        }))
      },
    }),
    {
      name: "pos:transactions",
      skipHydration: true,
    }
  )
)
