import type { Metadata } from 'next'
import { Suspense } from 'react'

import OAuthErrorToast from './OAuthErrorToast'
import SignInCard from './SignInCard'

export const metadata: Metadata = { title: 'เข้าสู่ระบบ' }

export default function SignInPage() {
  return (
    <>
      <Suspense fallback={null}>
        <OAuthErrorToast />
      </Suspense>
      <Suspense fallback={null}>
        <SignInCard />
      </Suspense>
    </>
  )
}
