'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { forwardRef } from 'react'

interface PageTransitionProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode
}

export const PageTransition = forwardRef<HTMLDivElement, PageTransitionProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className={className}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)

PageTransition.displayName = 'PageTransition'

