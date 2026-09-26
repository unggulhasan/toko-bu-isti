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

// Short enough for the app-shell header chip, where the long form wraps.
export function formatDateShortID(date: Date): string {
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

// Local calendar date as "YYYY-MM-DD" for query params. Never .toISOString()
// -- that reads UTC fields and would shift the date near midnight in Jakarta
// (UTC+7).
export function formatDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
