"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
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
import { useSalesStore } from "@/lib/store/sales-store"

const MIN_QTY = 0
const MAX_QTY = 1000

export type CartTableHandle = {
  focusQty: (lineId: string) => void
}

export const CartTable = forwardRef<CartTableHandle, { onQtyEnter?: () => void }>(
  function CartTable({ onQtyEnter }, ref) {
    const {
      activeSale: getActiveSale,
      justScannedLineId,
      setLineQty,
      removeLine,
      selectedLineId,
      setSelectedLineId,
    } = useSalesStore()
    const activeSale = getActiveSale()
    const justScannedRowRef = useRef<HTMLTableRowElement>(null)
    const qtyInputRefs = useRef(new Map<string, HTMLInputElement>())

    const lines = activeSale?.lines ?? []

    useEffect(() => {
      if (justScannedLineId) {
        justScannedRowRef.current?.scrollIntoView({ block: "nearest" })
      }
    }, [justScannedLineId])

    useImperativeHandle(ref, () => ({
      focusQty: (lineId) => {
        const input = qtyInputRefs.current.get(lineId)
        input?.focus()
        input?.select()
      },
    }))

    function selectLine(lineId: string) {
      setSelectedLineId(lineId)
    }

    function commitQty(lineId: string, raw: string) {
      const qty = Number(raw)
      if (raw !== "" && Number.isFinite(qty)) {
        setLineQty(lineId, Math.max(MIN_QTY, Math.min(MAX_QTY, qty)))
      }
    }

    return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="text-center">No</TableHead>
              <TableHead>Barang</TableHead>
              <TableHead className="text-center">Jml</TableHead>
              <TableHead className="text-right">Harga</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const isSelected = line.id === selectedLineId
              const justScanned = line.id === justScannedLineId
              return (
                <TableRow
                  key={line.id}
                  ref={justScanned ? justScannedRowRef : undefined}
                  className={cn(
                    justScanned && "bg-primary/8",
                    isSelected && "bg-muted"
                  )}
                >
                  <TableCell className="text-center font-mono text-sm text-muted-foreground">
                    {index + 1}
                  </TableCell>
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
                      <input
                        ref={(el) => {
                          if (el) qtyInputRefs.current.set(line.id, el)
                          else qtyInputRefs.current.delete(line.id)
                        }}
                        type="number"
                        min={MIN_QTY}
                        max={MAX_QTY}
                        value={line.qty}
                        onFocus={() => selectLine(line.id)}
                        onChange={(e) => commitQty(line.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            onQtyEnter?.()
                          }
                        }}
                        className={cn(
                          "w-13 rounded-none border bg-card py-1.25 text-center font-mono text-sm text-foreground outline-none",
                          isSelected
                            ? "border-primary shadow-[0_0_0_3px_rgba(26,92,84,0.15)]"
                            : "border-border"
                        )}
                      />
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
    </div>
    )
  }
)
