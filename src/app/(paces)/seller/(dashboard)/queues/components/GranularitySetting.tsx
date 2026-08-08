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

type Props = { value: AppointmentGranularity }

export default function GranularitySetting({ value }: Props) {
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
  const [changed, setChanged] = useState(false)

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
      setChanged(true)
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

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">การรับนัด</h4>
        <p className="text-default-500 mt-0.5 text-sm">
          ตั้งว่าตอนคีย์ออเดอร์จะให้กรอกแค่วัน หรือกรอกเวลาด้วย —
          ค่านี้ใช้กับคิวงานทุกอันของร้าน และบันทึกทันทีที่เลือก
        </p>
      </div>
      <div className="card-body">
        <div className="max-w-md">
          <label htmlFor="appt-granularity" className="form-label">
            รับนัดแบบ
          </label>
          <select
            id="appt-granularity"
            className="form-select"
            value={current}
            disabled={saving}
            onChange={(e) => change(e.target.value as AppointmentGranularity)}
          >
            {(
              Object.entries(APPOINTMENT_GRANULARITY_LABEL) as [
                AppointmentGranularity,
                string,
              ][]
            ).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <p className="text-default-500 mt-1 text-sm">
            {current === 'DAY'
              ? 'ลูกค้าจองเป็นวัน เช่น ขับรถเข้ามาวันที่ 5 ส.ค. — ตอนคีย์ออเดอร์จะไม่ถามเวลา'
              : 'ระบุช่วงเวลาได้ เช่น วันเดียวกันรับ 09:00–12:00 แล้วรับอีกคัน 13:00–14:00'}
          </p>
          <p className="text-default-500 mt-1 text-sm">
            เปลี่ยนได้ตลอด นัดที่บันทึกไว้แล้วไม่เปลี่ยนตาม
          </p>
          {/* ค้างอยู่จนกว่าจะออกจากหน้า ต่างจาก toast ที่หายไปก่อนผู้ใช้เลื่อนลงไปเจอปุ่มยกเลิก
              text-success-ink: ข้อความยืนยันว่าบันทึกสำเร็จจริง (Verified-Means-Green) */}
          {/* ข้อความเดิมอ้าง "ฟอร์มคิวงานด้านล่าง" ซึ่งใช้ได้ตอนการ์ดนี้ยังฝังอยู่ในฟอร์มคิวงาน
              — ย้ายมาอยู่ท้ายหน้า /queues แล้ว (2026-08-08) ไม่มีฟอร์มไหนอยู่ด้านล่างอีก
              ป้ายที่ชี้ไปยังของที่ไม่มีอยู่ ทำให้ผู้ใช้กวาดตาหาสิ่งที่ระบบบอกว่ามี */}
          {changed && (
            <p className="text-success-ink mt-1 text-sm">
              บันทึกแล้ว — มีผลกับออเดอร์ที่คีย์ใหม่ นัดที่บันทึกไว้แล้วไม่เปลี่ยน
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
