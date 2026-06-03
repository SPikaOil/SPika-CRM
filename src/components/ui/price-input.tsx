'use client'

import { useState, useEffect } from 'react'
import { Input } from './input'
import { cn } from '@/lib/utils'

interface PriceInputProps {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function PriceInput({ value, onChange, placeholder, className, disabled }: PriceInputProps) {
  const [display, setDisplay] = useState(value === 0 ? '' : String(value))

  // Sync when value changes externally (e.g. preset applied)
  useEffect(() => {
    setDisplay(value === 0 ? '' : String(value))
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    // Allow digits, one dot, and leading dot
    if (!/^[0-9]*\.?[0-9]*$/.test(raw) && raw !== '') return
    setDisplay(raw)
    // Commit valid number immediately so parent state stays in sync
    const num = parseFloat(raw)
    if (!isNaN(num)) onChange(num)
    else if (raw === '' || raw === '.') onChange(0)
  }

  function handleBlur() {
    // Normalise: ".5" → "0.5", "5." → "5", "" → ""
    if (display.startsWith('.')) {
      const normalised = '0' + display
      setDisplay(normalised)
      onChange(parseFloat(normalised))
    } else if (display.endsWith('.')) {
      const normalised = display.slice(0, -1)
      setDisplay(normalised)
      onChange(parseFloat(normalised) || 0)
    }
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder ?? '0.00'}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      className={cn('text-right', className)}
    />
  )
}
