'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { tweenTransition } from '@/lib/motion.config'
import { forwardRef } from 'react'

interface SidebarMotionProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode
}

export const SidebarMotion = forwardRef<HTMLDivElement, SidebarMotionProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ x: -300 }}
        animate={{ x: 0 }}
        exit={{ x: -300 }}
        transition={tweenTransition}
        className={className}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)

SidebarMotion.displayName = 'SidebarMotion'

