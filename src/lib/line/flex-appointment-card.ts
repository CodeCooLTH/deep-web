/**
 * flex-appointment-card — การ์ดสรุปนัดหมายที่ลูกค้าเห็นในแอป LINE (ส่วนขยาย 00024, 2026-08-11)
 *
 * Base: ./flex-order-card.ts — โครง bubble/สี/ปุ่มชุดเดียวกันทุกประการ ต่างแค่เนื้อหา
 *
 * ข้อบังคับเดียวกับไฟล์พี่น้อง: **pure** — รับค่าที่ประกอบแล้วจาก `buildAppointmentSummary()`
 * คืน JSON ล้วน ห้ามรู้จัก prisma/storage/เงิน/วันเวลา (HR16: ทั้งการฟอร์แมตเงินและสูตรช่วงเวลา
 * นัดมี SSOT ของตัวเองอยู่แล้ว ถ้าไฟล์นี้คำนวณเอง ค่าบนการ์ดที่ลูกค้าเห็นจะเพี้ยนจากหน้าจอร้าน
 * ได้โดยไม่มีอะไรฟ้อง)
 *
 * สี: ยึด `.impeccable/design.json` ฝั่ง **ผู้ซื้อ** เพราะการ์ดนี้ไปโผล่ในแอป LINE ของลูกค้า
 * ไม่ใช่ในหน้าจอร้าน (ห้ามใช้ paces-primary น้ำเงินซึ่งเป็นสีของ surface ฝั่งผู้ขาย — HR7)
 */

import type { AppointmentSummary } from '../appointment-summary'

/** #7367F0 — `extensions.colorMeta.primary.canonical` (แบรนด์ Deep ฝั่งผู้ซื้อ) */
const BRAND = '#7367F0'
/** #2F2B3D — Ink Plum ไม่ใช่ดำสนิท (design.json: ห้ามใช้ #000) */
const INK = '#2F2B3D'
/** #808390 — slate สำหรับป้ายกำกับที่ไม่ใช่เนื้อหาหลัก */
const SLATE = '#808390'

/** LINE จำกัด altText ที่ 1500 ตัวอักษร — ตัดที่ฝั่งเราเอง ไม่ปล่อยให้ LINE ปฏิเสธทั้งข้อความ */
const ALT_TEXT_MAX = 1500

/** ป้ายบนปุ่มของ action object จำกัด 20 ตัวอักษร — เกินแล้ว LINE ตีข้อความตกทั้งใบ */
const BUTTON_LABEL = 'ยืนยันนัด'

export interface LineFlexMessage {
  altText: string
  contents: Record<string, unknown>
}

/**
 * ประกอบ bubble ของการ์ดสรุปนัด
 *
 * 🛑 `altText` ไม่ใช่ของประดับ — มันคือสิ่งเดียวที่ลูกค้าเห็นใน **รายการแชทและ notification**
 * (ตัว flex ไม่ถูกเรนเดอร์ในสองที่นั้น) ถ้าเขียนว่า "ข้อความจากร้าน" ลอย ๆ ลูกค้าจะไม่มีทางรู้
 * ว่านัดวันไหนจนกว่าจะเปิดห้องแชท — ต้องมีทั้งวันและเวลาอยู่ในนั้น
 *
 * @param url ลิงก์ `/o/{token}` — **ต้องเป็น https** (LINE ปฏิเสธ uri action ที่ไม่ใช่ https)
 *   ผู้เรียกเป็นคนเช็ค ไม่ใช่ที่นี่ (เส้นทางถอยคือ "ส่ง text ทั้งก้อน" ซึ่งอยู่นอกไฟล์นี้)
 */
export function buildLineFlexAppointmentCard(
  summary: AppointmentSummary,
  url: string,
): LineFlexMessage {
  const [head, ...rest] = summary.lines

  const bodyContents: Record<string, unknown>[] = [
    { type: 'text', text: summary.title, size: 'sm', color: SLATE },
  ]

  // บรรทัดแรก (วันและเวลา) เป็นพาดหัว ไม่ใช่แถว key/value — มันคือสิ่งเดียวที่ลูกค้าต้องอ่านให้ได้
  // แม้เหลือบมองผ่าน ๆ. `head` มีเสมอในทางปฏิบัติ (`when` ปิดไม่ได้) แต่ยังกันไว้เผื่อผู้เรียก
  // ส่ง summary ที่ว่างมา — การ์ดที่ไม่มีอะไรเลยดีกว่าการ์ดที่ crash ทั้งข้อความ
  if (head) {
    bodyContents.push({
      type: 'text',
      text: head.value,
      weight: 'bold',
      size: 'lg',
      color: INK,
      wrap: true,
    })
  }

  if (rest.length > 0) {
    bodyContents.push({ type: 'separator', margin: 'lg' })
    for (const line of rest) {
      bodyContents.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'md',
        contents: [
          { type: 'text', text: line.label, size: 'sm', color: SLATE, flex: 2, gravity: 'top' },
          {
            type: 'text',
            text: line.value,
            size: 'sm',
            weight: 'bold',
            color: INK,
            align: 'end',
            wrap: true,
            flex: 3,
          },
        ],
      })
    }
  }

  if (summary.closing) {
    bodyContents.push({
      type: 'text',
      text: summary.closing,
      size: 'sm',
      color: SLATE,
      wrap: true,
      margin: 'lg',
    })
  }

  const altText = `${summary.title} ${summary.compact}`.trim().slice(0, ALT_TEXT_MAX)

  return {
    altText,
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyContents },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: BRAND,
            action: { type: 'uri', label: BUTTON_LABEL, uri: url },
          },
        ],
      },
    },
  }
}
