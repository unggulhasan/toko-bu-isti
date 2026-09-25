"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function VoidSaleDialog({
  open,
  onOpenChange,
  saleNumber,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleNumber: number | undefined
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-sans tracking-normal normal-case">
            Batalkan transaksi #{saleNumber}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Transaksi ini akan ditandai sebagai dibatalkan dan tidak dihitung
            dalam total penjualan. Tindakan ini tidak dapat dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="normal-case">Batal</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={onConfirm}
            className="normal-case"
          >
            Batalkan transaksi
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
