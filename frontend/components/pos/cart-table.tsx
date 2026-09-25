"use client"

import { useState } from "react"
import { XIcon } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatRupiah } from "@/lib/format"
import { lineAmount } from "@/lib/pos-calculations"
import { useSales } from "@/lib/state/sales-provider"

export function CartTable() {
  const { activeSale, justScannedLineId, setLineQty, removeLine } = useSales()
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [qtyBuffer, setQtyBuffer] = useState("")

  const lines = activeSale?.lines ?? []

  function selectLine(lineId: string) {
    setSelectedLineId(lineId)
    setQtyBuffer("")
  }

  function commitQty(lineId: string) {
    const qty = Number(qtyBuffer)
    if (qtyBuffer && qty > 0) {
      setLineQty(lineId, qty)
    }
    setQtyBuffer("")
  }

  return (
    <div className="overflow-hidden rounded-none border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Barang</TableHead>
            <TableHead className="text-center">Jml</TableHead>
            <TableHead className="text-right">Harga</TableHead>
            <TableHead className="text-right">Jumlah</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => {
            const isSelected = line.id === selectedLineId
            const justScanned = line.id === justScannedLineId
            return (
              <TableRow
                key={line.id}
                className={cn(justScanned && "bg-primary/8")}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (/^[0-9]$/.test(e.key)) {
                    selectLine(line.id)
                    setQtyBuffer((prev) => prev + e.key)
                  } else if (e.key === "Enter") {
                    commitQty(line.id)
                  } else if (e.key === "Backspace") {
                    setQtyBuffer((prev) => prev.slice(0, -1))
                  }
                }}
              >
                <TableCell>
                  <div className="flex items-center gap-2.25">
                    <span className="text-[14.5px] font-medium text-foreground">
                      {line.name}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {line.barcode}
                    </span>
                    {justScanned && (
                      <Badge className="bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                        Baru dipindai
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => selectLine(line.id)}
                      className={cn(
                        "w-13 rounded-none border bg-card py-1.25 text-center font-mono text-sm text-foreground",
                        isSelected
                          ? "border-primary shadow-[0_0_0_3px_rgba(26,92,84,0.15)]"
                          : "border-border"
                      )}
                    >
                      {isSelected && qtyBuffer ? qtyBuffer : line.qty}
                    </button>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                  {formatRupiah(line.price)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-medium">
                  {formatRupiah(lineAmount(line))}
                </TableCell>
                <TableCell className="text-center">
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="text-muted-foreground/50 hover:text-destructive"
                    aria-label={`Hapus ${line.name}`}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
