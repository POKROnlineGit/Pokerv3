'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { transition } from '@/lib/motion.config'
import { Card } from '@/components/ui/card'
import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'

// Exclude conflicting props that React and Framer Motion handle differently
type MotionCardHTMLProps = Omit<HTMLMotionProps<'div'>, 'onDrag' | 'onDragStart' | 'onDragEnd'>

interface MotionCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onDrag' | 'onDragStart' | 'onDragEnd'> {
  motionProps?: MotionCardHTMLProps
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
        {...(props as MotionCardHTMLProps)}
        {...motionProps}
      >
        <Card className="border-0 bg-transparent shadow-none">
          {children}
        </Card>
      </motion.div>
    )
  }
)

MotionCard.displayName = 'MotionCard'

