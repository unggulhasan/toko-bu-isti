"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatDateShortID } from "@/lib/format"
import { useSessionStore } from "@/lib/store/session-store"

const NAV_ITEMS = [
  { href: "/", label: "Kasir" },
  { href: "/products", label: "Produk" },
  { href: "/transactions", label: "Transaksi" },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { cashierName, logout } = useSessionStore()
  // Filled in on the client only: rendering the date during SSR risks serializing
  // a different day than the browser, and a static value would never roll over.
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  function handleLogout() {
    logout()
    // Otherwise the next cashier's first paint shows this cashier's cached
    // open sales and transactions.
    queryClient.clear()
    router.push("/login")
  }

  return (
    <div className="flex h-svh flex-col">
      <header className="flex shrink-0 items-center gap-7.5 bg-shell px-6 text-shell-foreground">
        <div className="flex items-center gap-3 py-3.5">
          <div className="size-5 rounded-sm bg-primary" />
          <span className="text-[13.5px] font-semibold">Toko Bu Isti</span>
        </div>
        <nav className="ml-2 flex gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-4 py-3.5 text-[15px] text-shell-foreground/60",
                  active &&
                    "font-semibold text-shell-foreground shadow-[inset_0_-3px_0_var(--primary)]"
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-5.5 font-mono text-[11.5px] text-shell-foreground/60">
          <span>{now ? formatDateShortID(now) : null}</span>
          <span className="text-shell-foreground">{cashierName}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-shell-foreground/60 hover:bg-shell-foreground/10 hover:text-shell-foreground"
            aria-label="Keluar"
          >
            Keluar <LogOut className="ml-1.5 size-4" />
          </Button>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col bg-background">
        {children}
      </main>
    </div>
  )
}
