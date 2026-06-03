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

function toNum(str: string): number {
  // Accept both comma and dot as decimal separator
  return parseFloat(str.replace(',', '.'))
}

export function PriceInput({ value, onChange, placeholder, className, disabled }: PriceInputProps) {
  const [display, setDisplay] = useState(value === 0 ? '' : String(value))

  // Sync when value changes externally (e.g. preset applied)
  useEffect(() => {
    setDisplay(value === 0 ? '' : String(value))
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    // Allow digits + one decimal separator (comma OR dot) + leading separator
    if (!/^[0-9]*[,.]?[0-9]*$/.test(raw) && raw !== '') return
    setDisplay(raw)
    const num = toNum(raw)
    if (!isNaN(num)) onChange(num)
    else if (raw === '' || raw === ',' || raw === '.') onChange(0)
  }

  function handleBlur() {
    // Normalise display on blur: ",5" or ".5" → "0.5", "5," or "5." → "5"
    const withDot = display.replace(',', '.')
    if (withDot.startsWith('.')) {
      const normalised = '0' + withDot
      setDisplay(normalised)
      onChange(parseFloat(normalised))
    } else if (withDot.endsWith('.')) {
      const normalised = withDot.slice(0, -1)
      setDisplay(normalised)
      onChange(parseFloat(normalised) || 0)
    } else if (display.includes(',')) {
      // Replace comma with dot in display after editing
      setDisplay(withDot)
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
