'use client'

import { motion } from 'framer-motion'
import { fastTransition } from '@/lib/motion.config'
import { buttonVariants, type ButtonProps } from '@/components/ui/button'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface MotionButtonProps extends ButtonProps {
  motionProps?: React.ComponentProps<typeof motion.button>
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
        {...props}
        {...motionProps}
      >
        {children}
      </motion.button>
    )
  }
)

MotionButton.displayName = 'MotionButton'

