'use client'

/**
 * IceBreakerStatusRow — แถวสถานะ "คำถามแนะนำก่อนเริ่มแชท" (Ice Breakers) ในการ์ดช่องทาง
 * (feature ice-breaker, 2026-08-27)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/RichMenuStatusRow.tsx
 *   — โครงแถวทั้งหมด (badge/skeleton/failed-with-retry/tokenInvalid/ลิงก์ท้ายแถว, feature 00045)
 *
 * 🛑 อ่านสถานะแบบ client-fetch หลัง mount **ไม่ใช่ SSR** — เหตุผลเดียวกับ RichMenuStatusRow:
 * หน้าตั้งค่าที่มีหลายเพจจะต้องรอทุกเพจพร้อมกันถ้าทำใน RSC (ที่นี่ GET เป็นแค่ DB read แต่ก็ยัง
 * ทำให้หน้าค้างรอโดยไม่จำเป็นถ้าทำใน RSC — client-fetch ทำให้แต่ละแถวโหลดอิสระจากกัน)
 *
 * 🛑 มีแค่ 2 สถานะ (`NONE`/`ACTIVE`) — **ไม่มี `UNKNOWN`** ต่างจาก Rich Menu โดยตั้งใจ:
 * `saveIceBreakers()` (channel-chat.service.ts) ยิงไป Meta ก่อน สำเร็จแล้วจึงเขียน DB ⇒ ฐานเรา
 * ตรงกับ Meta เสมอ ไม่มีช่องให้ "เรามองไม่เห็น" แบบเมนูลัดใน LINE ที่ร้านตั้งเองใน OA Manager ได้
 * โดยเราไม่รู้ (ดู channel-chat.service.ts บรรทัดคอมเมนต์เหนือ saveIceBreakers)
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

type State = 'NONE' | 'ACTIVE'

/** ป้าย/โทนของแต่ละสถานะ — Verified-Means-Green: เขียวเฉพาะตอนลูกค้าเห็นอยู่จริง */
const BADGE: Record<State, { label: string; className: string; icon?: string }> = {
  NONE: { label: 'ยังไม่ได้ตั้ง', className: 'bg-default-100 text-default-700' },
  ACTIVE: { label: 'ลูกค้าเห็นอยู่', className: 'bg-success/15 text-success-ink', icon: 'check' },
}

export default function IceBreakerStatusRow({
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
    // เพจที่โทเคนเสียอยู่แล้ว ไม่ต้องยิงถามให้เสียเที่ยว — ยังไงก็ตั้งไม่ได้จนกว่าจะเชื่อมใหม่
    if (tokenInvalid) return
    void load()
  }, [load, tokenInvalid])

  const href = `/settings/channels/${channelId}/ice-breakers`

  return (
    <div className="border-default-200 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-dashed py-3">
      <span className="text-default-700 flex items-center gap-2 text-sm font-medium">
        <Icon icon="message-plus" className="text-base" aria-hidden="true" />
        คำถามแนะนำก่อนเริ่มแชท
      </span>

      {tokenInvalid ? (
        // ไม่มี badge/ลิงก์ — เชื่อมเพจให้สำเร็จก่อนเป็นเงื่อนไขที่ต้องแก้ก่อนทุกอย่าง (เหมือน Rich Menu)
        <span className="text-default-400 text-sm">เชื่อมต่อให้สำเร็จก่อน จึงจะตั้งคำถามแนะนำได้</span>
      ) : failed ? (
        <>
          <span className="badge bg-default-100 text-default-700">ตรวจสอบสถานะไม่ได้ตอนนี้</span>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="ลองตรวจสอบสถานะคำถามแนะนำอีกครั้ง"
            className="btn btn-icon text-default-700 hover:text-primary"
          >
            <Icon icon="refresh" className="text-base" aria-hidden="true" />
          </button>
        </>
      ) : !state ? (
        <span className="bg-default-100 h-5 w-40 animate-pulse rounded" aria-hidden="true" />
      ) : (
        <span className={`badge inline-flex items-center gap-1 ${BADGE[state].className}`}>
          {BADGE[state].icon && <Icon icon={BADGE[state].icon!} className="text-xs" aria-hidden="true" />}
          {BADGE[state].label}
        </span>
      )}

      {!tokenInvalid && (
        <Link
          href={href}
          className="text-primary hover:text-primary-hover ms-auto inline-flex items-center gap-1 text-sm font-medium"
        >
          {state === 'NONE' ? 'ตั้งคำถามแนะนำ' : 'จัดการคำถาม'}
          <Icon icon="chevron-right" className="text-sm" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
