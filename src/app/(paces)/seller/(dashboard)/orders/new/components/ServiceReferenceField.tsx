'use client'

/**
 * ServiceReferenceField — ช่อง "ข้อมูลอ้างอิง" ในฟอร์มสร้าง/แก้ไขงาน (ร้านบริการเท่านั้น · 2026-10-04)
 *
 * Base: ช่อง "ชื่อลูกค้า" ใน CustomerQuickBlock / CustomerSelectBlock (label `.form-label` + `.form-input`)
 *   — user สั่ง "แบบชื่อลูกค้า แต่ไม่บังคับกรอก" ⇒ ไม่มีดาวแดง ไม่มีไอคอน ไม่มีคำอธิบายเพิ่ม
 *   ข้อความในช่องบอกว่าค้นหาได้ (แบบ A3-2 ที่ user เลือก — SSOT: SERVICE_REFERENCE_PLACEHOLDER)
 *
 * ผู้เรียกเป็นคนตัดสินว่าจะ render ไหม (acceptsServiceReference) — ด่านจริงอยู่ที่ service
 * (ร้านที่ไม่ใช่บริการส่งมาก็ไม่ถูกเก็บ)
 */
import { useController, type Control, type FieldErrors } from 'react-hook-form'
import {
  SERVICE_REFERENCE_LABEL,
  SERVICE_REFERENCE_MAX,
  SERVICE_REFERENCE_PLACEHOLDER,
} from '@/lib/service-reference'

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  /** id ของ input — มือถือ/เดสก์ท็อป render พร้อมกัน (CSS สลับ) จึงต้องไม่ซ้ำกัน */
  id: string
  className?: string
}

export default function ServiceReferenceField({ control, errors, id, className }: Props) {
  const {
    field: { ref, value, onChange, onBlur },
  } = useController({ control, name: 'serviceReference', defaultValue: '' })
  const message = errors.serviceReference?.message
  return (
    <div className={className}>
      <label htmlFor={id} className="form-label">
        {SERVICE_REFERENCE_LABEL}
      </label>
      <input
        id={id}
        name="serviceReference"
        ref={ref}
        type="text"
        autoComplete="off"
        maxLength={SERVICE_REFERENCE_MAX}
        placeholder={SERVICE_REFERENCE_PLACEHOLDER}
        aria-describedby={message ? `${id}-err` : undefined}
        className={`form-input ${message ? 'is-invalid' : ''}`}
        value={value ?? ''}
        onChange={onChange}
        onBlur={onBlur}
      />
      {message && (
        <p id={`${id}-err`} className="text-danger mt-1 text-xs">
          {String(message)}
        </p>
      )}
    </div>
  )
}
