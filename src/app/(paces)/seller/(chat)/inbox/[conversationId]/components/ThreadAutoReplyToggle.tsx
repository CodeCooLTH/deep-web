'use client'

/**
 * ThreadAutoReplyToggle — แถบ 2 ช่อง "ปิด / อัตโนมัติ" ของ auto-reply รายห้อง (2026-08-27)
 *
 * ที่มา: user ส่งภาพ segmented pill มาแล้วถามเองว่า "มันมีการเปิด auto reply ได้ อาจจะเป็น
 * เปิดปิด auto reply เช่น ปิด autoreply DeepAI งี้ไหม" — คำตอบคือ **ใช่ และมันมีอยู่แล้ว**
 * `Conversation.autoReplyEnabled` (schema.prisma) + `PATCH /api/chat/conversations/{id}/auto-reply`
 * + ด่านจริงที่ `auto-reply.service.ts` gate 1 มีครบมาตั้งแต่ feature 00023 — **แค่ไม่เคยมี UI**
 * รอบนี้จึงเป็นการต่อปุ่มเข้ากับของเดิม ไม่มี migration ไม่แตะไปป์ไลน์
 *
 * 🛑 "ปิด" ปิดทั้ง DeepBot (กลุ่มคำ) และ DeepAI (ChatBot) — `tryChatbotAnswer` อยู่ **หลัง** gate 1
 * ในไปป์ไลน์เดียวกัน ห้ามเขียนคำบนจอที่สื่อว่าปิดแค่ตัวใดตัวหนึ่ง
 *
 * 🛑 มีแค่ 2 ช่อง ไม่ใช่ 3 (user เคาะ) — ค่าที่เก็บได้จริงคือ `null | true | false` แต่ `null` กับ
 * `true` ให้ผลเหมือนกันเป๊ะตั้งแต่ถอดสวิตช์ระดับร้านออก 2026-07-30 ("ไม่มีแล้วสิ ปิดทั้งหมด
 * ให้ user ปิดเอง ในแต่ละ row") ⇒ ช่องที่สามจะเป็นช่องที่ไม่มีความหมายต่างจากช่องข้าง ๆ
 *
 * 🛑 เลือก "อัตโนมัติ" ต้องส่ง `clearPause`+`clearHandoff` ไปด้วยเสมอ — ไม่งั้นห้องที่ถูกพัก
 * (พนักงานพิมพ์ตอบ) หรือถูกส่งต่อคน จะยังเงียบต่อ แล้วแถบจะขึ้นว่า "อัตโนมัติ" ทั้งที่บอทไม่ตอบ
 * = ปุ่มที่โกหก. ชุดค่าเดียวกับปุ่ม "ให้บอทตอบต่อ" ใน `BotPausedBanner` (ซึ่งรีเซ็ต `autoReplyCount`
 * ให้ด้วย — ตั้งใจ ดูคอมเมนต์ในหน้า route)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx (`.nav-tabs` pill) — โครง segmented
 *       ตัวเดียวกับสวิตช์ 3 สถานะใน `settings/chatbot/ChatbotClient.tsx` (พื้น bg-light + ตัว active
 *       เป็นการ์ดยกขึ้น) เพื่อให้ "ตัวเลือกโหมดของ AI" หน้าตาเหมือนกันทั้งสองที่ (HR16)
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { pacesToast } from '@/lib/paces-toast'

/** null = ยังไม่เคยตั้ง ซึ่งวันนี้ให้ผลเท่ากับเปิด (ดูหัวไฟล์) */
export const isAutoReplyOn = (v: boolean | null | undefined) => v !== false

/**
 * คำบนแถบมาจาก dictionary — หน้าจอนี้อยู่ใต้ระบบสองภาษา (00047) ห้ามพิมพ์ไทยตายตัว
 *
 * 🛑 ไอคอนต้องเป็น `robot` / `robot-off` เท่านั้น — **ห้ามใช้ `bolt` หรือ `sparkles`**
 *
 * รอบแรกผมเลือก `bolt` แล้ว user ทักทันทีว่า *"งง เอา quick message มาทำไม"* เพราะ `bolt`
 * มีความหมายจองไว้แล้วในจอเดียวกันนี้ = **ข้อความสำเร็จรูป** (`ChatThread.tsx` ปุ่มแถบเครื่องมือ
 * + `QuickMessageBar.tsx`) ส่วน `sparkles` = **DeepAI ช่วยร่างคำตอบ** (ปุ่มข้าง ๆ กันเลย)
 *
 * ที่ถูกคือยืมของที่รีโปนี้ใช้ตอบ *คำถามเดียวกัน* อยู่แล้ว: `BotPausedBanner.tsx` ใช้ `robot-off`
 * กับข้อความ "บอทหยุดตอบห้องนี้แล้ว" ⇒ แถบนี้ซึ่งตอบว่า "บอทตอบห้องนี้ไหม" ต้องใช้สัญลักษณ์
 * ชุดเดียวกัน (HR16 — ของเดียวกันห้ามมีสองสัญลักษณ์) ไม่ใช่ตั้งไอคอนใหม่ให้ผู้ใช้เรียนซ้ำ
 */
const OPTIONS = [
  { on: false, key: 'threadAutoReplyOff', icon: 'robot-off' },
  { on: true, key: 'threadAutoReplyAuto', icon: 'robot' },
] as const

export default function ThreadAutoReplyToggle({
  conversationId,
  enabled,
  className = 'inline-flex',
  variant = 'segmented',
}: {
  conversationId: string
  enabled: boolean | null | undefined
  className?: string
  /**
   * `icon` = ปุ่มเดียวกดสลับ ใช้ที่จอแคบ (2026-08-27 รอบสอง — user: "ตอนนี้มันต้องกด dropdown ก่อน")
   *
   * 🛑 ทำไมจอแคบไม่ได้แถบ segmented: ที่ 320px `.card-header` เหลือที่ 280px · back 37 + avatar 36
   * + ปุ่มขวา 4 ตัว ⇒ ชื่อลูกค้าเหลือหลักสิบต้น ๆ อยู่แล้ว แถบที่กว้าง ~150px กินหมดทั้งแถว
   * ไอคอนจึงต้องแบกความหมายแทนคำ — `robot` = อัตโนมัติ · `robot-off` = ปิด (คู่เดียวกับในแถบ
   * และคู่เดียวกับ `BotPausedBanner` ไม่ใช่คนละชุด) และมี `title`/`aria-pressed` กำกับเสมอ
   */
  variant?: 'segmented' | 'icon'
}) {
  const t = useT()
  const router = useRouter()
  // optimistic: ผู้ขายกดแล้วต้องเห็นผลทันที — ค่าจริงมาจาก server ตอน refresh
  const [value, setValue] = useState(() => isAutoReplyOn(enabled))
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  async function pick(on: boolean) {
    if (busy || on === value) return
    const prev = value
    setValue(on)
    setBusy(true)
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/auto-reply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          on
            ? { autoReplyEnabled: true, clearPause: true, clearHandoff: true }
            : { autoReplyEnabled: false },
        ),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(b?.error ?? t.inbox.threadAutoReplyFailed)
      }
      pacesToast.success(on ? t.inbox.threadAutoReplyOnDone : t.inbox.threadAutoReplyOffDone)
      // แถบสถานะเหนือเธรด (พักบอท/ส่งต่อคน) อ่านจาก server — ต้องรีเฟรชไม่งั้นค้างขัดกับแถบนี้
      startTransition(() => router.refresh())
    } catch (e) {
      setValue(prev) // ย้อนค่า: ปล่อยไว้ = แถบโกหกว่าเปลี่ยนแล้ว
      pacesToast.error(e instanceof Error ? e.message : t.inbox.threadAutoReplyFailed)
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'icon') {
    const on = value
    const opt = on ? OPTIONS[1] : OPTIONS[0]
    return (
      <button
        type="button"
        onClick={() => pick(!on)}
        disabled={busy}
        aria-pressed={on}
        title={`${t.inbox.threadAutoReplyTitle}: ${t.inbox[opt.key]}`}
        aria-label={`${t.inbox.threadAutoReplyTitle}: ${t.inbox[opt.key]}`}
        className={`btn btn-icon border-default-300 hover:bg-default-100 shrink-0 disabled:opacity-60 ${
          on ? 'text-primary-ink' : 'text-default-500'
        } ${className}`}
      >
        <Icon icon={opt.icon} className="text-lg" />
      </button>
    )
  }

  return (
    <div
      /* 🛑 ห้ามใส่ `flex` ไว้ในคลาสฐาน — ผู้เรียกในหัวเธรดส่ง `hidden md:flex` มา และ `hidden`
         กับ `flex` อยู่ layer เดียวกัน specificity เท่ากัน ตัวชนะขึ้นกับ **ลำดับใน CSS ที่ Tailwind
         สร้าง** ไม่ใช่ลำดับที่เราเขียนในสตริง ⇒ เขียนคู่กันเมื่อไหร่คือปล่อยให้ bundler ตัดสิน
         display ให้ (docs/conventions/unlayered-css-beats-utilities.md คลาสเดียวกัน)
         ค่า display จึงมาจาก `className` ที่เดียวเสมอ ค่าตั้งต้น = inline-flex */
      className={`bg-light shrink-0 items-center gap-0.5 rounded-full p-1 ${className}`}
      role="group"
      aria-label={t.inbox.threadAutoReplyTitle}
    >
      {OPTIONS.map((o) => {
        const active = value === o.on
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={active}
            disabled={busy}
            onClick={() => pick(o.on)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium disabled:opacity-60 ${
              active ? 'bg-card text-primary-ink font-semibold shadow-sm' : 'text-default-600'
            }`}
          >
            <Icon icon={o.icon} className="shrink-0 text-base" aria-hidden="true" />
            {t.inbox[o.key]}
          </button>
        )
      })}
    </div>
  )
}
