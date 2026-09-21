'use client'

// Base: src/app/(paces)/seller/(dashboard)/not-found.tsx (โครงการ์ดเดียวกัน — ตัดรูปพื้นหลังออก
// เพราะหน้านี้ต้องเบาที่สุด ตอนแสดงแปลว่ามีบางอย่างพังอยู่แล้ว)
//
// แทนจอขาว "Application error: a client-side exception has occurred" ของ Next (ลูกค้าเจอบน prod
// 2026-09-21 แล้วไม่มีทางไปต่อ) — จับ error ของทุกหน้าใต้ (paces) ยกเว้นตัว (paces)/layout.tsx
// เอง (อันนั้นตกไป src/app/global-error.tsx)

import { useEffect } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { reportClientError } from '@/lib/report-client-error'

export default function PacesError({ error }: { error: Error & { digest?: string } }) {
  const t = useT()

  useEffect(() => {
    reportClientError(error, 'paces')
  }, [error])

  // "ลองใหม่" = โหลดทั้งหน้าใหม่ ไม่ใช่ reset() ของ Next — ต้นเหตุที่พบบ่อยคือไฟล์ JS ของ
  // deploy รุ่นก่อน (แอปเปิดค้างข้ามคืน) ซึ่ง reset() render ซ้ำด้วยโค้ดเดิมแล้วพังซ้ำ
  const reload = () => window.location.reload()
  // "กลับ" = หน้าก่อนหน้าถ้ามี ไม่งั้นหน้าแรกของ subdomain (proxy.ts พา / ไปหน้าหลักของ seller/admin)
  const goBack = () => (window.history.length > 1 ? window.history.back() : window.location.assign('/'))

  return (
    <div className="flex min-h-screen items-center">
      <div className="container">
        <div className="flex justify-center p-5">
          <div className="2xl:w-4/10 md:w-1/2 sm:w-2/3 w-full">
            <div className="card rounded-2xl">
              <div className="card-body p-7.5 text-center">
                <Icon icon="alert-triangle" className="text-danger mx-auto size-12" aria-hidden="true" />
                {/* role=alert: ทั้งหน้าถูกแทนที่โดยไม่มีสัญญาณ ผู้ใช้ screen reader ต้องรู้ว่าเกิดอะไรขึ้น */}
                <div role="alert" aria-live="polite">
                  <h3 className="mt-4 mb-2 text-xl font-bold">{t.errorPage.title}</h3>
                  <p className="text-default-500 mx-auto">{t.errorPage.description}</p>
                </div>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={goBack} className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50">
                    <Icon icon="arrow-left" className="size-4" aria-hidden="true" />
                    {t.common.back}
                  </button>
                  <button type="button" onClick={reload} className="btn bg-primary text-white hover:bg-primary-hover">
                    <Icon icon="refresh" className="size-4" aria-hidden="true" />
                    {t.common.retry}
                  </button>
                </div>
                {error.digest && <p className="text-default-400 mt-6 text-xs">ref: {error.digest}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
