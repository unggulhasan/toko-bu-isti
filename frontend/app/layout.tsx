import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { SessionProvider } from "@/lib/state/session-provider"
import { ProductsProvider } from "@/lib/state/products-provider"
import { SalesProvider } from "@/lib/state/sales-provider"
import { TransactionsProvider } from "@/lib/state/transactions-provider"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const geistMono = Geist_Mono({subsets:['latin'],variable:'--font-mono'})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={cn("antialiased", fontSans.variable, "font-mono", geistMono.variable)}
    >
      <body>
        <ThemeProvider>
          <SessionProvider>
            <ProductsProvider>
              <SalesProvider>
                <TransactionsProvider>{children}</TransactionsProvider>
              </SalesProvider>
            </ProductsProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
