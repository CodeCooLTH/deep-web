/**
 * appointment-card — การ์ดสรุปนัดหมายแบบ Generic Template ของ Messenger/Instagram
 * (ส่วนขยาย 00024, 2026-08-11)
 *
 * Base: ./product-card.ts — โครง payload/การตัดข้อความชุดเดียวกัน ต่างที่ **มีปุ่ม**
 *
 * ทำไมการ์ดนี้มีปุ่มแต่การ์ดสินค้าไม่มี: สินค้าไม่มีหน้าสาธารณะรายชิ้นให้ลิงก์ไป ส่วนนัดมี
 * `/o/{token}` ซึ่งลูกค้ากด "ยืนยันนัด"/"ขอเลื่อนนัด" ได้จริงอยู่แล้วตั้งแต่ 00024 — ปุ่มนี้คือ
 * ทางเข้าตัวแรกของหน้านั้น (ก่อนหน้านี้ไม่มีเส้นทางไหนพาลูกค้าไปถึงเลย)
 *
 * เพดานจากเอกสาร Messenger (ยืนยัน 2026-08-11 — ห้ามแก้ตัวเลขจากความจำ):
 *   elements ≤ 10 · title ≤ 80 · subtitle ≤ 80 · ปุ่ม ≤ 3 ต่อ element
 * IG ใช้โครงเดียวกันเป๊ะ
 *
 * ข้อบังคับ: pure — คืน payload object ล้วน ไม่ยิง HTTP (ผู้ส่งคือ graph.ts)
 */

import type { AppointmentSummary } from '../appointment-summary'
import { META_SUBTITLE_MAX, META_TITLE_MAX, truncateForMeta } from './product-card'

/**
 * ป้ายบนปุ่ม — **ต้องเป็นคำเดียวกับ Flex ของ LINE และกับปุ่มที่ปลายทาง**
 *
 * 🛑 แก้ 2026-08-12 (impeccable clarify): เดิมเขียน "ดูรายละเอียดนัด" ต่างจาก LINE ที่เขียน
 * "ยืนยันนัด" — ปุ่มเดียวกัน ปลายทางเดียวกัน แต่สัญญาคนละอย่างตามช่องทางที่ลูกค้าบังเอิญใช้
 * และเหตุผลที่เคยเขียนไว้ ("เราไม่ได้คุมหน้าปลายทาง") **ผิด** — ปลายทางคือ `/o/{token}` ของเราเอง
 * ซึ่งมีปุ่ม "ยืนยันนัด" อยู่แล้ว (`(marketing)/o/[token]/AppointmentCard.tsx`) ⇒ คำนี้คือคำที่
 * ลูกค้าจะเห็นซ้ำตอนถึงที่หมาย ไม่ใช่คำที่สัญญาเกินจริง
 */
const BUTTON_TITLE = 'ยืนยันนัด'

/**
 * payload ของ `message.attachment` ที่พร้อมยิงเข้า Send API
 *
 * 🛑 **ไม่ใส่คีย์ `image_url` เลย** — การ์ดนัดไม่มีรูปโดยธรรมชาติ และการส่งค่าว่างทำให้ Meta
 * ตี payload เป็นรูปผิดแล้วปฏิเสธทั้งข้อความ (บทเรียนเดียวกับการ์ดสินค้าที่ไม่มีรูป)
 *
 * @param url ลิงก์ `/o/{token}` — Meta รับเฉพาะ absolute URL
 */
export function buildMetaAppointmentCard(
  summary: AppointmentSummary,
  url: string,
): Record<string, unknown> {
  return {
    type: 'template',
    payload: {
      template_type: 'generic',
      elements: [
        {
          title: truncateForMeta(summary.title, META_TITLE_MAX),
          // subtitle มีบรรทัดเดียว — `compact` ถูกออกแบบมาให้เป็น "วันเวลา · บริการ" พอดี
          // ส่วนชื่อ/เบอร์/ยอดเงินอยู่ในข้อความ `text` ที่ส่งคู่กันเสมอ (AC-APS-20)
          subtitle: truncateForMeta(summary.compact, META_SUBTITLE_MAX),
          buttons: [{ type: 'web_url', url, title: BUTTON_TITLE }],
        },
      ],
    },
  }
}
