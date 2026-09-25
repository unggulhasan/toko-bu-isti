"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { XIcon } from "lucide-react"

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
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
    const qtyInputRefs = useRef(new Map<string, HTMLInputElement>())
    const rowRefs = useRef(new Map<string, HTMLTableRowElement>())
    const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({})

    const lines = activeSale?.lines ?? []

    useEffect(() => {
      if (justScannedLineId) {
        rowRefs.current.get(justScannedLineId)?.scrollIntoView({ block: "nearest" })
      }
    }, [justScannedLineId])

    useEffect(() => {
      if (selectedLineId) {
        rowRefs.current.get(selectedLineId)?.scrollIntoView({ block: "nearest" })
      }
    }, [selectedLineId])

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

    function setDraft(lineId: string, raw: string) {
      setQtyDrafts((prev) => ({ ...prev, [lineId]: raw }))
    }

    function clearDraft(lineId: string) {
      setQtyDrafts((prev) => {
        const { [lineId]: _removed, ...rest } = prev
        return rest
      })
    }

    function commitQty(lineId: string) {
      const raw = qtyDrafts[lineId]
      if (raw === undefined) return
      const qty = Number(raw)
      if (raw !== "" && Number.isFinite(qty)) {
        setLineQty(lineId, Math.max(MIN_QTY, Math.min(MAX_QTY, qty)))
      }
      clearDraft(lineId)
    }

    return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-10 bg-card text-center">No</TableHead>
              <TableHead className="sticky top-0 z-10 bg-card">Barang</TableHead>
              <TableHead className="sticky top-0 z-10 bg-card text-center">Jml</TableHead>
              <TableHead className="sticky top-0 z-10 bg-card text-right">Harga (Rp)</TableHead>
              <TableHead className="sticky top-0 z-10 bg-card text-right">Jumlah (Rp)</TableHead>
              <TableHead className="sticky top-0 z-10 bg-card" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const isSelected = line.id === selectedLineId
              const justScanned = line.id === justScannedLineId
              return (
                <TableRow
                  key={line.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(line.id, el)
                    else rowRefs.current.delete(line.id)
                  }}
                  className={cn(
                    "scroll-mt-12",
                    justScanned && "bg-primary/8",
                    isSelected && "bg-muted"
                  )}
                >
                  <TableCell className="py-2 text-center font-mono text-base text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2.25">
                      <span className="text-base font-medium text-foreground">
                        {line.name}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {line.barcode}
                      </span>
                      {justScanned && (
                        <Badge className="bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                          Baru dipindai
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex justify-center">
                      <input
                        ref={(el) => {
                          if (el) qtyInputRefs.current.set(line.id, el)
                          else qtyInputRefs.current.delete(line.id)
                        }}
                        type="number"
                        min={MIN_QTY}
                        max={MAX_QTY}
                        value={qtyDrafts[line.id] ?? line.qty}
                        onFocus={() => selectLine(line.id)}
                        onChange={(e) => setDraft(line.id, e.target.value)}
                        onBlur={() => commitQty(line.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            commitQty(line.id)
                            onQtyEnter?.()
                          }
                        }}
                        className={cn(
                          "w-13 rounded-none border bg-card py-1.25 text-center font-mono text-base text-foreground outline-none",
                          isSelected
                            ? "border-primary shadow-[0_0_0_3px_rgba(26,92,84,0.15)]"
                            : "border-border"
                        )}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono text-base text-muted-foreground">
                    {formatNumber(line.price)}
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono text-base font-medium">
                    {formatNumber(lineAmount(line))}
                  </TableCell>
                  <TableCell className="py-2 text-center">
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
        </table>
      </div>
    </div>
    )
  }
)
