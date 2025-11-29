'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { springTransition } from '@/lib/motion.config'
import { forwardRef } from 'react'

interface ActionModalMotionProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode
}

export const ActionModalMotion = forwardRef<HTMLDivElement, ActionModalMotionProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={springTransition}
        className={`fixed inset-x-0 bottom-0 ${className || ''}`}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)

ActionModalMotion.displayName = 'ActionModalMotion'

