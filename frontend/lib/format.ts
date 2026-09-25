const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
})

export function formatRupiah(amount: number): string {
  return `Rp ${rupiahFormatter.format(Math.max(0, Math.round(amount)))}`
}

export function formatNumber(amount: number): string {
  return rupiahFormatter.format(Math.round(amount))
}

export function parseRupiahInput(raw: string): number {
  const digits = raw.replace(/\D/g, "")
  return digits ? Number(digits) : 0
}

export function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

export function formatDateID(date: Date): string {
  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}
