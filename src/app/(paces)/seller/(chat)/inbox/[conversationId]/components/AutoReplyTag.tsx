'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'

/**
 * ป้าย "DeepBot" ที่เกยขอบบนของบับเบิล + กล่องบอกเหตุผลเบื้องหลังคำตอบครั้งนั้น (feature 00023 S-23)
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

export type AiAnswerContext = {
  mode?: 'KNOWLEDGE' | 'FREE'
  knowledgeCount?: number
  productCount?: number
  historyCount?: number
  webSearch?: boolean
  shopOnly?: boolean
  guardrailBlock?: number
  guardrailAvoid?: number
  hasExtraPrompt?: boolean
  hasImages?: boolean
  usedKnowledgeIds?: string[]
}

export type AutoReplyTrace = {
  matchedVia: string | null
  aiContext?: AiAnswerContext | null
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

/**
 * แถวที่ไม่มีค่า
 *
 * `hideWhenEmpty` ใช้กับบล็อก "ข้อมูลที่ใช้ประกอบการตอบ" ซึ่งมี 9 แถวและส่วนใหญ่ว่าง —
 * การโชว์ "ไม่เจาะจง" ทั้งแถวทำให้กล่องสูงเกินจนโดนกรอบ scroll ตัดหัว (user เจอ 2026-08-01)
 * ส่วนบล็อก "เงื่อนไขของเธรด" ยังโชว์แถวว่างตามเดิม เพราะที่นั่น "ไม่เจาะจง" คือคำตอบ
 * ที่มีความหมาย (บอกว่ากฎถูกเลือกโดยไม่ผูกเพจ/โฆษณา)
 */
function Row({
  label,
  value,
  hideWhenEmpty,
}: {
  label: string
  value: string | null
  hideWhenEmpty?: boolean
}) {
  if (hideWhenEmpty && !value) return null
  return (
    <div className="border-default-100 flex gap-2.5 border-b py-1 last:border-b-0">
      <dt className="text-default-600 w-16 shrink-0">{label}</dt>
      <dd className={`mb-0 min-w-0 flex-1 break-words ${value ? 'text-default-800' : 'text-default-400'}`}>
        {value ?? 'ไม่เจาะจง'}
      </dd>
    </div>
  )
}

// กล่องรายละเอียดที่กางออกมา — แยกคลาสออกมาเป็น const เพราะความสูงสูงสุดเป็น carve-out ของ HR7
// ที่ต้องมี comment กำกับ *บนบรรทัดเดียวกัน* (theme-guard ตัดเฉพาะบรรทัดที่มีเครื่องหมาย comment
// ออกจากผลสแกน) ซึ่งเขียนไม่ได้ถ้า className ฝังอยู่ใน JSX opening tag
const POPUP_CLASS =
  'border-default-300 bg-card fixed z-50 max-h-[60dvh] w-64 overflow-y-auto rounded-md border text-start shadow-lg' // HR7 carve-out: Paces ไม่มี token viewport-height + กล่องนี้ fixed หนีกรอบ overflow — precedent CustomerPanelSheet.tsx

export default function AutoReplyTag({ isTest, trace }: { isTest: boolean; trace: AutoReplyTrace | null }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  /**
   * ตำแหน่งกล่องคำนวณจากปุ่มแล้ววางแบบ fixed
   *
   * WARNING: วางแบบ absolute ไม่ได้ — บล็อกข้อความอยู่ใน scroll container ที่มี overflow
   * กล่องที่สูงกว่าพื้นที่เหนือปุ่มจะถูกตัดหัวทิ้ง (user เจอ 2026-08-01 หลังกล่องยาวขึ้น)
   * fixed หลุดจากกรอบนั้น แล้วพลิกไปอยู่ใต้ปุ่มเองถ้าที่ด้านบนไม่พอ
   */
  const [pos, setPos] = useState<{ top: number; right: number; below: boolean } | null>(null)

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const spaceAbove = r.top
    const below = spaceAbove < 320 // กล่องสูงได้ถึง ~300px — ที่ไม่พอก็พลิกลงล่าง
    setPos({
      top: below ? r.bottom + 8 : r.top - 8,
      right: Math.max(8, window.innerWidth - r.right),
      below,
    })
  }

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

  // ชื่อแบรนด์ของตัวช่วยตอบ (user 2026-07-31) — สั้นกว่าคำอธิบายเชิงระบบ และทำให้ร้าน
  // พูดถึงมันเป็น "ตัวตน" ที่สั่งงานได้ ไม่ใช่ฟีเจอร์นิรนาม; UI ใช้ชื่อการค้า Deep เสมอ
  //
  // แยกสองชื่อตามที่มาจริง (user 2026-08-01): คำตอบสำเร็จรูปที่ร้านเขียนเอง = DeepBot
  // ส่วนข้อความที่ AI แต่งขึ้นจากคลังความรู้ = DeepAI — ร้านต้องแยกออกตั้งแต่แรกเห็นว่า
  // อันไหนคือคำพูดของตัวเองและอันไหนที่ควรอ่านตรวจก่อนปล่อยผ่าน
  const brand = trace?.matchedVia === 'CHATBOT' ? 'DeepAI' : 'DeepBot'
  /**
   * S-20a: ชิปแสดง**ชื่อเท่านั้น** ไม่ต่อท้าย "· ทดสอบ" อีกแล้ว (user สั่ง 2026-07-31)
   *
   * ชิปเกยขอบบนบับเบิลและกว้างตามตัวอักษร — ต่อท้ายอีก 8 ตัวทำให้มันกินพื้นที่ข้อความจริง
   * บนมือถือ ทั้งที่ "โหมดทดสอบ" เป็นข้อมูลที่ดูตอนสงสัย ไม่ใช่ข้อมูลที่ต้องเห็นทุกบับเบิล
   *
   * ข้อมูลไม่ได้หายไปไหน — หัวกล่องรายละเอียด (ชี้/แตะแล้วกาง) ยังเขียน "(โหมดทดสอบ)" อยู่
   * และ aria-label ด้านล่างยังบอกด้วย เพื่อให้ screen reader ไม่เสียข้อมูลที่ตาเห็นจากตำแหน่งอื่น
   */
  const label = brand

  // ป้ายชิดขวา (user 2026-07-31): ข้อความฝั่งร้านจัดชิดขวาอยู่แล้ว ป้ายที่เกาะซ้ายสุดของบับเบิล
  // กว้าง ๆ จะดูหลุดออกจากกลุ่มของตัวเอง — กล่องรายละเอียดจึงต้องกางไปทางซ้าย (end-0) ด้วย
  // ไม่งั้นชนขอบจอขวาบนมือถือ

  return (
    <div
      ref={wrapRef}
      className="absolute top-0 end-2.5 z-20 -translate-y-1/2"
      onMouseEnter={() => {
        place()
        setOpen(true)
      }}
      onMouseLeave={() => setOpen(false)}
    >
      {open && (
        <div
          className={POPUP_CLASS}
          style={
            pos
              ? { top: pos.below ? pos.top : undefined, bottom: pos.below ? undefined : window.innerHeight - pos.top, right: pos.right }
              : undefined
          }
        >
          <div className="bg-default-100 border-default-300 text-default-800 border-b px-3 py-2 text-xs font-semibold">
            ตอบโดย {brand}{isTest ? ' (โหมดทดสอบ)' : ''}
          </div>
          <div className="text-default-600 px-3 py-2 text-xs">
            {trace?.matchedVia === 'CHATBOT' ? (
              // คำตอบจาก AI ไม่ได้เกิดจากการจับคู่คำ จึงไม่มี "กลุ่มคำ"/"คำที่ตรง" ให้แสดง
              // ยัดแถวว่างไว้จะโกหกว่ามีเงื่อนไขอยู่แต่หาไม่เจอ
              <>
                <p className="mb-2">
                  {trace.aiContext?.mode === 'FREE'
                    ? 'คลังความรู้ตอบคำถามนี้ไม่ได้ AI จึงตอบเองตามที่ร้านอนุญาต'
                    : 'AI แต่งคำตอบนี้จากคลังความรู้ของร้าน เพราะข้อความนี้ไม่ตรงกลุ่มคำไหนเลย'}
                </p>
                {/* บอกว่า "ใช้อะไรตอบ" ไม่ใช่แค่ "ตอบด้วย AI" — ร้านที่เจอคำตอบแปลก
                    ต้องไล่ได้ว่าข้อมูลชุดไหนเข้าไปอยู่ใน prompt บ้าง (user สั่ง 2026-08-01) */}
                {trace.aiContext && (
                  <>
                    <p className="text-default-600 mb-0 pt-1 pb-0.5 text-2xs font-semibold">
                      ข้อมูลที่ใช้ประกอบการตอบ
                    </p>
                    <dl className="mb-0">
                      <Row
                        hideWhenEmpty
                        label="คลังความรู้"
                        value={
                          trace.aiContext.knowledgeCount
                            ? `${trace.aiContext.knowledgeCount} ข้อ${
                                trace.aiContext.usedKnowledgeIds?.length
                                  ? ` · ใช้ตอบ ${trace.aiContext.usedKnowledgeIds.length} ข้อ`
                                  : ''
                              }`
                            : null
                        }
                      />
                      <Row
                        hideWhenEmpty
                        label="สินค้า"
                        value={trace.aiContext.productCount ? `${trace.aiContext.productCount} รายการในระบบ` : null}
                      />
                      <Row
                        hideWhenEmpty
                        label="ประวัติแชท"
                        value={trace.aiContext.historyCount ? `${trace.aiContext.historyCount} ข้อความก่อนหน้า` : null}
                      />
                      <Row hideWhenEmpty label="ค้นเว็บ" value={trace.aiContext.webSearch ? 'เปิด' : null} />
                      <Row hideWhenEmpty label="รูปจากลูกค้า" value={trace.aiContext.hasImages ? 'ใช้ประกอบด้วย' : null} />
                      <Row
                        hideWhenEmpty
                        label="กฎที่บังคับ"
                        value={
                          (trace.aiContext.guardrailBlock ?? 0) + (trace.aiContext.guardrailAvoid ?? 0) > 0
                            ? `หยุดไม่ตอบ ${trace.aiContext.guardrailBlock ?? 0} · เลี่ยงคำพูด ${trace.aiContext.guardrailAvoid ?? 0}`
                            : null
                        }
                      />
                      <Row hideWhenEmpty label="ขอบเขต" value={trace.aiContext.shopOnly ? 'ตอบเฉพาะเรื่องของร้าน' : null} />
                      <Row hideWhenEmpty label="คำสั่งเพิ่มเติม" value={trace.aiContext.hasExtraPrompt ? 'มี' : null} />
                    </dl>
                  </>
                )}
                <p className="text-default-600 mb-0 pt-2 pb-0.5 text-2xs font-semibold">เงื่อนไขของเธรด</p>
                <dl className="mb-0">
                  <Row label="เพจ" value={trace.channelName} />
                  <Row label="โฆษณา" value={trace.adLabel} />
                  <Row label="สินค้า" value={trace.productName} />
                </dl>
              </>
            ) : trace ? (
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
        ref={btnRef}
        type="button"
        onClick={() => {
          place()
          setOpen((v) => !v)
        }}
        aria-expanded={open}
        /* aria-label ต้องพูดถึงโหมดทดสอบด้วย แม้ชิปจะไม่โชว์แล้ว — คนที่ใช้ screen reader
           เปิดกล่องรายละเอียดมาอ่านได้ยากกว่า ถ้าตัดออกทั้งสองที่จะเสียข้อมูลจริง ไม่ใช่แค่ย้ายที่ */
        aria-label={`${label}${isTest ? ' (โหมดทดสอบ)' : ''} ตอบข้อความนี้ — เปิดดูเงื่อนไขที่ใช้ตอบ`}
        className="border-primary text-primary bg-card inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap shadow"
      >
        <Icon icon="robot" className="text-xs" />
        {label}
      </button>
    </div>
  )
}
