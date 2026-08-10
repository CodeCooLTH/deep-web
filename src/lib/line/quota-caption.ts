// (S-14b, feature 00025 FR-LINE-06) — คำที่ผู้ขายเห็นข้างปุ่มส่งของเธรด LINE
//
// รวม "สองเรื่องที่ตัดสินร่วมกัน" ไว้ที่เดียว: ข้อความนี้ส่งฟรีไหม (หน้าต่าง reply) กับ โควตาเหลือ
// เท่าไหร่ — เพราะคำตอบที่ผู้ขายต้องการก่อนกดส่งมีคำตอบเดียว ไม่ใช่สองคำตอบวางข้างกัน
//
// 🛑 อยู่ที่นี่แทนที่จะเป็นเทอร์นารีใน JSX เพราะ `blocking` คือ boolean ตัวเดียวที่ปิดช่องพิมพ์ของ
// เธรด LINE ทั้งหมด — เขียนกลับด้านเมื่อไหร่ก็ยังผ่าน tsc/build/detector ทุกด่าน (สิ่งที่ผิดคือ
// ความหมาย ไม่ใช่รูปแบบ) ดู docs/conventions/ui-boolean-needs-a-testable-home.md

import type { LineQuotaLevel } from './quota'

export interface LineQuotaCaptionInput {
  /** หน้าต่างตอบฟรียังเปิดอยู่ไหม (จาก getLineReplyWindowState — ฝั่ง client ให้ใช้ค่าที่ tick แล้ว) */
  windowOpen: boolean
  type: 'limited' | 'unlimited' | 'unknown'
  level: LineQuotaLevel
  remaining: number | null
  total: number | null
  /** อ่านค่าล่าสุดจาก LINE ไม่สำเร็จ (กำลังใช้ค่าเก่า/ไม่มีค่าเลย) */
  stale: boolean
}

export interface LineQuotaCaption {
  /** จอแคบ (<640px) — สั้นที่สุดที่ยังเป็นประโยคอ่านออก ไม่ใช่ตัวย่อ */
  shortText: string
  fullText: string
  /** ผู้เรียกเป็นคนแปลงเป็นคลาสสีเอง — ไฟล์นี้ไม่รู้จัก Tailwind */
  tone: 'quiet' | 'neutral' | 'warning' | 'danger'
  /** 🛑 ปิดช่องพิมพ์ + ปุ่มส่งไหม — true ได้ทางเดียวเท่านั้น (ดู comment ในฟังก์ชัน) */
  blocking: boolean
}

/** ตัวเลขหลักพันต้องมีตัวคั่น ไม่งั้น "35000" อ่านผิดเป็นหลักหมื่นได้ง่าย ๆ ตอนกวาดตา */
function fmt(n: number): string {
  return n.toLocaleString('th-TH')
}

/**
 * แปลงสถานะโควตา+หน้าต่างฟรี เป็นคำที่ผู้ขายเห็นก่อนกดส่ง
 *
 * 🛑 `blocking = true` ได้ทางเดียว: **หน้าต่างฟรีปิด + รู้แน่ว่าโควตาหมด (ไม่ใช่ค่าที่อ่านไม่สำเร็จ)**
 *   - หน้าต่างเปิดอยู่ → reply ไม่กินโควตา ห้ามบล็อกเด็ดขาด (TC-28 ซึ่ง TestCase.md เตือนเองว่าเป็น
 *     เคสที่ implement ผิดง่ายที่สุด เพราะคนมักบล็อกรวมด้วยเงื่อนไขโควตาเดียว)
 *   - `stale` → ตัวเลขที่มีอาจเก่าแค่ไหนก็ไม่รู้ ห้ามใช้ปิดประตูใส่ร้าน (TD-006) — ฝั่ง server ก็ไม่
 *     บล็อกด้วยค่าแบบนี้เหมือนกัน ถ้าหน้าจอบล็อกเองจะกลายเป็นสองมาตรฐานทันที
 *
 * กติกาข้อสอง: กล้าปิดปุ่มได้เพราะ **server รับรองว่าจะปฏิเสธแน่นอน** ในเงื่อนไขเดียวกันนี้
 * (TFR-LINE-06 ข้อ 5) — ไม่ใช่การเดาแทนผู้ใช้ การเปิดปุ่มที่กดแล้วล้มเหลว 100% แย่กว่าปิดพร้อมบอกทางออก
 */
export function deriveLineQuotaCaption(input: LineQuotaCaptionInput): LineQuotaCaption {
  const { windowOpen, type, level, remaining, total, stale } = input

  if (windowOpen) {
    // อยู่ในนาทีทองแล้ว — เรื่องเดียวที่ผู้ขายต้องรู้คือ "ใบนี้ไม่เสียโควตา" ส่วนสถานะโควตาเป็นแค่
    // การกระซิบล่วงหน้าว่าใบถัดไปจะเจออะไร (ไม่ใช่ danger เพราะยังไม่มีอะไรพัง ณ ตอนนี้)
    if (level === 'EXHAUSTED' && !stale) {
      return {
        shortText: 'ส่งฟรี (โควตาหมดแล้ว)',
        fullText: 'ข้อความนี้ส่งฟรี (อยู่ในช่วงตอบด่วน) — โควตาหมดแล้วหลังจากนี้',
        tone: 'warning',
        blocking: false,
      }
    }
    if (level === 'LOW' && !stale) {
      return {
        shortText: 'ส่งฟรี (โควตาใกล้หมด)',
        fullText: 'ข้อความนี้ส่งฟรี (อยู่ในช่วงตอบด่วน) — โควตาใกล้หมด',
        tone: 'warning',
        blocking: false,
      }
    }
    return {
      shortText: 'ส่งฟรี',
      fullText: 'ข้อความนี้ส่งฟรี (อยู่ในช่วงตอบด่วน)',
      tone: 'neutral',
      blocking: false,
    }
  }

  // หน้าต่างปิดแล้ว = ใบนี้จะหักโควตา
  if (stale || type === 'unknown' || level === 'UNKNOWN') {
    return {
      shortText: 'ไม่ทราบยอดโควตา',
      fullText: 'ไม่ทราบยอดโควตาตอนนี้ — ยังส่งได้ตามปกติ',
      tone: 'quiet',
      blocking: false,
    }
  }

  if (type === 'unlimited' || level === 'UNLIMITED') {
    return {
      shortText: 'ไม่จำกัดโควตา',
      fullText: 'ไม่จำกัดโควตา — ส่งได้ตามปกติ',
      tone: 'neutral',
      blocking: false,
    }
  }

  if (level === 'EXHAUSTED') {
    return {
      shortText: 'โควตาหมดแล้ว',
      fullText: 'โควตาหมดแล้ว ส่งไม่ได้ตอนนี้',
      tone: 'danger',
      blocking: true,
    }
  }

  // ยังมีโควตาเหลือ — ตัวเลขที่ผู้ขายเอาไปตัดสินใจได้จริงคือ "เหลือเท่าไหร่จากเท่าไหร่"
  // (ไม่มีตัวเลขให้แสดง = ไม่ควรมาถึงบรรทัดนี้ แต่กันไว้ไม่ให้ขึ้น "เหลือ null/null")
  if (remaining === null || total === null) {
    return {
      shortText: 'ไม่ทราบยอดโควตา',
      fullText: 'ไม่ทราบยอดโควตาตอนนี้ — ยังส่งได้ตามปกติ',
      tone: 'quiet',
      blocking: false,
    }
  }

  if (level === 'LOW') {
    return {
      shortText: `เหลือ ${fmt(remaining)}/${fmt(total)} ใกล้หมด`,
      fullText: `ใช้โควตา 1 ข้อความ (เหลือ ${fmt(remaining)}/${fmt(total)} ใกล้หมด)`,
      tone: 'warning',
      blocking: false,
    }
  }

  return {
    shortText: `โควตา ${fmt(remaining)}/${fmt(total)}`,
    fullText: `ใช้โควตา 1 ข้อความ (เหลือ ${fmt(remaining)}/${fmt(total)})`,
    tone: 'neutral',
    blocking: false,
  }
}
