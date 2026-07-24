'use client'

import { useState, useEffect } from 'react'
import { Input } from './input'
import { cn } from '@/lib/utils'

interface QtyInputProps {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

// Whole-number input for quantities. A plain <input type="number" value={0}>
// shows a stubborn "0": typing appends to it ("024") and deleting it snaps
// straight back to 0. This keeps its own display string so 0 renders as an
// empty field with a "0" placeholder, and selects the contents on focus so you
// can always just type over what's there. Mirrors PriceInput's behaviour.
export function QtyInput({ value, onChange, placeholder, className, disabled }: QtyInputProps) {
  const [display, setDisplay] = useState(value === 0 ? '' : String(value))

  // Sync when the value changes externally (e.g. a template or preset is applied)
  useEffect(() => {
    setDisplay(value === 0 ? '' : String(value))
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    // Digits only — no separators, no negatives
    if (!/^[0-9]*$/.test(raw)) return
    setDisplay(raw)
    const num = parseInt(raw, 10)
    onChange(isNaN(num) ? 0 : num)
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={display}
      placeholder={placeholder ?? '0'}
      onChange={handleChange}
      onFocus={(e) => e.target.select()}
      disabled={disabled}
      className={cn(className)}
    />
  )
}
