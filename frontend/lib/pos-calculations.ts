import type { SaleLine } from "@/lib/types"

export function lineAmount(line: SaleLine): number {
  return line.price * line.qty
}

export function saleUnits(lines: SaleLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0)
}

export function saleTotal(lines: SaleLine[]): number {
  return lines.reduce((sum, line) => sum + lineAmount(line), 0)
}
