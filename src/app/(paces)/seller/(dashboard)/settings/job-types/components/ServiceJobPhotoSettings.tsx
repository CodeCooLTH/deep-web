'use client'

/**
 * ServiceJobPhotoSettings — การ์ด "รูปก่อน-หลังงาน" ของร้านบริการ (feature 00086 P3-T10 · S-11 · FR-013 · prototype v13 `screenSettings`)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
 *   (.card > .card-header + .card-body · form-radio · form-switch · เส้นคั่น border-dashed)
 * Sibling: ./GranularitySetting.tsx (การ์ดตั้งค่าร้านในหน้าเดียวกัน · บันทึกทันที optimistic + ย้อนค่า + pacesToast)
 *   radio card จาก settings/ShippingSettingsRow.tsx (โหมดสร้างพัสดุ) · แถวสวิตช์จาก auto-notify/components/AutoNotifyRow.tsx
 *
 * ตัวตัดสินทั้งหมด (สวิตช์ปิด/กดได้ · ค่าหลังเลือก · ข้อความ) อยู่ที่ lib/service-job-photo-settings — ไฟล์นี้แค่วาดตาม
 * server บังคับ NONE ⇒ buyerVisible=false ซ้ำอยู่แล้ว (updateServiceJobPhotoSettings) ค่าที่จอแสดงหลังบันทึกเอามาจาก response
 */

import { useState } from 'react'
import { pacesToast } from '@/lib/paces-toast'
import { SERVICE_JOB_PHOTO_MODES, type ServiceJobPhotoMode } from '@/lib/service-job'
import {
  SERVICE_JOB_PHOTO_MODE_COPY,
  initialServiceJobPhotoSettings,
  modeChangedToast,
  photoVisibilityHints,
  photoVisibilitySwitch,
  settingsAfterModeChange,
  visibilityChangedToast,
  type ServiceJobPhotoSettings as Settings,
} from '@/lib/service-job-photo-settings'

type Props = {
  /** Shop.serviceJobPhotoMode */
  mode: string
  /** Shop.serviceJobPhotosBuyerVisible */
  buyerVisible: boolean
}

export default function ServiceJobPhotoSettings({ mode, buyerVisible }: Props) {
  const [current, setCurrent] = useState<Settings>(() => initialServiceJobPhotoSettings(mode, buyerVisible))
  const [saving, setSaving] = useState(false)

  async function save(next: Settings, body: { mode?: ServiceJobPhotoMode; buyerVisible?: boolean }, okMessage: string) {
    const prev = current
    setCurrent(next)
    setSaving(true)
    try {
      const res = await fetch('/api/shops/current/service-job-photo-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
      if (!res.ok) {
        setCurrent(prev)
        pacesToast.error('บันทึกไม่สำเร็จ ลองเลือกอีกครั้ง')
        return
      }
      const saved = (await res.json().catch(() => null)) as { mode?: string; buyerVisible?: boolean } | null
      if (saved) setCurrent(initialServiceJobPhotoSettings(saved.mode, saved.buyerVisible))
      pacesToast.success(okMessage)
    } catch {
      setCurrent(prev)
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  const onMode = (m: ServiceJobPhotoMode) => {
    if (m === current.mode) return
    save(settingsAfterModeChange(current, m), { mode: m }, modeChangedToast(current, m))
  }

  const onVisible = (v: boolean) => {
    save({ ...current, buyerVisible: v }, { buyerVisible: v }, visibilityChangedToast(v))
  }

  const sw = photoVisibilitySwitch(current)
  const hints = photoVisibilityHints(current)

  return (
    <div className="card" aria-busy={saving || undefined}>
      <div className="card-header">
        <h4 className="card-title">รูปก่อน-หลังงาน</h4>
      </div>
      <div className="card-body">
        <p className="mb-3 text-sm text-default-700">ใช้ตอน &quot;เริ่มงาน&quot; และ &quot;ทำเสร็จแล้ว&quot; ของทุกงานในร้าน</p>

        <fieldset className="space-y-2" disabled={saving}>
          <legend className="sr-only">การใช้รูป</legend>
          {SERVICE_JOB_PHOTO_MODES.map((m) => {
            const copy = SERVICE_JOB_PHOTO_MODE_COPY[m]
            const active = current.mode === m
            return (
              <label
                key={m}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  active ? 'border-primary bg-primary/10' : 'border-default-200'
                }`}
              >
                <input
                  type="radio"
                  name="job-photo-mode"
                  // critique P1-9 — วงกลม (rounded-full!) แบบ radio group ของ Paces (AuctionTimeCard) · .form-radio ตั้งต้นเป็นมุมมน 4px = อ่านเป็น checkbox
                  className="form-radio mt-0.5 rounded-full!"
                  value={m}
                  checked={active}
                  onChange={() => onMode(m)}
                />
                <span className="min-w-0">
                  {/* critique P1-11 — หัวข้อหนักกว่าคำอธิบายให้ชัด (เดิม font-medium ใกล้กับคำอธิบายจนลำดับกลับ) */}
                  <span className="block text-sm font-semibold text-dark">{copy.title}</span>
                  <span className="mt-0.5 block text-xs font-normal text-default-700">{copy.hint}</span>
                </span>
              </label>
            )
          })}
        </fieldset>

        <div className="mt-4 flex items-start justify-between gap-3 border-t border-dashed border-default-200 pt-4">
          <div className="min-w-0">
            <label htmlFor="job-photo-buyer-visible" className="block text-sm font-medium text-default-800">
              ลูกค้าเห็นรูปและบันทึก
            </label>
            <div id="job-photo-buyer-visible-hint">
              {hints.map((h) => (
                <p key={h} className="mt-0.5 text-xs font-normal text-default-700">
                  {h}
                </p>
              ))}
            </div>
          </div>
          <input
            id="job-photo-buyer-visible"
            type="checkbox"
            className="form-switch mt-0.5 shrink-0"
            checked={sw.checked}
            disabled={sw.disabled || saving}
            aria-describedby="job-photo-buyer-visible-hint"
            onChange={(e) => onVisible(e.target.checked)}
          />
        </div>
      </div>
    </div>
  )
}
