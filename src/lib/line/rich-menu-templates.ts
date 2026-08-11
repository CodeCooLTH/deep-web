/**
 * rich-menu-templates — ชุดปุ่มสำเร็จรูปต่อประเภทร้าน (feature 00045, มติ D-RM-1)
 *
 * ข้อบังคับ: pure — ห้าม import prisma/fetch
 *
 * 🛑 **BR-RM-03: ห้ามมีปุ่มที่ปลายทางยังไม่ทำงาน** ทุกปุ่มในไฟล์นี้ต้องตอบได้ว่า "ลูกค้ากดแล้วเกิดอะไร"
 * บนโค้ดที่อยู่บน prod แล้ว — ปุ่มที่กดแล้วเงียบหายเสียความเชื่อมั่นทั้งเมนู ไม่ใช่แค่ปุ่มนั้น
 * (บทเรียนตรงจาก retro 2026-08-11 C-3: เปิด backend ไปโดยไม่มีปุ่มไหนเรียก)
 *
 * 🛑 **BR-RM-06 / HR16: คำที่มีนิยามอยู่แล้วต้องดึงจากคลังคำเดิม** (`ORDER_VOCAB`) ห้ามพิมพ์ซ้อนใหม่
 * ส่วนคำที่เป็นของฟีเจอร์นี้เองล้วน ๆ (เช่น "คุยกับแอดมิน") นิยามที่นี่ที่เดียว
 */

import { ORDER_VOCAB } from '@/lib/seller-menu'
import type { ShopVertical } from '@/lib/lodging'
import type { RichMenuAction, RichMenuButton } from './rich-menu'

/** ปุ่มในเทมเพลต — `requiresPublicUrl` = ปุ่มนี้ต้องมีหน้าร้านสาธารณะถึงจะใส่ได้ (TC-21) */
export type RichMenuTemplateButton = Omit<RichMenuButton, 'action'> & {
  action: RichMenuAction | { type: 'uri'; uri: '__PUBLIC_URL__' }
  requiresPublicUrl?: true
}

export type RichMenuTemplate = {
  key: string
  vertical: ShopVertical
  /** ชื่อชุดที่ผู้ขายเห็นตอนเลือก */
  title: string
  chatBarText: string
  buttons: RichMenuTemplateButton[]
}

/**
 * ประกอบ `postback.data`
 *
 * 🛑 ต้องมี `src=rm` เสมอ — เป็นตัวเดียวที่แยก "ลูกค้าแตะปุ่มบนเมนู" ออกจาก "ลูกค้าแตะปุ่มบนการ์ด"
 * ซึ่งเป็นข้อมูลที่ FR-RM-08 ต้องใช้วัดผล และ `describeLinePostback()` ที่มีอยู่แล้วอ่าน `label`
 * กับ `action` เป็น query string อยู่แล้ว จึงไม่ต้องแก้ตัวรับเลย
 */
export function richMenuPostbackData(action: string, label: string): string {
  return new URLSearchParams({ src: 'rm', action, label }).toString()
}

const AGENT_BUTTON: RichMenuTemplateButton = {
  key: 'agent',
  label: 'คุยกับแอดมิน',
  // ใช้ `message` ไม่ใช่ `postback` โดยตั้งใจ — ข้อความจะขึ้นในห้องแชทฝั่งลูกค้าด้วย ลูกค้าจึงเห็นเอง
  // ว่า "ฉันส่งอะไรไป" ต่างจาก postback ที่ฝั่งลูกค้าเงียบสนิทและดูเหมือนกดแล้วไม่มีอะไรเกิดขึ้น
  action: { type: 'message', text: 'ขอคุยกับแอดมินครับ/ค่ะ' },
}

/**
 * ปุ่มเลือกวันเวลา — ปลายทางคือ **บับเบิลในเธรดที่ผู้ขายเห็น** (ผ่าน `describeLinePostback`
 * ซึ่งแสดงค่าที่ลูกค้าเลือกต่อท้ายให้ด้วย) ไม่ใช่การจองคิวอัตโนมัติ
 *
 * 🛑 ป้ายปุ่มจึงต้องเป็น "แจ้งเวลาที่สะดวก" ไม่ใช่ "จองคิว" — ปุ่มต้องสัญญาเท่าที่ระบบทำจริง
 * การแมป postback นี้เข้าระบบคิวงาน 00024 แบบจองให้เลย เป็นงานรอบถัดไป (ยังไม่มีตัวรับ)
 */
function datetimeButton(label: string): RichMenuTemplateButton {
  return {
    key: 'preferred_time',
    label,
    action: {
      type: 'datetimepicker',
      data: richMenuPostbackData('preferred_time', label),
      mode: 'datetime',
    },
  }
}

const TEMPLATES: RichMenuTemplate[] = [
  {
    key: 'online_sales_v1',
    vertical: 'ONLINE_SALES',
    title: 'ชุดร้านขายออนไลน์',
    chatBarText: 'เมนูลัด', // 7 code point
    buttons: [
      { key: 'catalog', label: 'ดูสินค้า', action: { type: 'uri', uri: '__PUBLIC_URL__' }, requiresPublicUrl: true },
      {
        key: 'order_status',
        // ปลายทาง: ระบบตอบสถานะเองด้วย reply token (มติ D-RM-3 / TFR-RM-06)
        label: 'เช็คสถานะพัสดุ',
        action: { type: 'postback', data: richMenuPostbackData('order_status', 'เช็คสถานะพัสดุ') },
      },
      // ปลายทาง: ingest location ของ 00025 ที่มีอยู่แล้ว — ที่อยู่เข้าเธรดเป็นข้อความที่ผู้ขายอ่านได้
      { key: 'address', label: 'ส่งที่อยู่จัดส่ง', action: { type: 'location' } },
      AGENT_BUTTON,
    ],
  },
  {
    key: 'service_queue_v1',
    vertical: 'SERVICE_QUEUE',
    title: 'ชุดร้านบริการ/คิวงาน',
    chatBarText: 'เมนูลัด',
    buttons: [
      { key: 'catalog', label: 'ดูบริการ', action: { type: 'uri', uri: '__PUBLIC_URL__' }, requiresPublicUrl: true },
      datetimeButton('แจ้งเวลาที่สะดวก'),
      AGENT_BUTTON,
    ],
  },
  {
    key: 'lodging_v1',
    vertical: 'LODGING',
    title: 'ชุดบ้านพัก',
    chatBarText: 'เมนูลัด',
    buttons: [
      { key: 'catalog', label: 'ดูห้องพัก', action: { type: 'uri', uri: '__PUBLIC_URL__' }, requiresPublicUrl: true },
      datetimeButton('แจ้งวันที่เข้าพัก'),
      AGENT_BUTTON,
    ],
  },
]

export function templatesFor(vertical: ShopVertical): RichMenuTemplate[] {
  return TEMPLATES.filter((t) => t.vertical === vertical)
}

export function findTemplate(key: string): RichMenuTemplate | null {
  return TEMPLATES.find((t) => t.key === key) ?? null
}

/** ใช้ในเทสเท่านั้น — วนตรวจทุกเทมเพลตพร้อมกัน (TC-13/TC-20) */
export function allTemplates(): RichMenuTemplate[] {
  return TEMPLATES
}

/**
 * เติมค่าจริงของร้านลงเทมเพลต แล้ว **ตัดปุ่มที่เติมไม่ได้ทิ้ง** (TC-21)
 *
 * 🛑 ตัดทิ้ง ไม่ใช่ปล่อยให้เป็นลิงก์เสีย — ร้านที่ยังไม่มี username/slug จะได้เมนูที่ปุ่มน้อยลง 1 ปุ่ม
 * ซึ่งใช้งานได้ทั้งเมนู ดีกว่าเมนูครบปุ่มที่มีปุ่มหนึ่งพาไป 404
 */
export function resolveTemplateButtons(
  tpl: RichMenuTemplate,
  ctx: { publicUrl: string | null },
): RichMenuButton[] {
  const out: RichMenuButton[] = []
  for (const b of tpl.buttons) {
    if (b.requiresPublicUrl) {
      // 🛑 https เท่านั้น (BR-RM-07) — LINE ปฏิเสธ http ทั้งข้อความ ไม่ใช่แค่ปุ่มนั้น
      if (!ctx.publicUrl || !ctx.publicUrl.startsWith('https://')) continue
      out.push({ key: b.key, label: b.label, action: { type: 'uri', uri: ctx.publicUrl } })
      continue
    }
    out.push({ key: b.key, label: b.label, action: b.action as RichMenuAction })
  }
  return out
}

/**
 * คำเรียก "คำสั่งซื้อ" ตามประเภทร้าน — ใช้ตอนประกอบข้อความตอบสถานะ (TFR-RM-06)
 * ดึงจาก `ORDER_VOCAB` ที่เดียว ห้ามพิมพ์คำใหม่ (HR16)
 */
export function orderNounFor(vertical: ShopVertical): string {
  return ORDER_VOCAB[vertical]?.noun ?? ORDER_VOCAB.ONLINE_SALES!.noun
}
