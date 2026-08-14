'use client'

/**
 * ThreadChipStrip — ยุบ 3 แถบใต้หัวเธรดให้เหลือ **แถวชิปแถวเดียว** กดชิปกางรายละเอียดทีละอัน
 * (แบบ A ในม็อกอัพ `docs/superpowers/specs/2026-08-14-chat-mobile-topbar-prototype.html`
 *  user เลือกเอง 2026-08-14)
 *
 * ═══ ทำไมต้องมีตัวนี้ ═══
 * บน `<1280px` พื้นที่เหนือข้อความแรกเคยมีได้ถึง 4 ชั้น: หัวเธรด ~61px + ThreadContextBar ~36px
 * + ThreadStatusBar ~40px + OrderProgressBar ~40px
 *
 * 🛑 และ 3 แถบล่าง **เคยผ่านรอบ "ยุบเหลือบรรทัดเดียว" มาแล้วคนละรอบ** (ThreadStatusBar 08-02 ·
 * OrderProgressBar 08-05 · ThreadContextBar 08-11) โดยแต่ละตัวเขียน `Base: ThreadStatusBar`
 * ก็อปโครงกันมา ⇒ ผลรวมคือ **3 แถวหน้าตาเหมือนกันวางเรียงกัน แต่คนละความหมาย**
 * แต่ละรอบแก้ความสูงของ *ตัวเอง* ได้จริง แต่ไม่มีใครมองผลรวม — นี่คือสิ่งที่รอบนี้แก้
 *
 * ═══ ข้อห้ามเดิมที่ยังต้องเคารพ (ยกมาจาก ThreadContextBar ซึ่งเขียนไว้ชัด 3 ข้อ) ═══
 * ข้อห้ามเหล่านั้นเกิดตอนที่ "บริบท" กับ "คำเตือน" เป็น *คนละแถบ* — พอรวมเป็นแถวเดียวแล้ว
 * เจตนาเดิมยังอยู่ครบ แค่ย้ายที่บังคับ:
 *   1. "บริบทต้องพื้นโปร่ง ห้าม bg-{semantic}/15" → ตอนนี้บังคับที่ **โทนของชิป** (`context` =
 *      ขอบจาง พื้นโปร่ง) ไม่ใช่ที่พื้นของแถบ. เจตนาเดิมคือ "อย่าให้บริบทดูเหมือนของที่ต้องรีบ
 *      จัดการ" ซึ่งยังจริงและยังทำได้ — ชิปคำเตือนมีพื้นสี ชิปบริบทไม่มี วางเรียงกันก็ยังแยกออก
 *   2. "แถวเต็มความกว้างติดหัวแชท ไม่ใช่การ์ดลอยที่มี padding รอบ" → แถวชิปนี้ติดหัวแชท
 *      (`border-b`) ตามเดิม. ส่วนที่ ThreadStatusBar เคยเป็น "การ์ดลอย" เพื่อให้คำเตือนดูเป็น
 *      ของแปลกปลอม ย้ายไปอยู่ที่ **การ์ดในตัวกาง** ซึ่งยังเป็นกล่องสีของมันเองทุกประการ
 *   3. "ไม่ยก action ขึ้นบรรทัดยุบ (ลิงก์ดูโฆษณาพาออกนอกแอป งบพื้นที่ 320px ไม่พอ)" → ยังไม่ยก
 *      **ยกเว้น** action ของสถานะที่ ThreadStatusBar เคยยกขึ้นมาโดยตั้งใจ (เช่น "ให้บอทตอบต่อ")
 *      ซึ่งมีเหตุผลตรงข้ามกันคนละเรื่อง: ตัวนั้นคืองานที่เคยกดได้ทันที การยุบจึงห้ามเพิ่มจำนวนคลิก
 *      → `action` ของชิปตัวแรกที่มี action เท่านั้นที่ถูกยก และอยู่ **ท้ายแถว** ไม่ใช่ในชิป
 *
 * ═══ กติกาอื่น ═══
 * - กางได้ทีละอัน — 3 แถบเดิมกางพร้อมกันได้ ซึ่งคือสภาพที่ผู้ใช้บ่นตั้งแต่ต้น
 * - ยุบเป็นค่าตั้งต้นเสมอ ไม่จำสถานะกาง (เหมือนทั้ง 3 ตัวเดิม) — เป็นทางลัดดูสถานะ ไม่ใช่ alert
 * - แถวเลื่อนแนวนอนได้เมื่อชิปเยอะ (`overflow-x-auto`) — ต่างจากแถบแท็บของแผงลูกค้าที่ user
 *   สั่งห้ามเลื่อนเพราะจำนวนแท็บ **คงที่ 4 ตัว**; ชิปที่นี่จำนวนไม่คงที่ (0–5+) การบังคับให้ fit
 *   แปลว่าต้องตัดคำจนอ่านไม่ออกในเคสที่มีหลายอัน
 * - ชิปไม่มีอะไรเลย → คืน null ทั้งแถว (ไม่กินความสูงแม้แต่พิกเซลเดียว)
 *
 * Base: โครงยุบ/กาง + badge +N + aria-expanded ยกมาจาก ./ThreadStatusBar.tsx
 *       ทรงชิป (rounded-full + ไอคอนนำ + truncate) ยกจาก StageChips ใน orders/components/OrdersList.tsx
 */

import { useState, type ReactNode } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'

export type ThreadChipTone = 'danger' | 'warning' | 'info' | 'order' | 'context'

export interface ThreadChipItem {
  key: string
  tone: ThreadChipTone
  /** tabler icon — ใช้เมื่อไม่มี thumbUrl */
  icon: string
  /** ภาพย่อ 16px (รูปโฆษณา/ปกโพสต์) — null = ใช้ icon */
  thumbUrl?: string | null
  /** คำบนชิป — สั้นที่สุดเท่าที่ยังบอกได้ว่าคืออะไร (ตัดท้ายด้วย truncate ถ้าเกิน) */
  short: string
  /** เนื้อหาเต็มตอนกาง — JSX ก้อนเดิมของแต่ละแถบ ยกมาทั้งดุ้น ไม่แก้เนื้อใน */
  detail: ReactNode
  /** ปุ่มที่เคยกดได้ทันทีก่อนยุบ (เช่น "ให้บอทตอบต่อ") — ยกขึ้นท้ายแถวถ้าเป็นตัวแรกที่มี */
  action?: ReactNode
}

/**
 * ── ชนิดของ "แหล่งที่มา" ที่ไหลเข้าแถวชิป ──────────────────────────────────────
 * ย้ายมาจาก ThreadStatusBar.tsx / ThreadContextBar.tsx ตอนที่ทั้งสองถูกยุบเข้าแถวนี้ (2026-08-14)
 * — ตัว component ถูกลบทิ้งเพราะไม่มีใคร render แล้ว แต่ **ชนิดของรายการยังต่างกันจริง** และ
 * ChatThread ยังประกอบทีละกลุ่มด้วยเหตุผลคนละชุด จึงคงไว้เป็นสองชนิด ไม่ยุบเป็นอันเดียว
 */

/** คำเตือนระดับห้อง — โทนสื่อความรุนแรง และมี `action` ที่เคยกดได้ทันทีก่อนยุบ */
export interface ThreadStatusItem {
  key: string
  tone: 'danger' | 'warning' | 'info'
  icon: string
  short: string
  detail: ReactNode
  action?: ReactNode
}

/** ที่มาของแชท (ร้าน/โฆษณา/คอมเมนต์) — ไม่มีโทน เพราะเป็นบริบท ไม่ใช่คำเตือน */
export interface ThreadContextItem {
  key: string
  thumbUrl: string | null
  icon: string
  /** คำนำที่บอก **ประเภท** ของที่มา ("จากโฆษณา"/"จากคอมเมนต์") — null = เป็นประโยคสมบูรณ์ในตัวเอง */
  label: string | null
  short: string
  detail: ReactNode
}

/**
 * class ต่อโทน — เขียนเต็มคำ ไม่ประกอบสตริง เพราะ Tailwind สแกนแบบ static
 *
 * 🛑 โทนที่มีพื้นสีต้องใช้ `-ink` เสมอ: สีเต็มบนพื้นจาง 15% ตกเกณฑ์คอนทราสต์ทุกโทน
 * (warning = 1.53:1) — กติกานี้ยกมาจาก ThreadStatusBar ห้ามลดทอน
 * `context` เป็นตัวเดียวที่พื้นโปร่ง = ข้อห้ามข้อ 1 ของ ThreadContextBar ที่ย้ายมาบังคับตรงนี้
 */
const TONE_CLS: Record<ThreadChipTone, string> = {
  danger: 'bg-danger/15 text-danger-ink',
  warning: 'bg-warning/15 text-warning-ink',
  info: 'bg-info/15 text-info-ink',
  order: 'bg-primary/15 text-primary-ink',
  context: 'border-default-300 text-default-700 border bg-transparent',
}

export default function ThreadChipStrip({ items }: { items: ThreadChipItem[] }) {
  const t = useT()
  const [openKey, setOpenKey] = useState<string | null>(null)

  if (items.length === 0) return null

  const open = items.find((i) => i.key === openKey) ?? null
  // action ยกได้ตัวเดียว — ตัวแรกที่มี (ลำดับใน items = ลำดับความสำคัญ caller เป็นคนเรียง)
  const lifted = items.find((i) => i.action)

  return (
    <div className="border-default-200 border-b">
      {/* แถวชิป — ติดหัวแชท ไม่มี padding รอบแบบการ์ดลอย (ข้อห้ามข้อ 2 ของ ThreadContextBar)
          `overflow-x-auto` เปล่า ๆ ตาม precedent เดียวในรีโป (EmojiPicker.tsx:432) — ไม่ประดิษฐ์
          คลาสซ่อน scrollbar ขึ้นมาใหม่ (`scrollbar-none` ไม่มีอยู่จริงในธีมนี้ เช็คแล้ว) */}
      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto px-4 py-2">
        {items.map((it) => {
          const isOpen = it.key === openKey
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => setOpenKey(isOpen ? null : it.key)}
              aria-expanded={isOpen}
              className={`${TONE_CLS[it.tone]} flex max-w-52 shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                isOpen ? 'ring-default-400 ring-1' : ''
              }`}
            >
              {it.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.thumbUrl} alt="" className="size-4 shrink-0 rounded object-cover" />
              ) : (
                <Icon icon={it.icon} className="shrink-0 text-sm" aria-hidden="true" />
              )}
              <span className="truncate">{it.short}</span>
              <Icon
                icon={isOpen ? 'chevron-up' : 'chevron-down'}
                className="shrink-0 text-sm opacity-70"
                aria-hidden="true"
              />
            </button>
          )
        })}

        {/* งานที่เคยกดได้ทันทีก่อนยุบ — อยู่ท้ายแถว ไม่ใช่ในชิป (ชิปคือปุ่มกาง กดสองอย่างในปุ่มเดียวไม่ได้) */}
        {lifted?.action ? <span className="ms-auto shrink-0 ps-1">{lifted.action}</span> : null}
      </div>

      {/* ตัวกาง — ทีละอัน. การ์ดของแต่ละแถบยังเป็นกล่องสีของตัวเองเหมือนเดิมทุกประการ */}
      {open ? (
        <div className="space-y-2 px-4 pb-3">
          {open.detail}
          <button
            type="button"
            onClick={() => setOpenKey(null)}
            className="text-default-700 flex items-center gap-1 text-xs font-medium"
          >
            <Icon icon="chevron-up" className="text-sm" />
            {t.inbox.threadChipCollapse}
          </button>
        </div>
      ) : null}
    </div>
  )
}
