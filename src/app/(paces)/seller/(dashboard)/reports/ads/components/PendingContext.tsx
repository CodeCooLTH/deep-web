'use client'

/**
 * PendingContext — ให้ตัวกรอง (AdReportFilters) บอกกริดว่า "กำลังคำนวณใหม่" (feature 00091 FR-009)
 * ทำไมต้องมี: ตัวกรองกับกริดเป็นพี่น้องกันใน page.tsx (server) — useTransition อยู่ในตัวกรอง กริดมองไม่เห็นถ้าไม่มีตัวกลาง
 */
import { createContext, useContext, useState } from 'react'

const Ctx = createContext<{ pending: boolean; setPending: (v: boolean) => void }>({ pending: false, setPending: () => {} })

export function AdReportPendingProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState(false)
  return <Ctx.Provider value={{ pending, setPending }}>{children}</Ctx.Provider>
}

export const useAdReportPending = () => useContext(Ctx)
