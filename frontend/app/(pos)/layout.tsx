import { AppShell } from "@/components/pos/app-shell"
import { Toaster } from "@/components/ui/toast"

export default function PosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Toaster>
      <AppShell>{children}</AppShell>
    </Toaster>
  )
}
