import { formatNumber } from "@/lib/format"

export function TransactionsStatStrip({
  salesCount,
  gross,
  cashInDrawer,
  voidedCount,
}: {
  salesCount: number
  gross: number
  cashInDrawer: number
  voidedCount: number
}) {
  const stats = [
    { label: "Penjualan", value: formatNumber(salesCount) },
    { label: "Bruto", value: formatNumber(gross) },
    { label: "Uang di laci", value: formatNumber(cashInDrawer) },
    { label: "Dibatalkan", value: formatNumber(voidedCount), muted: true },
  ]

  return (
    <div className="mb-4.5 flex gap-px overflow-hidden rounded-none border border-border bg-border">
      {stats.map((stat) => (
        <div key={stat.label} className="flex-1 bg-card px-5 py-4">
          <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {stat.label}
          </div>
          <div
            className={`mt-1.5 font-mono text-2xl font-semibold ${
              stat.muted ? "text-muted-foreground" : "text-foreground"
            }`}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}
