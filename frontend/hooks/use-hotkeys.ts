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
  onHold?: () => void
  onPay?: () => void
  onNextSale?: () => void
  onJumpToSale?: (index: number) => void
  disabled?: boolean
}

export function useHotkeys({
  onHold,
  onPay,
  onNextSale,
  onJumpToSale,
  disabled,
}: HotkeyHandlers) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (disabled || event.defaultPrevented || event.repeat) return
      if (isTypingTarget(event.target)) return

      if (event.ctrlKey && /^[1-9]$/.test(event.key)) {
        event.preventDefault()
        onJumpToSale?.(Number(event.key) - 1)
        return
      }

      if (event.key === "F3") {
        event.preventDefault()
        onNextSale?.()
      } else if (event.key === "F7") {
        event.preventDefault()
        onHold?.()
      } else if (event.key === "F9") {
        event.preventDefault()
        onPay?.()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onHold, onPay, onNextSale, onJumpToSale, disabled])
}
