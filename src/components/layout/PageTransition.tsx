'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { pageTransitionVariants } from '@/lib/animations'

interface PageTransitionProps {
  children: React.ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()
  const [displayLocation, setDisplayLocation] = React.useState(pathname)

  React.useEffect(() => {
    if (pathname !== displayLocation) {
      setDisplayLocation(pathname)
    }
  }, [pathname, displayLocation])

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={displayLocation}
        variants={pageTransitionVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

