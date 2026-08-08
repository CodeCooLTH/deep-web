// order-profit-presentation.ts — แปลง OrderProfit → คำ/ไอคอน/โทนสี ที่ใช้บนหน้าจอ
//
// สกัดออกมาจาก OrderProfitCard.tsx (ux Design Spec 2026-08-08 §2) ตอนที่หน้ารายการออเดอร์
// ต้องแสดงตัวเลขชุดเดียวกันนี้ในที่แคบ ๆ ใต้คอลัมน์ยอด — ตรรกะ 6 สถานะห้ามมี 2 ชุด
//
// [สำคัญ] นี่คือ bug class ที่โปรเจกต์นี้เจอซ้ำหลายรอบแล้ว: ป้ายสถานะเดียวกันถูกเขียนแยกกัน
// ที่ตาราง/การ์ด/หน้า detail แล้ววันหนึ่งมีคนแก้ที่เดียว ผู้ใช้จึงเห็นออเดอร์ใบเดียวกันพูด
// คนละคำคนละสีในสองหน้าจอ โดยไม่มี tsc/grep ตัวไหนฟ้อง — ที่นี่คือที่เดียวที่ตัดสินเรื่องนี้
//
// [สำคัญ] ไฟล์นี้ตัดสินแค่ "จะพูดว่าอะไร" ไม่ได้ตัดสินว่า "ใครมีสิทธิ์เห็น" — การกั้นสิทธิ์
// ต้องเกิดที่ server ก่อนคำนวณ (ดูหัวไฟล์ order-profit.ts) ห้ามเรียกไฟล์นี้แล้วค่อยเลือกไม่ render

import { formatBaht, GROSS_PROFIT_FORMULA } from './format-money'
import type { OrderProfit } from './order-profit'

export type ProfitPresentation = {
  /** tabler icon name ผ่าน @/components/wrappers/Icon */
  icon: string
  label: string
  /** null = สถานะนี้ไม่มีตัวเลขให้แสดง (ยังไม่นับเป็นยอดขาย / เท่าทุนพอดี) */
  amount: string | null
  /** ประโยคเต็มที่อธิบายว่าตัวเลขข้างบนเชื่อได้แค่ไหน — ที่แคบให้ยัดใส่ title/aria-label */
  note: string
  tone: 'success' | 'danger' | 'warning' | 'neutral'
}

export const PROFIT_TONE: Record<ProfitPresentation['tone'], { plate: string; text: string }> = {
  success: { plate: 'bg-success/15', text: 'text-success-ink' },
  danger: { plate: 'bg-danger/15', text: 'text-danger-ink' },
  warning: { plate: 'bg-warning/15', text: 'text-warning-ink' },
  neutral: { plate: 'bg-default-100', text: 'text-default-800' },
}

export function presentOrderProfit(profit: OrderProfit | null, orderNoun: string): ProfitPresentation {
  // สถานะ ค — ยังไม่นับเป็นยอดขาย: ไม่แสดงตัวเลขเลย ไม่ใช่แสดง 0
  // (ตัวเลขที่คำนวณตอนนี้อาจกลายเป็นเท็จถ้าออเดอร์ถูกยกเลิกทีหลัง)
  if (profit === null) {
    return {
      icon: 'clock',
      label: 'ยังไม่นับเป็นยอดขาย',
      amount: null,
      note: `กำไรจะคำนวณเมื่อลูกค้ายืนยันรับ${orderNoun}แล้ว`,
      tone: 'neutral',
    }
  }

  const { amount, hasMissingCost } = profit

  // สถานะ ข — ต้นทุนไม่ครบ: ตัวเลขที่ได้คือ "เพดานบน" ไม่ใช่กำไรจริง
  //
  // ห้ามใช้เขียวแม้ตัวเลขจะเป็นบวก — Verified-Means-Green: เขียวแปลว่า "ยืนยันแล้ว"
  // ตัวเลขที่คำนวณจากต้นทุนไม่ครบยังไม่มีสิทธิ์ใช้สีนั้น
  //
  // แยก 2 ทิศทางเพราะความแน่นอนต่างกันจริง: ถ้าเพดานบนยังติดลบอยู่ แปลว่าต่อให้ต้นทุน
  // ที่ยังไม่กรอกเป็นศูนย์ก็ยังขาดทุนแน่นอน = ข่าวร้ายที่ยืนยันแล้ว (danger)
  // ส่วนเพดานบนที่เป็นบวกยังบอกทิศทางไม่ได้เลย (warning)
  //
  // หมายเหตุคำ (มาจาก fc9d4e60 ตอนการ์ดหน้า detail เข้าโครง Paces): วลี "มีสินค้าที่ยัง
  // ไม่ตั้งต้นทุน" ถูกตัดออกจาก note เพราะย้ายไปเป็น badge ที่หัวการ์ดซึ่ง **กดไปแก้ได้จริง**
  // — note เหลือแต่ผลของมันต่อตัวเลข ไม่พูดซ้ำสองที่
  //
  // [สำคัญ] หน้ารายการยังไม่มี badge ตัวนั้น จึงเหลือ "ไม่เกิน"/"อย่างน้อย" + โทนเหลือง
  // เป็นตัวบอกความไม่แน่นอนแทน (ยังสื่อครบว่าเชื่อตัวเลขได้แค่ไหน แต่ยังไม่มีทางลัดไปแก้)
  if (hasMissingCost) {
    const negative = amount < 0
    return {
      icon: 'alert-triangle',
      // "ขั้นสูง" ถูกตัดทิ้ง — ในภาษาไทยบนหน้าจอมันแปลว่า advanced ไม่ใช่ "มากที่สุดที่เป็นไปได้"
      // (ที่อื่นในแอปก็ใช้ในความหมายนั้น) ใช้ "ไม่เกิน"/"อย่างน้อย" ซึ่งบอกขอบเขตตรง ๆ แทน
      label: negative ? 'ขาดทุนขั้นต้นอย่างน้อย' : 'กำไรขั้นต้นไม่เกิน',
      amount: formatBaht(amount),
      note: negative
        ? 'ยอดขาดทุนจริงอาจมากกว่านี้ · ยังไม่หักค่าใช้จ่ายร้าน'
        : 'กำไรจริงจะน้อยกว่านี้ · ยังไม่หักค่าใช้จ่ายร้าน',
      tone: negative ? 'danger' : 'warning',
    }
  }

  // สถานะ ง — ขาดทุนจริง (ต้นทุนครบ)
  if (amount < 0) {
    return {
      icon: 'trending-down',
      label: 'ขาดทุนขั้นต้นจากใบนี้',
      amount: formatBaht(amount),
      note: GROSS_PROFIT_FORMULA,
      tone: 'danger',
    }
  }

  // จุดคุ้มทุนพอดี — ไม่ใช่ "ผลบวกที่ยืนยันแล้ว" จึงไม่ใช้เขียว
  if (amount === 0) {
    return {
      // ลูกศรขึ้นกับค่า 0 เป็นสัญญาณที่ขัดตัวเลขของมันเอง
      icon: 'minus',
      label: 'เท่าทุนพอดี',
      amount: formatBaht(0),
      note: GROSS_PROFIT_FORMULA,
      tone: 'neutral',
    }
  }

  // สถานะ ก — กำไรจริง ต้นทุนครบ (กรณีเดียวที่ได้เขียว)
  return {
    icon: 'trending-up',
    label: 'กำไรขั้นต้นจากใบนี้',
    amount: formatBaht(amount),
    note: GROSS_PROFIT_FORMULA,
    tone: 'success',
  }
}
