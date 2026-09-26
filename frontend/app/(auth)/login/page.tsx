"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { formatClock, formatDateID } from "@/lib/format"
import { getGreeting } from "@/lib/greeting"
import { useSessionHydrated, useSessionStore } from "@/lib/store/session-store"

export default function LoginPage() {
  const router = useRouter()
  const [now, setNow] = useState(() => new Date())
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)
  const hydrated = useSessionHydrated()
  const isLoggedIn = useSessionStore((state) => state.isLoggedIn)
  const login = useSessionStore((state) => state.login)

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (hydrated && isLoggedIn) {
      router.replace("/")
    }
  }, [hydrated, isLoggedIn, router])

  function handleSubmit(formData: FormData) {
    const value = String(formData.get("password") ?? "")
    if (login(value)) {
      router.push("/")
    } else {
      setError(true)
      setPassword("")
    }
  }

  return (
    <div className="flex h-svh bg-shell">
      <div className="relative min-w-0 flex-[1.35]">
        <div className="absolute inset-0 bg-shell" />
        <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-linear-to-b from-shell/55 to-transparent px-7.5 py-6.5">
          <div className="size-5.5 rounded-sm bg-primary" />
          <span className="text-sm font-semibold text-shell-foreground">
            Toko Bu Isti
          </span>
        </div>
        <div className="absolute right-7.5 bottom-7.5 flex flex-col items-end gap-1.5">
          <span className="rounded-sm bg-shell/72 px-3 py-1.5 font-serif text-[22px] italic text-shell-foreground">
            Toko kami, Jl. Pelabuhan 7
          </span>
        </div>
      </div>
      <div className="flex w-115 flex-none flex-col bg-background px-12 py-8.5">
        <div className="flex justify-between font-mono text-[11.5px] text-muted-foreground">
          <span>Kasir 01</span>
          <span>Buka 08.00–20.00</span>
        </div>
        <div className="mt-auto">
          <div className="font-mono text-6xl font-medium tracking-tight text-foreground">
            {formatClock(now)}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {formatDateID(now)}
          </div>
          <div className="mt-10 font-serif text-[42px] leading-tight text-foreground italic">
            {getGreeting(now)}
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
            Masukkan kata sandi kasir untuk membuka mesin kasir.
          </p>
          <form action={handleSubmit} className="contents">
            <Label htmlFor="password" className="mt-7.5 mb-2">
              Kata sandi
            </Label>
            <input type="hidden" name="password" value={password} />
            <InputOTP
              id="password"
              maxLength={4}
              autoFocus
              value={password}
              onChange={(value) => {
                setPassword(value)
                setError(false)
              }}
              containerClassName="justify-between"
            >
              <InputOTPGroup className="w-full justify-between gap-2">
                {[0, 1, 2, 3].map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="h-13.5 w-1/5 flex-1 rounded-none border-2 border-primary bg-card font-mono text-[22px] shadow-[0_0_0_4px_rgba(26,92,84,0.1)] data-[active=true]:border-primary"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error && (
              <p className="mt-2 text-sm text-destructive">Kata sandi salah. Coba lagi.</p>
            )}
            <Button type="submit" className="mt-3.5 h-auto w-full py-4 text-[15.5px] normal-case">
              Masuk
            </Button>
          </form>
          <div className="mt-3 font-mono text-[11px] text-muted-foreground">
            Enter untuk masuk
          </div>
        </div>
      </div>
    </div>
  )
}
