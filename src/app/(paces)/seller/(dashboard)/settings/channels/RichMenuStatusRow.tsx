'use client'

/**
 * RichMenuStatusRow — แถวสถานะเมนูลัดใน LINE ในการ์ดช่องทาง (feature 00045, ux Design Spec §A)
 *
 * 🛑 อ่านสถานะแบบ client-fetch หลัง mount **ไม่ใช่ SSR** — การอ่านสถานะต้องยิงไป LINE จริง
 * (`GET /v2/bot/user/all/richmenu`) ถ้าทำใน RSC หน้าตั้งค่าทั้งหน้าจะค้างรอ LINE ทุกครั้งที่เปิด
 * และร้านที่มีหลายเพจจะรอเป็นทวีคูณ
 *
 * 🛑 คำของสถานะ `UNKNOWN` ห้ามเขียนว่า "ร้านนี้ไม่มีเมนู" — ความจริงคือ **เรามองไม่เห็น**
 * เมนูที่ร้านตั้งเองใน LINE OA Manager (แพลตฟอร์มไม่เปิด API ให้ตรวจ) การเขียนว่าไม่มีคือการโกหก
 * ที่ทำให้ร้านตัดสินใจผิด (FR-RM-06)
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

type State = 'NONE' | 'DRAFT' | 'ACTIVE' | 'UNKNOWN'

type View = { state: State; stateStale: boolean }

/** ป้าย/โทนของแต่ละสถานะ — 🛑 `ACTIVE` เป็นค่าเดียวที่ใช้เขียว (Verified-Means-Green:
 *  เขียว = ยืนยันแล้วว่าทำงานจริง) `DRAFT` ยังไม่ live จึงเป็น info ไม่ใช่เขียว */
const BADGE: Record<State, { label: string; className: string; icon?: string }> = {
  NONE: { label: 'ยังไม่ได้สร้าง', className: 'bg-default-100 text-default-700' },
  DRAFT: { label: 'สร้างไว้แล้ว ยังไม่เปิดใช้', className: 'bg-info/15 text-info-ink', icon: 'pencil' },
  ACTIVE: { label: 'ลูกค้าเห็นเมนูนี้อยู่', className: 'bg-success/15 text-success-ink', icon: 'check' },
  UNKNOWN: { label: 'ไม่ได้ใช้เมนูของ Deep', className: 'bg-default-100 text-default-700', icon: 'eye-off' },
}

export default function RichMenuStatusRow({
  channelId,
  tokenInvalid,
}: {
  channelId: string
  tokenInvalid: boolean
}) {
  const [view, setView] = useState<View | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const res = await fetch(`/api/channels/line/rich-menu?shopChannelId=${encodeURIComponent(channelId)}`)
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as View
      setView(data)
    } catch {
      setFailed(true)
    }
  }, [channelId])

  useEffect(() => {
    // เพจที่โทเคนเสียอยู่แล้ว ไม่ต้องยิงถาม LINE ให้เสียเที่ยว — ยังไงก็ตั้งเมนูไม่ได้
    if (tokenInvalid) return
    void load()
  }, [load, tokenInvalid])

  const href = `/settings/channels/line/${channelId}/rich-menu`

  return (
    <div className="border-default-200 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-dashed py-3">
      <span className="text-default-700 flex items-center gap-2 text-sm font-medium">
        <Icon icon="layout-grid" className="text-base" aria-hidden="true" />
        เมนูลัดใน LINE
      </span>

      {tokenInvalid ? (
        // ไม่มี badge/ลิงก์ — เชื่อมเพจให้สำเร็จก่อนเป็นเงื่อนไขที่ต้องแก้ก่อนทุกอย่าง
        <span className="text-default-400 text-sm">เชื่อมต่อ LINE OA ให้สำเร็จก่อน จึงจะตั้งเมนูลัดได้</span>
      ) : failed ? (
        <>
          <span className="badge bg-default-100 text-default-700">ตรวจสอบสถานะไม่ได้ตอนนี้</span>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="ลองตรวจสอบสถานะเมนูอีกครั้ง"
            className="btn btn-icon text-default-700 hover:text-primary"
          >
            <Icon icon="refresh" className="text-base" aria-hidden="true" />
          </button>
        </>
      ) : !view ? (
        <span className="bg-default-100 h-5 w-40 animate-pulse rounded" aria-hidden="true" />
      ) : (
        <>
          <span className={`badge inline-flex items-center gap-1 ${BADGE[view.state].className}`}>
            {BADGE[view.state].icon && (
              <Icon icon={BADGE[view.state].icon!} className="text-xs" aria-hidden="true" />
            )}
            {BADGE[view.state].label}
          </span>
          {view.stateStale && (
            // อ่านสถานะจาก LINE ไม่สำเร็จแต่ยังมีข้อมูลร่างอยู่ — บอกตรง ๆ ว่าอาจไม่ตรงปัจจุบัน
            // ห้ามเงียบ เพราะผู้ขายใช้ค่านี้ตัดสินใจว่าลูกค้ากำลังเห็นอะไร
            <span className="text-default-400 text-xs">(อาจไม่ตรงปัจจุบัน)</span>
          )}
        </>
      )}

      {!tokenInvalid && (
        <Link
          href={href}
          className="text-primary hover:text-primary-hover ms-auto inline-flex items-center gap-1 text-sm font-medium"
        >
          {view?.state === 'NONE' ? 'สร้างเมนู' : 'จัดการเมนู'}
          <Icon icon="chevron-right" className="text-sm" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
