"use client"

import { useEffect, useState } from "react"
import { preload } from "react-dom"
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
import { ApiError } from "@/lib/api/client"
import { useLogin } from "@/lib/hooks/use-auth"
import { useSessionHydrated, useSessionStore } from "@/lib/store/session-store"

// Inlined 24px-wide JPEG (~1KB) of login-bg.jpg, shown blurred behind the
// full-resolution image while it loads over the LAN link to the client PC.
const LOGIN_BG_BLUR_DATA_URL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAGKADAAQAAAABAAAAEgAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEgAYAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMACQkJCQkJEAkJEBYQEBAWHhYWFhYeJh4eHh4eJi4mJiYmJiYuLi4uLi4uLjc3Nzc3N0BAQEBASEhISEhISEhISP/bAEMBCwwMEhESHxERH0szKjNLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS//dAAQAAv/aAAwDAQACEQMRAD8Anl1EPIsE0cT+X8xUfxfUg8jnioZggQKiqF6kjHBY4C8+gqzHJPDAY1jjIBCMQvzFsDg+o4p5Fw8bgRggnLBRzz2Hatua1knZXM3BO/MnzW6kNnepZh4fl56hl3Fc+nIx9Kt/2nbf3v8AyH/9lWUbcMzbcCQ8kN1GcAYP6U37Bc+i/wDfQ/xq17J61LXM+WstKadj/9De0zi6u1HA89+PwFNtSRNNg/wKfxyadpv/AB+Xf/Xd/wCQplt/rpv9xf5muSp19V+hrT+CP9dxkEkjwRl2Jygzk9eKftX0FQ23+oi/3F/lU9Jbswe7P//Z"

preload("/login-bg.jpg", { as: "image", fetchPriority: "high" })

export default function LoginPage() {
  const router = useRouter()
  const [now, setNow] = useState(() => new Date())
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [bgLoaded, setBgLoaded] = useState(false)
  const hydrated = useSessionHydrated()
  const isLoggedIn = useSessionStore((state) => state.isLoggedIn)
  const setSession = useSessionStore((state) => state.setSession)
  const loginMutation = useLogin()

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (hydrated && isLoggedIn) {
      router.replace("/")
    }
  }, [hydrated, isLoggedIn, router])

  async function handleSubmit(formData: FormData) {
    const pin = String(formData.get("password") ?? "")
    try {
      const { cashier } = await loginMutation.mutateAsync(pin)
      setSession(cashier)
      router.push("/")
    } catch (err) {
      setPassword("")
      setErrorMessage(
        err instanceof ApiError && err.kind === "network"
          ? "Tidak dapat menghubungi server kasir."
          : "Kata sandi salah. Coba lagi."
      )
    }
  }

  return (
    <div className="flex h-svh bg-shell">
      <div className="relative min-w-0 flex-[1.35] overflow-hidden">
        <div
          className="absolute inset-0 scale-110 bg-shell bg-cover bg-center blur-xl"
          style={{ backgroundImage: `url(${LOGIN_BG_BLUR_DATA_URL})` }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed static asset, not an optimized/responsive image */}
        <img
          src="/login-bg.jpg"
          alt=""
          fetchPriority="high"
          decoding="async"
          ref={(node) => {
            if (node?.complete) setBgLoaded(true)
          }}
          onLoad={() => setBgLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            bgLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
        <div className="absolute inset-0 bg-shell/35" />
        <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-linear-to-b from-shell/55 to-transparent px-7.5 py-6.5">
          <div className="size-7 rounded-sm bg-primary" />
          <span className="text-xl font-semibold text-shell-foreground">
            Toko Bu Isti
          </span>
        </div>
        <div className="absolute right-7.5 bottom-7.5 flex flex-col items-end gap-1.5">
          <span className="rounded-sm bg-shell/72 px-3 py-1.5 font-serif text-[22px] text-shell-foreground italic">
            Pasar Jrakah
          </span>
        </div>
      </div>
      <div className="flex w-115 flex-none flex-col bg-background px-12 py-8.5">
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
            Masukkan PIN membuka mesin kasir.
          </p>
          <form action={handleSubmit} className="contents">
            <Label htmlFor="password" className="mt-7.5 mb-2">
              PIN
            </Label>
            <input type="hidden" name="password" value={password} />
            <InputOTP
              id="password"
              maxLength={4}
              autoFocus
              value={password}
              onChange={(value) => {
                setPassword(value)
                setErrorMessage(null)
              }}
              disabled={loginMutation.isPending}
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
            {errorMessage && (
              <p className="mt-2 text-sm text-destructive">{errorMessage}</p>
            )}
            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="mt-3.5 h-auto w-full py-4 text-[15.5px] normal-case"
            >
              {loginMutation.isPending ? "Memeriksa…" : "Masuk"}
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
