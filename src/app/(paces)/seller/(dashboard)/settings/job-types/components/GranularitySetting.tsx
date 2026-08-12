'use client'

/**
 * GranularitySetting — เลือกหน่วยเวลาของการนัดระดับร้าน (feature 00024, FR-RSV-13)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/components/RoomForm.tsx
 *   — .card > .card-header + .card-body > form-select (field group เดียวกัน)
 *     chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/settings/page.tsx
 *
 * วางบนหน้าคิวงานแทนที่จะแยกหน้าตั้งค่า เพราะเป็นค่าที่ร้านตั้งครั้งเดียวตอนเริ่มใช้
 * และตั้งที่เดียวกับที่กำลังตั้งคิวงานอยู่ ทำให้เห็นผลของมันทันที
 *
 * IMPORTANT: เปลี่ยนค่านี้ไม่แตะนัดที่บันทึกไว้แล้ว (BR-RSV-55) — copy ต้องบอกให้ชัด
 * ไม่งั้นเจ้าของร้านจะไม่กล้าเปลี่ยน เพราะกลัวนัดเก่าเพี้ยน
 */

import { useState } from 'react'
import { pacesToast } from '@/lib/paces-toast'
import {
  APPOINTMENT_GRANULARITY_LABEL,
  type AppointmentGranularity,
} from '@/lib/appointments'

type Props = {
  value: AppointmentGranularity
  /** true = ไม่ห่อ `.card` ของตัวเอง (ถูกควบเข้าเป็นท้ายการ์ด "คิวงานที่รับได้") */
  embedded?: boolean
}

export default function GranularitySetting({ value, embedded = false }: Props) {
  const [current, setCurrent] = useState<AppointmentGranularity>(value)
  const [saving, setSaving] = useState(false)
  /**
   * เปลี่ยนค่าไปแล้วอย่างน้อยหนึ่งครั้งในหน้านี้ — ใช้ขึ้นบรรทัดยืนยันค้างไว้
   *
   * การ์ดนี้ถูกวางอยู่ใน ResourceForm ซึ่งมีปุ่ม "บันทึก/ยกเลิก" ของตัวเองอยู่ด้านล่าง แต่ค่านี้
   * ยิงคนละ endpoint และบันทึกทันที — กด "ยกเลิก" แล้วมันไม่ย้อน (หนี้ 00024 ข้อ 4)
   * เดิมกันด้วย "ตำแหน่งการวาง" อย่างเดียว (วางบนสุดให้ห่างจากปุ่ม) ซึ่งกันได้แค่คนที่อ่านลำดับ
   * ส่วน toast ที่เด้งแล้วหายไม่เหลือหลักฐานตอนที่ผู้ใช้เลื่อนลงไปกดยกเลิก — บรรทัดนี้ค้างอยู่
   */

  async function change(next: AppointmentGranularity) {
    const prev = current
    setCurrent(next)
    setSaving(true)
    try {
      const res = await fetch('/api/shops/current/appointment-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentGranularity: next }),
        cache: 'no-store',
      })
      if (!res.ok) {
        setCurrent(prev)
        pacesToast.error('บันทึกไม่สำเร็จ ลองเลือกอีกครั้ง')
        return
      }
      pacesToast.success(
        next === 'DAY' ? 'เปลี่ยนเป็นรับนัดรายวันแล้ว' : 'เปลี่ยนเป็นระบุช่วงเวลาแล้ว',
      )
    } catch {
      setCurrent(prev)
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  /**
   * โหมด embedded (2026-08-11) — การ์ดนี้ถูกควบเข้าไปเป็น "ท้ายการ์ดคิวงาน" ไม่ใช่การ์ดของตัวเอง
   *
   * เหตุผล: บนมือถือหน้านี้เคยมี **การ์ดน้ำหนักเท่ากัน 3 ใบเรียงกัน** (ปฏิทิน / คิวงาน / การรับนัด)
   * ทั้งที่ใบแรกเป็นงานประจำวัน ส่วนสองใบหลังเป็นของที่ตั้งครั้งเดียวตอนเริ่มใช้ — นั่นคือสิ่งที่
   * user อ่านว่า "padding เยอะ" (ไม่ใช่ค่า padding ผิด แต่ไม่มีลำดับชั้น)
   * ยังอยู่หน้าเดิมตามเดิม ไม่ย้ายไปซ่อนที่อื่น (บทเรียน 2026-08-08: ย้ายไปฝังในฟอร์มคิวงาน
   * แล้วร้านหาไม่เจอจนสรุปว่า "ระบบระบุเวลานัดไม่ได้")
   */
  const body = (
    <div className="max-w-md">
      <label htmlFor="appt-granularity" className="form-label">
        การรับนัด
      </label>
      <select
        id="appt-granularity"
        className="form-select"
        value={current}
        disabled={saving}
        onChange={(e) => change(e.target.value as AppointmentGranularity)}
      >
        {(
          Object.entries(APPOINTMENT_GRANULARITY_LABEL) as [AppointmentGranularity, string][]
        ).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      {/* เหลือบรรทัดเดียว — ของเดิมมี 3 บรรทัด: คำอธิบายราย mode (เป็น onboarding copy ที่อ่าน
          ครั้งเดียวแล้วไม่ต้องอ่านอีก), guardrail, และบรรทัดยืนยัน "บันทึกแล้ว" ที่ค้างอยู่
          เก็บเฉพาะ guardrail ซึ่งเป็นข้อเดียวที่ผู้ใช้ต้องรู้ทุกครั้งก่อนกดเปลี่ยน

          บรรทัด "บันทึกแล้ว" ถูกตัด: เหตุผลเดิมของมันคือ "toast หายก่อนผู้ใช้เลื่อนลงไปเจอ
          ปุ่มยกเลิกของฟอร์ม" ซึ่งไม่จริงอีกแล้วตั้งแต่ย้ายออกจาก ResourceForm มาอยู่หน้านี้
          (2026-08-08) — ไม่มีฟอร์ม ไม่มีปุ่มยกเลิก การยืนยันด้วย pacesToast ก็พอ */}
      <p className="text-default-500 mt-1 text-sm">เปลี่ยนได้ตลอด ไม่กระทบนัดที่บันทึกไว้แล้ว</p>
    </div>
  )

  if (embedded) return <div className="p-4">{body}</div>

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">การรับนัด</h4>
      </div>
      <div className="card-body">{body}</div>
    </div>
  )
}
