'use client'
// FlowraInput — adapter that maps old IL/LAB pattern to the design-system Input.
// Forwards all native <input> props; adds label, prefix, suffix, error slots.

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { DSInput } from '@/components/ui'

interface FlowraInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'suffix'> {
  label?: string
  prefix?: ReactNode
  suffix?: ReactNode
  error?: string
  /** Extra wrapper classes */
  wrapperClassName?: string
}

export const FlowraInput = forwardRef<HTMLInputElement, FlowraInputProps>(
  ({ label, prefix, suffix, error, wrapperClassName, className, ...rest }, ref) => (
    <DSInput
      ref={ref}
      label={label}
      prefix={prefix}
      suffix={suffix}
      error={error}
      className={wrapperClassName}
      {...rest}
    />
  )
)
FlowraInput.displayName = 'FlowraInput'
