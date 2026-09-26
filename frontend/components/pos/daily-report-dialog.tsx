"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { reportUrl } from "@/lib/api/transactions"
import { formatDateParam } from "@/lib/format"

export function DailyReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [date, setDate] = useState<Date>(() => new Date())

  function handlePrint() {
    window.open(reportUrl(formatDateParam(date)), "_blank")
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) setDate(new Date())
      }}
    >
      <DialogContent finalFocus={false}>
        <DialogHeader>
          <DialogTitle>Laporan harian</DialogTitle>
        </DialogHeader>
        <DatePicker
          date={date}
          onSelect={(d) => d && setDate(d)}
          disabled={(d) => d > new Date()}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" onClick={handlePrint}>
            Cetak
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
