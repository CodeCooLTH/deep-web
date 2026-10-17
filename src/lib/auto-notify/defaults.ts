// feature 00078 — ค่าตั้งต้นของเทมเพลตต่อชนิด + ตัวอย่าง 3 แบบ (ปุ่ม "เริ่มจากตัวอย่าง") · pure module
// ค่าตั้งต้นของ ORDER_SUMMARY/TRACKING = ข้อความเดิมของปุ่มมือทุกตัวอักษร (ร้านที่ไม่แก้ได้ผลเหมือนเดิม — BR-CS-C08)
import {
  APPOINTMENT_SUMMARY_LABEL,
  APPOINTMENT_SUMMARY_TITLE,
  DEFAULT_APPOINTMENT_CLOSING,
} from '@/lib/appointment-summary'
import type { AutoNotifyKind } from './ledger-constants'

/**
 * ORDER_SUMMARY: `${noun}: ${title}\nยอดสุทธิ ${total}\n${url}` จาก messages/route.ts (การ์ด ORDER, linkText)
 * TRACKING: `trackingMessage('ISHIP')` ใน chat-shipment-panel.ts — บรรทัดขนส่งว่าง ("อื่นๆ"/ไม่มี) ถูกตัดด้วยกติกา renderer
 * SERVICE_BOOKED: สรุปนัดเดิม (buildAppointmentSummary) — ไม่มีเบอร์โทร (PII ไม่อยู่ในชุดตัวแปร) และไม่มีบรรทัดชื่อบริการ·ช่าง แยก
 * SERVICE_STARTED/CLOSED: ร่างจาก BRD FR-CS-26/27 (รอ user เคาะถ้อยคำ)
 */
export const DEFAULT_TEMPLATES: Record<AutoNotifyKind, string> = {
  ORDER_SUMMARY: '{คำเรียกรายการ}: {รายการสินค้า}\nยอดสุทธิ {ยอดสุทธิ}\n{ลิงก์คำสั่งซื้อ}',
  TRACKING: 'จัดส่งด้วย {ขนส่ง}\nเลขติดตามพัสดุ: {เลขพัสดุ}\nติดตามพัสดุ: {ลิงก์ติดตามพัสดุ}',
  SERVICE_BOOKED: [
    APPOINTMENT_SUMMARY_TITLE,
    `${APPOINTMENT_SUMMARY_LABEL.when}: {วันเวลานัด}`,
    `${APPOINTMENT_SUMMARY_LABEL.service}: {บริการ}`,
    `${APPOINTMENT_SUMMARY_LABEL.customer}: {ชื่อลูกค้า}`,
    `${APPOINTMENT_SUMMARY_LABEL.amount}: {ยอดรวม}`,
    `${APPOINTMENT_SUMMARY_LABEL.deposit}: {ยอดมัดจำที่ตกลงไว้}`,
    '',
    DEFAULT_APPOINTMENT_CLOSING,
    '{ลิงก์งาน}',
  ].join('\n'),
  SERVICE_STARTED: 'ร้านเริ่มงาน {บริการ} แล้วเมื่อ {เวลาเริ่มงาน}\nดูรายละเอียด {ลิงก์งาน}',
  SERVICE_CLOSED: 'งาน {บริการ} เสร็จเรียบร้อยเมื่อ {เวลาปิดงาน}\nดูรายละเอียดและยืนยันรับบริการ {ลิงก์งาน}',
}

export interface TemplateExample {
  id: 'SHORT' | 'POLITE' | 'FRIENDLY'
  label: string
  body: string
}

export const TEMPLATE_EXAMPLES: Record<AutoNotifyKind, readonly TemplateExample[]> = {
  ORDER_SUMMARY: [
    { id: 'SHORT', label: 'สั้นกระชับ', body: '{คำเรียกรายการ} {เลขคำสั่งซื้อ}\n{รายการสินค้า}\nยอดสุทธิ {ยอดสุทธิ}\n{ลิงก์คำสั่งซื้อ}' },
    {
      id: 'POLITE',
      label: 'สุภาพเป็นทางการ',
      body: 'เรียนคุณ{ชื่อลูกค้า}\n{ชื่อร้าน}ได้รับ{คำเรียกรายการ}ของท่านเรียบร้อยแล้ว\nรายการ: {รายการสินค้า}\nยอดสุทธิ {ยอดสุทธิ}\nตรวจสอบสถานะได้ที่ {ลิงก์คำสั่งซื้อ}\nขอบคุณที่ใช้บริการ',
    },
    {
      id: 'FRIENDLY',
      label: 'เป็นกันเอง',
      body: 'สวัสดีค่ะคุณ{ชื่อลูกค้า}\nรับออเดอร์แล้วนะคะ {รายการสินค้า}\nรวม {ยอดสุทธิ}\nดูสถานะได้ที่นี่เลย {ลิงก์คำสั่งซื้อ}',
    },
  ],
  TRACKING: [
    { id: 'SHORT', label: 'สั้นกระชับ', body: '{ขนส่ง} เลขพัสดุ {เลขพัสดุ}\n{ลิงก์ติดตามพัสดุ}' },
    {
      id: 'POLITE',
      label: 'สุภาพเป็นทางการ',
      body: 'เรียนคุณ{ชื่อลูกค้า}\n{ชื่อร้าน}ได้จัดส่งสินค้าของท่านแล้ว\nขนส่ง: {ขนส่ง}\nเลขติดตามพัสดุ: {เลขพัสดุ}\nติดตามพัสดุ: {ลิงก์ติดตามพัสดุ}',
    },
    {
      id: 'FRIENDLY',
      label: 'เป็นกันเอง',
      body: 'ของออกจากร้านแล้วนะคะคุณ{ชื่อลูกค้า}\nส่งด้วย {ขนส่ง} เลข {เลขพัสดุ}\nตามได้ที่ {ลิงก์ติดตามพัสดุ}',
    },
  ],
  SERVICE_BOOKED: [
    { id: 'SHORT', label: 'สั้นกระชับ', body: 'นัดหมาย {บริการ}\n{วันเวลานัด}\n{ลิงก์งาน}' },
    {
      id: 'POLITE',
      label: 'สุภาพเป็นทางการ',
      body: 'เรียนคุณ{ชื่อลูกค้า}\n{ชื่อร้าน}ขอยืนยันนัดหมาย\nบริการ: {บริการ}\nวันและเวลา: {วันเวลานัด}\nยอดรวม: {ยอดรวม}\nมัดจำที่ตกลงไว้: {ยอดมัดจำที่ตกลงไว้}\nรายละเอียด {ลิงก์งาน}',
    },
    {
      id: 'FRIENDLY',
      label: 'เป็นกันเอง',
      body: 'จองคิวเรียบร้อยค่ะคุณ{ชื่อลูกค้า}\n{บริการ} {วันเวลานัด}\nเจอกันนะคะ {ลิงก์งาน}',
    },
  ],
  SERVICE_STARTED: [
    { id: 'SHORT', label: 'สั้นกระชับ', body: 'เริ่มงาน {บริการ} แล้ว\n{ลิงก์งาน}' },
    {
      id: 'POLITE',
      label: 'สุภาพเป็นทางการ',
      body: 'เรียนคุณ{ชื่อลูกค้า}\n{ชื่อร้าน}ขอแจ้งว่าได้เริ่มงาน {บริการ} เมื่อ {เวลาเริ่มงาน}\nติดตามรายละเอียดได้ที่ {ลิงก์งาน}',
    },
    {
      id: 'FRIENDLY',
      label: 'เป็นกันเอง',
      body: 'เริ่มทำ {บริการ} ให้คุณ{ชื่อลูกค้า}แล้วนะคะ\nดูความคืบหน้า {ลิงก์งาน}',
    },
  ],
  SERVICE_CLOSED: [
    { id: 'SHORT', label: 'สั้นกระชับ', body: '{บริการ} เสร็จแล้ว\n{ลิงก์งาน}' },
    {
      id: 'POLITE',
      label: 'สุภาพเป็นทางการ',
      body: 'เรียนคุณ{ชื่อลูกค้า}\n{ชื่อร้าน}ได้ดำเนินการ {บริการ} เสร็จเรียบร้อยเมื่อ {เวลาปิดงาน}\nกรุณาตรวจสอบและยืนยันรับบริการที่ {ลิงก์งาน}\nขอบคุณที่ใช้บริการ',
    },
    {
      id: 'FRIENDLY',
      label: 'เป็นกันเอง',
      body: 'เสร็จแล้วค่ะคุณ{ชื่อลูกค้า}\n{บริการ} เรียบร้อยเมื่อ {เวลาปิดงาน}\nกดยืนยันรับบริการได้ที่ {ลิงก์งาน}',
    },
  ],
}
