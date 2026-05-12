'use client'
// FlowraSelect — design-system styled <select> wrapper.
// Maps the old IL/LAB inline-style pattern to consistent tokens.

import { forwardRef, SelectHTMLAttributes, ReactNode } from 'react'
import { DSSelect } from '@/components/ui'

interface FlowraSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  /** Extra wrapper classes */
  wrapperClassName?: string
  children: ReactNode
}

export const FlowraSelect = forwardRef<HTMLSelectElement, FlowraSelectProps>(
  ({ label, error, wrapperClassName, children, ...rest }, ref) => (
    <DSSelect
      ref={ref}
      label={label}
      error={error}
      className={wrapperClassName}
      {...rest}
    >
      {children}
    </DSSelect>
  )
)
FlowraSelect.displayName = 'FlowraSelect'
