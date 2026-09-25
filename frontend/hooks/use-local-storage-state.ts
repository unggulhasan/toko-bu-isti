"use client"

import { useEffect, useState } from "react"

export function useLocalStorageState<T>(
  key: string,
  initial: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // localStorage unavailable (private mode, quota, etc.) — state stays in-memory only
    }
  }, [key, state])

  return [state, setState]
}
