import type { Metadata } from 'next'
import { Suspense } from 'react'
import NavigationLoader from './NavigationLoader'

export const metadata: Metadata = {
  title: { default: 'ผู้ขาย', template: '%s | Deep ผู้ขาย' },
}

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  // NavigationLoader = global preloading overlay ตอนเปลี่ยนหน้า; Suspense เพราะภายในใช้ useSearchParams
  return (
    <>
      <Suspense fallback={null}>
        <NavigationLoader />
      </Suspense>
      {children}
    </>
  )
}
