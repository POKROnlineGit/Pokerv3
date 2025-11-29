'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { transition } from '@/lib/motion.config'
import { Card, type CardProps } from '@/components/ui/card'
import { forwardRef } from 'react'

interface MotionCardProps extends CardProps {
  motionProps?: HTMLMotionProps<'div'>
  hover?: boolean
}

export const MotionCard = forwardRef<HTMLDivElement, MotionCardProps>(
  ({ motionProps, hover = true, children, className, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        whileHover={hover ? { y: -8, scale: 1.03 } : undefined}
        transition={transition}
        className={className}
        {...motionProps}
      >
        <Card {...props}>
          {children}
        </Card>
      </motion.div>
    )
  }
)

MotionCard.displayName = 'MotionCard'

