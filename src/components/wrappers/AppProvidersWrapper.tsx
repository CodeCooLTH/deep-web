'use client'

import { SessionProvider } from 'next-auth/react'
import React, { useEffect } from 'react'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

import { LayoutProvider } from '@/context/useLayoutContext'
import { preline } from '@/utils/preline'

const AppProvidersWrapper = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    preline.init()
  }, [])

  return (
    <SessionProvider>
      <LayoutProvider>{children}</LayoutProvider>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar
        newestOnTop
        closeOnClick
        pauseOnHover
        theme="light"
        toastClassName="!bg-card !text-default-700 !rounded-lg !shadow !border !border-default-200 !font-normal"
        className="!text-sm"
      />
    </SessionProvider>
  )
}

export default AppProvidersWrapper
