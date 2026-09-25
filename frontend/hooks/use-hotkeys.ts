"use client"

import { useEffect } from "react"

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

type HotkeyHandlers = {
  onPay?: () => void
  onNextSale?: () => void
  disabled?: boolean
}

export function useHotkeys({ onPay, onNextSale, disabled }: HotkeyHandlers) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (disabled || event.defaultPrevented || event.repeat) return

      const isHotkey = event.key === "F3" || event.key === "F9"

      // Function keys are unambiguous shortcuts, so they should fire even
      // while a text field (e.g. the scan input) is focused.
      if (!isHotkey && isTypingTarget(event.target)) return

      if (event.key === "F3") {
        event.preventDefault()
        onNextSale?.()
      } else if (event.key === "F9") {
        event.preventDefault()
        onPay?.()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onPay, onNextSale, disabled])
}
