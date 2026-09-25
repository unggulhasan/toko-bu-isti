"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useSession } from "@/lib/state/session-provider"

const NAV_ITEMS = [
  { href: "/", label: "Kasir" },
  { href: "/products", label: "Produk" },
  { href: "/transactions", label: "Transaksi" },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { cashierName, registerId } = useSession()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center gap-7.5 bg-shell px-6 text-shell-foreground">
        <div className="flex items-center gap-3 py-3.5">
          <div className="size-5 rounded-sm bg-primary" />
          <span className="text-[13.5px] font-semibold">Toko Northline</span>
        </div>
        <nav className="ml-2 flex gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-4 py-3.5 text-[13px] text-shell-foreground/60",
                  active && "font-semibold text-shell-foreground shadow-[inset_0_-3px_0_var(--primary)]"
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-5.5 font-mono text-[11.5px] text-shell-foreground/60">
          <span>Register {registerId}</span>
          <span className="text-shell-foreground">{cashierName}</span>
        </div>
      </header>
      <main className="flex-1 bg-background">{children}</main>
    </div>
  )
}
