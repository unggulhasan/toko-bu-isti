"use client"

import { useEffect } from "react"

import { heartbeat } from "@/lib/api/auth"
import { useSessionStore } from "@/lib/store/session-store"

const HEARTBEAT_INTERVAL_MS = 30 * 1000

/**
 * Keeps this register's hold on its PIN alive: the server lets another login
 * take a PIN over once its holder has not pinged for a couple of minutes. Also
 * notices promptly if that already happened -- lib/api/client.ts ends the
 * session on SESSION_INVALID, so a replaced register is sent back to /login
 * within one interval even while idle.
 *
 * Mount only inside the authenticated (pos) subtree; no-ops when logged out.
 * Network errors are ignored: a missed ping just means the next one tries again.
 */
export function useSessionHeartbeat() {
  const isLoggedIn = useSessionStore((s) => s.isLoggedIn)

  useEffect(() => {
    if (!isLoggedIn) return

    function ping() {
      heartbeat().catch(() => {})
    }

    ping()
    const intervalId = setInterval(ping, HEARTBEAT_INTERVAL_MS)
    // Browsers throttle timers in background tabs; ping as soon as it's back.
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") ping()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isLoggedIn])
}
