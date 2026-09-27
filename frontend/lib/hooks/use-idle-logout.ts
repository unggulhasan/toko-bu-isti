"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"

import { useSessionStore } from "@/lib/store/session-store"

const IDLE_TIMEOUT_MS = 45 * 60 * 1000 // 45 minutes

// Direct-input events only -- mousemove/passive scroll are deliberately
// excluded so a resting cursor or an idle animation doesn't count as "the
// cashier is here." Regaining tab focus also resets the timer (see below).
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const

/**
 * Logs the cashier out after IDLE_TIMEOUT_MS with no direct input or tab
 * refocus. Mount only inside the authenticated (pos) subtree -- see
 * app/(pos)/layout.tsx, which calls this before its hydrated/isLoggedIn
 * guard's early return; this hook no-ops internally when not logged in.
 *
 * Single-tab assumption: this app runs on one client PC per shop (see
 * CLAUDE.md). Multiple open tabs each run their own idle timer
 * independently and are not coordinated.
 */
export function useIdleLogout() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isLoggedIn, logout } = useSessionStore()

  useEffect(() => {
    if (!isLoggedIn) return

    let timeoutId: ReturnType<typeof setTimeout>

    function handleIdle() {
      logout()
      // Otherwise the next cashier's first paint shows this cashier's
      // cached open sales and transactions (mirrors app-shell.tsx logout).
      queryClient.clear()
      router.replace("/login")
    }

    function resetTimer() {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(handleIdle, IDLE_TIMEOUT_MS)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        resetTimer()
      }
    }

    resetTimer()
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true })
    }
    window.addEventListener("focus", resetTimer)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearTimeout(timeoutId)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer)
      }
      window.removeEventListener("focus", resetTimer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isLoggedIn, logout, queryClient, router])
}
