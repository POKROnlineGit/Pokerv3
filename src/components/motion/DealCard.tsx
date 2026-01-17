'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { transition } from '@/lib/config/motion.config'
import { forwardRef } from 'react'

interface DealCardProps extends HTMLMotionProps<'div'> {
  index?: number
  delay?: number
}

export const DealCard = forwardRef<HTMLDivElement, DealCardProps>(
  ({ index = 0, delay = 0, children, className, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ y: -80, rotate: -180, opacity: 0 }}
        animate={{ y: 0, rotate: 0, opacity: 1 }}
        transition={{
          ...transition,
          delay: delay + index * 0.1,
        }}
        layout
        className={className}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)

DealCard.displayName = 'DealCard'

