'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { forwardRef } from 'react'

interface ChipMotionProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode
}

export const ChipMotion = forwardRef<HTMLDivElement, ChipMotionProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ scale: 0, y: 100 }}
        animate={{ scale: 1, y: 0 }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 20,
        }}
        className={className}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)

ChipMotion.displayName = 'ChipMotion'

