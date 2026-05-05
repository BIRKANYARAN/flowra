'use client'
// FlowraButton — adapter that maps legacy Btn props to the new CVA Btn.
// Drop-in replacement for any <Btn> call site.

import { forwardRef, type ReactNode } from 'react'
import { Btn } from '@/components/ui'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size    = 'sm' | 'md' | 'lg'

interface FlowraButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Design-system variant */
  variant?: Variant
  /** Size alias */
  size?: Size
  /** Legacy: maps to size="sm" */
  small?: boolean
  /** Full-width block button */
  fullWidth?: boolean
  /** Icon slot left of label */
  leftIcon?: ReactNode
  /** Icon slot right of label */
  rightIcon?: ReactNode
  /** Loading state — shows spinner, disables button */
  loading?: boolean
}

export const FlowraButton = forwardRef<HTMLButtonElement, FlowraButtonProps>(
  ({ loading, children, disabled, leftIcon, rightIcon, ...rest }, ref) => {
    const spinner = (
      <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
    )
    return (
      <Btn
        ref={ref}
        disabled={disabled || loading}
        leftIcon={loading ? spinner : leftIcon}
        rightIcon={rightIcon}
        {...rest}
      >
        {children}
      </Btn>
    )
  }
)
FlowraButton.displayName = 'FlowraButton'
