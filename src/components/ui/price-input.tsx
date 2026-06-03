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
    // Normalise comma → dot (European mobile keyboards)
    const normalised = raw.replace(',', '.')
    // Allow digits, one dot, and leading dot
    if (!/^[0-9]*\.?[0-9]*$/.test(normalised) && normalised !== '') return
    setDisplay(normalised)
    const num = parseFloat(normalised)
    if (!isNaN(num)) onChange(num)
    else if (normalised === '' || normalised === '.') onChange(0)
  }

  function handleBlur() {
    // Normalise: ".5" → "0.5", "5." → "5"
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
