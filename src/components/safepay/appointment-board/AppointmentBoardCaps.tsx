'use client'

/**
 * AppointmentBoardCaps — สิทธิ์ของผู้ดูตารางงาน ที่การ์ด/ชีต/ปฏิทินในกลุ่มนี้ต้องรู้ (00071 P3 · S-15)
 *
 * ทำไมเป็น context ไม่ใช่ prop: เส้นทางเดียวกันลึก 4-5 ชั้น (MonthBoard → DaySheet → DayList → DayCard) และมีปุ่มที่ต้องซ่อน
 * 4 จุดกระจายคนละชั้น การไล่ prop คือจุดที่ "ลืมส่งแล้วปุ่ม/ยอดโผล่" เกิดง่าย — แบบเดียวกับ OrderViewerRoles ของหน้ารายการ
 * ค่าตั้งต้นทุกตัว = false (ปิดเป็นค่าตั้งต้น — permission-gate-follows-the-row) ผู้ใช้จริงต้องหุ้มด้วย Provider
 * และ AppointmentDayRows (ใช้ในชีตเลือกวันของฟอร์มสร้างออเดอร์) ไม่อ่านค่านี้เลย
 *
 * ตัวบังคับจริงอยู่ที่ route (appointments/day ตัดยอดตามระดับเงิน · เลื่อนนัด O3 · สร้าง O2s) — ที่นี่แค่ไม่ให้ปุ่มโผล่แล้วกดแล้ว 403
 */
import { createContext, useContext, type ReactNode } from 'react'

export type AppointmentBoardCaps = {
  /** เห็นยอด/มัดจำบนการ์ดนัด (ระดับเงินไม่ใช่ NONE) */
  showMoney: boolean
  /** ปุ่มทักแชท (H1) */
  canChat: boolean
  /** เลื่อนนัด (O3) */
  canReschedule: boolean
  /** ปุ่มสร้างงานของวันที่เลือก (O2s) */
  canCreate: boolean
}

const CLOSED: AppointmentBoardCaps = { showMoney: false, canChat: false, canReschedule: false, canCreate: false }

const Ctx = createContext<AppointmentBoardCaps>(CLOSED)

export function AppointmentBoardCapsProvider({ value, children }: { value: AppointmentBoardCaps; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppointmentBoardCaps(): AppointmentBoardCaps {
  return useContext(Ctx)
}
