'use client'

import { SessionProvider } from 'next-auth/react'
import React, { useEffect } from 'react'

import PacesToastContainer from '@/components/paces/PacesToastContainer'
import { LayoutProvider } from '@/context/useLayoutContext'
import { preline } from '@/utils/preline'

const AppProvidersWrapper = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    preline.init()
  }, [])

  return (
    <SessionProvider>
      <LayoutProvider>{children}</LayoutProvider>
      <PacesToastContainer />
    </SessionProvider>
  )
}

export default AppProvidersWrapper
