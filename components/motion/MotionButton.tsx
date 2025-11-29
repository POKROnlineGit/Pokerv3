'use client'

import { motion, HTMLMotionProps } from 'framer-motion'
import { fastTransition } from '@/lib/motion.config'
import { buttonVariants, type ButtonProps } from '@/components/ui/button'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

// Exclude conflicting props that React and Framer Motion handle differently
type MotionButtonHTMLProps = Omit<HTMLMotionProps<'button'>, 'onDrag' | 'onDragStart' | 'onDragEnd'>

interface MotionButtonProps extends Omit<ButtonProps, 'onDrag' | 'onDragStart' | 'onDragEnd'> {
  motionProps?: MotionButtonHTMLProps
}

export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(
  ({ motionProps, children, className, variant, size, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.95 }}
        transition={fastTransition}
        className={cn(buttonVariants({ variant, size }), className)}
        {...(props as MotionButtonHTMLProps)}
        {...motionProps}
      >
        {children}
      </motion.button>
    )
  }
)

MotionButton.displayName = 'MotionButton'

