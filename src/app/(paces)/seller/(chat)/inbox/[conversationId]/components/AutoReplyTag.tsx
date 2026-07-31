'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'

/**
 * ป้าย "ระบบตอบ" ที่เกยขอบบนของบับเบิล + กล่องบอกเหตุผลเบื้องหลังคำตอบครั้งนั้น (feature 00023 S-23)
 *
 * แทนที่ชิปเดิมที่อยู่ **ข้างใน** บับเบิล (user 2026-07-31: "มันต้องเป็น label บนกล่องข้อความ
 * คล้าย ๆ unread ไม่ได้อยู่ใน chat แบบนี้")
 *
 * WARNING (สีที่เลือกไม่ใช่เรื่องรสนิยม): บับเบิลฝั่งร้านเป็น `bg-primary` ทึบอยู่แล้ว ป้ายน้ำเงิน
 * วางทับตรง ๆ จะกลืนหายไปกับพื้น — จึงเป็นป้ายพื้น `bg-card` ขอบ+ตัวอักษร `text-primary` แทน
 * และ **ต้องมี z-index**: บับเบิลเป็น position:relative และอยู่หลังป้ายใน DOM ถ้าไม่ยกขึ้นมา
 * ป้ายจะโดนบับเบิลวาดทับ (บั๊กที่เจอตอนทำ mockup รอบแรก)
 *
 * เปิดกล่องได้ทั้ง hover (เดสก์ท็อป) และแตะ (มือถือไม่มี hover เลย) — ไม่ใช้ Preline `hs-tooltip`
 * เพราะเธรดแชท re-render ทุกครั้งที่ข้อความใหม่เข้า ซึ่งเป็นเงื่อนไขเดียวกับที่ทำให้ hs-dropdown
 * พังในโปรเจกต์นี้มาแล้ว (docs/system/ui-guideline/paces-component-reference.md §3)
 */

export type AutoReplyTrace = {
  keywordName: string | null
  matchedPhrase: string | null
  matchType: string | null
  channelName: string | null
  adLabel: string | null
  productName: string | null
}

/** ค่าดิบจาก DB อ่านไม่รู้เรื่องสำหรับร้าน — แปลเป็นสิ่งที่บอกว่า "จับคู่ยังไง" ตรง ๆ */
const MATCH_TYPE_LABEL: Record<string, string> = {
  EXACT: 'ตรงทั้งข้อความ',
  CONTAINS: 'มีคำนี้อยู่ในข้อความ',
  STARTS_WITH: 'ขึ้นต้นด้วยคำนี้',
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border-default-100 flex gap-2.5 border-b py-1 last:border-b-0">
      <dt className="text-default-600 w-16 shrink-0">{label}</dt>
      <dd className={`mb-0 min-w-0 flex-1 break-words ${value ? 'text-default-800' : 'text-default-400'}`}>
        {value ?? 'ไม่เจาะจง'}
      </dd>
    </div>
  )
}

export default function AutoReplyTag({ isTest, trace }: { isTest: boolean; trace: AutoReplyTrace | null }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // ปิดเมื่อแตะที่อื่น/กด Escape — จำเป็นเฉพาะตอนเปิดด้วยการแตะ (hover ปิดตัวเองอยู่แล้ว)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label = isTest ? 'ระบบตอบ · ทดสอบ' : 'ระบบตอบ'

  return (
    <div
      ref={wrapRef}
      className="absolute top-0 start-2.5 z-20 -translate-y-1/2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open && (
        <div className="border-default-300 bg-card absolute bottom-full start-0 z-30 mb-2 w-64 rounded-md border text-start shadow-lg">
          <div className="bg-default-100 border-default-300 text-default-800 border-b px-3 py-2 text-xs font-semibold">
            ระบบตอบกลับอัตโนมัติ{isTest ? ' (โหมดทดสอบ)' : ''}
          </div>
          <div className="text-default-600 px-3 py-2 text-xs">
            {trace ? (
              <>
                <dl className="mb-0">
                  <Row label="กลุ่มคำ" value={trace.keywordName} />
                  <Row
                    label="คำที่ตรง"
                    value={
                      trace.matchedPhrase
                        ? `“${trace.matchedPhrase}”${
                            trace.matchType ? ` · ${MATCH_TYPE_LABEL[trace.matchType] ?? trace.matchType}` : ''
                          }`
                        : null
                    }
                  />
                </dl>
                <p className="text-default-600 mb-0 pt-2 pb-0.5 text-2xs font-semibold">
                  เงื่อนไขที่ทำให้เลือกคำตอบนี้
                </p>
                <dl className="mb-0">
                  <Row label="เพจ" value={trace.channelName} />
                  <Row label="โฆษณา" value={trace.adLabel} />
                  <Row label="สินค้า" value={trace.productName} />
                </dl>
              </>
            ) : (
              <p className="mb-0">ไม่พบบันทึกของการตอบครั้งนี้ (อาจถูกลบไปแล้ว)</p>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${label} — เปิดดูเงื่อนไขที่ใช้ตอบ`}
        className="border-primary text-primary bg-card inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap shadow"
      >
        <Icon icon="robot" className="text-xs" />
        {label}
      </button>
    </div>
  )
}
