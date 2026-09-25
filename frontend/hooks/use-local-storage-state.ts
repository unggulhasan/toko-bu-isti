"use client"

import { useEffect, useRef, useState } from "react"

export function useLocalStorageState<T>(
  key: string,
  initial: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // Always start from `initial` so the server-rendered markup and the
  // client's first render match; the persisted value (if any) is applied
  // right after mount, once hydration has already reconciled.
  const [state, setState] = useState<T>(initial)
  const hydrated = useRef(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) setState(JSON.parse(raw) as T)
    } catch {
      // corrupt/unavailable localStorage — keep the initial seed
    } finally {
      hydrated.current = true
    }
    // Only run once, on mount, to read the persisted value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // localStorage unavailable (private mode, quota, etc.) — state stays in-memory only
    }
  }, [key, state])

  return [state, setState]
}
