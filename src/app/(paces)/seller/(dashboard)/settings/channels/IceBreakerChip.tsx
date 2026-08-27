'use client'

/**
 * IceBreakerChip — จุดเข้าไปตั้ง "คำถามแนะนำก่อนเริ่มแชท" (Ice Breakers) ของเพจ/บัญชี IG
 * (feature ice-breaker, 2026-08-27)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/LineChannelCard.tsx
 *   บรรทัด 87-91 (`TONE_ACTION`) + 383-393 (health-action button) — chip ที่เป็นทั้ง
 *   "ป้ายสถานะ" และ "ปุ่มกดเข้าไปจัดการ" ในตัวเดียว, feature 00045
 *
 * 🛑 **เดิมเป็นแถวแยกใต้เพจ (`IceBreakerStatusRow`) — user สั่งย้ายเข้ามาในแถวเดียวกัน**
 * ("ผมอยากให้ปุ่มตั้ง อยู่แถวเดียว มุมขวาสุด จะได้ตั้งค่าง่ายๆ") ⇒ ยุบ "ป้ายชื่อฟีเจอร์ +
 * badge สถานะ + ลิงก์จัดการ" สามชิ้นให้เหลือ chip ชิ้นเดียวที่พูดสถานะด้วยตัวมันเอง
 *
 * 🛑 **LINE (เมนูลัดใน LINE) ยังเป็นแถวแยกเหมือนเดิมโดยตั้งใจ** — ไม่ใช่การลืม:
 * แถว LINE มีปุ่มอยู่แล้วสูงสุด 3 ตัว (health-action + ทดสอบการเชื่อมต่อ + ถอด) ยัด chip
 * เป็นตัวที่ 4 จะล้นหนักกว่าเคสแย่สุดของ Messenger/IG หลายเท่า ⇒ ต้องยุบปุ่มของ LINE
 * เข้าเมนูก่อนถึงจะทำให้เหมือนกันได้ ซึ่งเป็นงานคนละรอบ (มติจาก safepay-ux 2026-08-27)
 *
 * 🛑 อ่านสถานะแบบ client-fetch หลัง mount ไม่ใช่ RSC — แต่ละเพจโหลดอิสระจากกัน
 * ไม่ต้องรอทุกเพจพร้อมกันก่อนหน้าจะขึ้น (เหตุผลเดียวกับ RichMenuStatusRow)
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

type State = 'NONE' | 'ACTIVE'

/**
 * คำ/โทน/ไอคอนของแต่ละสถานะ
 *
 * Verified-Means-Green: เขียวเฉพาะ `ACTIVE` = ยืนยันแล้วว่าลูกค้าเห็นอยู่จริง
 * `NONE` เป็นเทาไม่ใช่ warning เพราะ "ยังไม่ได้ตั้ง" ไม่ใช่ความผิดปกติ แค่ยังไม่ได้ทำ
 */
const CHIP: Record<State, { label: string; className: string; icon: string }> = {
  NONE: {
    label: 'ตั้งคำถามแนะนำ',
    className: 'bg-default-100 text-default-800 hover:bg-default-200',
    icon: 'message-plus',
  },
  ACTIVE: {
    label: 'ลูกค้าเห็นอยู่',
    className: 'bg-success/15 text-success-ink hover:bg-success/25',
    icon: 'check',
  },
}

/** 🛑 `.btn.btn-icon` เพียว ๆ = 37px ต่ำกว่าเกณฑ์นิ้ว 44px ต้อง override ที่มือถือเสมอ */
const TAP = 'min-h-11 sm:min-h-0'

export default function IceBreakerChip({
  channelId,
  tokenInvalid,
}: {
  channelId: string
  tokenInvalid: boolean
}) {
  const [state, setState] = useState<State | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const res = await fetch(`/api/channels/${channelId}/ice-breakers`)
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as { items: unknown[] }
      setState(Array.isArray(data.items) && data.items.length > 0 ? 'ACTIVE' : 'NONE')
    } catch {
      setFailed(true)
    }
  }, [channelId])

  useEffect(() => {
    // เพจที่โทเคนเสียอยู่แล้วไม่ต้องยิงถามให้เสียเที่ยว — ยังไงก็ตั้งไม่ได้จนกว่าจะเชื่อมใหม่
    if (tokenInvalid) return
    void load()
  }, [load, tokenInvalid])

  if (tokenInvalid) {
    // 🛑 ปุ่ม "เชื่อมต่อใหม่" อยู่ในแถวเดียวกันติดกันแล้ว ความใกล้กันเชิงพื้นที่สื่อสารแทนประโยค
    // อธิบายยาวของเวอร์ชันแถวแยกได้ — แต่ `aria-label` ต้องเก็บความหมายเต็มไว้ ไม่งั้นคนที่ใช้
    // screen reader จะได้ยินแค่ "ตั้งคำถามแนะนำ" ที่กดไม่ได้โดยไม่มีคำอธิบายว่าทำไม
    return (
      <span
        aria-label="ตั้งคำถามแนะนำ — ต้องเชื่อมต่อเพจให้สำเร็จก่อน"
        className={`btn btn-sm bg-default-100 text-default-400 inline-flex cursor-not-allowed items-center gap-1.5 ${TAP}`}
      >
        <Icon icon="message-plus" className="text-sm" aria-hidden="true" />
        ตั้งคำถามแนะนำ
      </span>
    )
  }

  const href = `/settings/channels/${channelId}/ice-breakers`

  if (failed) {
    return (
      <>
        {/* href ไม่ได้ขึ้นกับผลตรวจสถานะ — อ่านสถานะไม่ได้ ไม่ได้แปลว่าตั้งค่าไม่ได้ */}
        <Link
          href={href}
          className={`btn btn-sm bg-default-100 text-default-800 hover:bg-default-200 inline-flex items-center gap-1.5 ${TAP}`}
        >
          <Icon icon="message-plus" className="text-sm" aria-hidden="true" />
          คำถามแนะนำ
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="ลองตรวจสอบสถานะคำถามแนะนำอีกครั้ง"
          className={`btn btn-icon text-default-700 hover:text-primary min-w-11 sm:min-w-9 ${TAP}`}
        >
          <Icon icon="refresh" className="text-base" aria-hidden="true" />
        </button>
      </>
    )
  }

  if (!state) {
    // skeleton กว้างเท่า chip จริงโดยประมาณ — กันแถวกระโดดตอนค่ามาถึง
    return <span className="bg-default-100 h-9 w-36 animate-pulse rounded" aria-hidden="true" />
  }

  const chip = CHIP[state]
  return (
    <Link
      href={href}
      className={`btn btn-sm inline-flex items-center gap-1.5 ${chip.className} ${TAP}`}
    >
      <Icon icon={chip.icon} className="text-sm" aria-hidden="true" />
      {chip.label}
      <Icon icon="chevron-right" className="text-sm" aria-hidden="true" />
    </Link>
  )
}
