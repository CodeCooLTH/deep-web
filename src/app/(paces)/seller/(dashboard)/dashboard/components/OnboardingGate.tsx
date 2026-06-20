'use client'

/**
 * OnboardingGate — client wrapper ผูก ChecklistSidebar + OnboardingModal เข้าด้วยกัน
 * (feature 00001). Dashboard page เป็น server component จึง mount gate นี้เพื่อคุม state.
 *
 * - ChecklistSidebar: แสดงเสมอเมื่อ onboarding ยังไม่ครบ (ซ่อนเองเมื่อ isComplete)
 * - OnboardingModal: เปิดเมื่อ (ก) auto ครั้งแรกต่อ device (FR-LO-06; flag กันเปิดซ้ำ — SDS TD-002)
 *   เฉพาะถ้า checklist ยังไม่ครบ, หรือ (ข) กด item ใน ChecklistSidebar (deep-link step)
 * - หลัง modal ปิด → bump refreshKey เพื่อให้ ChecklistSidebar refetch
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import OnboardingModal, { type ModalStep } from './OnboardingModal'
import ChecklistSidebar from './ChecklistSidebar'

const SHOWN_FLAG = 'onboarding_modal_shown_v1'

export default function OnboardingGate({ facebookPrefill }: { facebookPrefill?: boolean }) {
  const [open, setOpen] = useState(false)
  const [initialStep, setInitialStep] = useState<ModalStep>('sales_channels')
  const [refreshKey, setRefreshKey] = useState(0)
  // ranRef กัน effect รันซ้ำ (React StrictMode dev double-invoke) — ถ้าใช้ cancelled flag
  // mount แรกจะ set flag + fetch แต่ cleanup ตั้ง cancelled=true, mount สองเห็น flag แล้ว bail
  // → fetch ไม่เคยเปิด modal. ใช้ ranRef + ไม่ cancel เพื่อให้เปิดได้จริง (component คงอยู่บน dashboard)
  const ranRef = useRef(false)

  // auto-open ครั้งแรกต่อ device — เปิดเฉพาะ seller ที่ยังตั้งค่าไม่ครบ
  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    try {
      if (localStorage.getItem(SHOWN_FLAG)) return
      localStorage.setItem(SHOWN_FLAG, '1')
    } catch {
      return // private mode — ข้าม auto-open
    }
    fetch('/api/account/onboarding-checklist')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { isComplete?: boolean } | null) => {
        if (d && d.isComplete === false) {
          setInitialStep('sales_channels')
          setOpen(true)
        }
      })
      .catch(() => {})
  }, [])

  const openAt = useCallback((s: ModalStep) => {
    setInitialStep(s)
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <>
      <ChecklistSidebar onOpenModal={openAt} refreshKey={refreshKey} />
      <OnboardingModal open={open} initialStep={initialStep} facebookPrefill={facebookPrefill} onClose={close} />
    </>
  )
}
