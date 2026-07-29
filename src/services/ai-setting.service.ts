import { prisma } from '@/lib/prisma'

/**
 * ai-setting.service — การตั้งค่าผู้ช่วยร่างคำตอบ AI ต่อร้าน (feature 00019)
 *
 * SSOT: docs/20 - Features/00019 - AI Reply Assistant/{SRS.md TFR-001, SDS.md TD-002}
 *
 * ไม่ตรวจสิทธิ์ในนี้ — route เป็นผู้ตัดสินว่าใครอ่าน/เขียนได้ (pattern เดียวกับ quick-message.service
 * และ listConversationsForShop: shopId ถูก resolve จาก session ที่ชั้น route แล้วส่งลงมาเป็น argument
 * service ไม่แตะ session เอง)
 *
 * lazy default (TD-002): ร้านที่ยังไม่มีแถวคืนค่าเริ่มต้นจากค่าคงที่ในโค้ด ไม่สร้างแถวล่วงหน้า —
 * DB dev/prod ใช้ร่วมกัน การ backfill ทุกร้านคือการเขียนข้อมูลจำนวนมากโดยไม่จำเป็นและย้อนยาก
 */

/** ความยาวสูงสุดของคำสั่งประจำร้าน (BR-AI-03) — บังคับที่ Valibot และตัดซ้ำตอนประกอบ prompt */
export const AI_INSTRUCTION_MAX_LENGTH = 2000

export type ShopAiSetting = {
  instruction: string
  includeProductContext: boolean
  includeCustomerContext: boolean
  /** ส่งรูป/ข้อความเสียงในแชทเข้า AI ด้วย (feature 00019 ext, user 2026-07-24) — ดู comment ใน schema */
  includeMediaContext: boolean
  updatedAt: Date | null
}

/** ค่าเริ่มต้นของร้านที่ยังไม่เคยตั้งค่า (BR-AI-04) — บริบทเปิดทั้งคู่ คำสั่งว่าง */
export const DEFAULT_AI_SETTING: ShopAiSetting = {
  instruction: '',
  includeProductContext: true,
  includeCustomerContext: true,
  includeMediaContext: true,
  updatedAt: null,
}

/**
 * getAiSetting — คืนการตั้งค่าของร้าน หรือค่าเริ่มต้นถ้ายังไม่เคยตั้ง
 *
 * fail-soft (TFR-009): อ่านไม่สำเร็จ (DB ช้า/ตารางยังไม่ถูก migrate) ต้องไม่ทำให้การขอร่างล้มเหลว
 * ทั้งคำขอ — คืนค่าเริ่มต้นแล้ว log ไว้แทน
 */
export async function getAiSetting(shopId: string): Promise<ShopAiSetting> {
  try {
    const row = await prisma.shopAiSetting.findUnique({
      where: { shopId },
      select: {
        instruction: true,
        includeProductContext: true,
        includeCustomerContext: true,
        includeMediaContext: true,
        updatedAt: true,
      },
    })
    if (!row) return DEFAULT_AI_SETTING
    return {
      instruction: row.instruction ?? '',
      includeProductContext: row.includeProductContext,
      includeCustomerContext: row.includeCustomerContext,
      includeMediaContext: row.includeMediaContext,
      updatedAt: row.updatedAt,
    }
  } catch (e) {
    console.error('[ai-setting] getAiSetting failed — ใช้ค่าเริ่มต้นแทน', e instanceof Error ? e.message : e)
    return DEFAULT_AI_SETTING
  }
}

/**
 * getEffectiveAiSetting — บังคับสิทธิ์บริบท AI จริงตามสถานะ paid plan ที่ "ชั้นประกอบ context"
 * (feature 00019 ext 2026-07-29, FR-AIQ-10/BR-AIQ-13/14) — ร้าน non-paid ให้ถือว่า
 * includeProductContext/includeCustomerContext/includeMediaContext เป็น false เสมอ ไม่ว่าค่าที่เก็บ
 * ใน DB จะเป็นอะไร ค่าที่เก็บใน DB (`stored`) ห้ามถูกแตะ/เขียนทับ — gate ทำที่ read-time เท่านั้น
 * (BR-AIQ-14) เพื่อให้อัปเกรดแล้วบริบทกลับมาทำงานตามค่าเดิมทันทีโดยผู้ใช้ไม่ต้องตั้งใหม่
 *
 * instruction (คำสั่งประจำร้าน) ไม่อยู่ใน gate นี้ — ทุกร้านใช้ได้ปกติ (BR-AIQ-13)
 */
export function getEffectiveAiSetting(stored: ShopAiSetting, isPaidPlan: boolean): ShopAiSetting {
  if (isPaidPlan) return stored
  return {
    ...stored,
    includeProductContext: false,
    includeCustomerContext: false,
    includeMediaContext: false,
  }
}

/** โยนเมื่อร้าน non-paid พยายามเปลี่ยนค่า 3 ฟิลด์บริบท AI ผ่าน PUT ตรง ๆ (FR-AIQ-10, ข้าม UI ก็โดน) */
export const CONTEXT_GATE_PAID_PLAN_REQUIRED = 'CONTEXT_GATE_PAID_PLAN_REQUIRED'

/**
 * upsertAiSetting — บันทึกการตั้งค่า (full replace ไม่ใช่ partial patch ตาม API.md §4.2)
 *
 * ไม่ fail-soft: การบันทึกล้มเหลวต้องแจ้งผู้ใช้จริง ๆ ไม่ใช่กลืนเงียบแล้วทำเหมือนบันทึกสำเร็จ
 * (ต่างจาก getAiSetting ที่เป็นเส้นทางอ่านซึ่งมีค่าเริ่มต้นให้ถอยไปได้)
 *
 * @param isPaidPlan - สถานะ paid plan ของ owner ร้านนี้ (feature 00019 ext 2026-07-29, FR-AIQ-10) —
 *   ร้าน non-paid ที่ payload พยายามเปลี่ยนค่า includeProductContext/includeCustomerContext/
 *   includeMediaContext ให้ต่างจากค่าที่เก็บอยู่ (`stored`, ไม่ใช่ effective) จะถูกปฏิเสธทั้งคำขอ —
 *   `instruction` ไม่ถูก gate เปลี่ยนได้เสมอ (BR-AIQ-13) ป้องกันการยิง API ตรงข้าม UI ที่ disable ไว้
 * @throws Error(CONTEXT_GATE_PAID_PLAN_REQUIRED) ถ้า non-paid พยายามเปลี่ยน 3 ฟิลด์นั้น
 */
export async function upsertAiSetting(
  shopId: string,
  updatedByUserId: string,
  input: {
    instruction: string
    // 3 ฟิลด์บริบทเป็น optional — ไม่ส่งมา = "ไม่เปลี่ยนค่าเดิม" (เติมจาก stored ให้เอง)
    // จำเป็นเพราะร้าน non-paid ถูก gate ห้ามเปลี่ยน 3 ฟิลด์นี้ (FR-AIQ-10) client จึงส่งมาแค่
    // instruction — ถ้าบังคับ required ร้าน non-paid จะแก้ "คำสั่งประจำร้าน" ไม่ได้เลยทั้งที่
    // BR-AIQ-13 บอกว่าช่องนี้ไม่ถูก gate
    includeProductContext?: boolean
    includeCustomerContext?: boolean
    includeMediaContext?: boolean
  },
  isPaidPlan: boolean,
): Promise<ShopAiSetting> {
  const current = await getAiSetting(shopId) // ค่าที่เก็บจริง (stored) — ไม่ใช่ effective
  // ฟิลด์ที่ไม่ได้ส่งมา = คงค่าเดิม (ไม่ใช่ reset เป็น default) — กันการเขียนทับสิ่งที่ร้าน
  // ตั้งใจปิดไว้ โดยเฉพาะ includeMediaContext ที่การเปิดโดยไม่ตั้งใจ = ไฟล์ลูกค้าเข้า AI ทั้งไฟล์
  const includeProductContext = input.includeProductContext ?? current.includeProductContext
  const includeCustomerContext = input.includeCustomerContext ?? current.includeCustomerContext
  const includeMediaContext = input.includeMediaContext ?? current.includeMediaContext

  if (!isPaidPlan) {
    const contextFieldsChanged =
      includeProductContext !== current.includeProductContext ||
      includeCustomerContext !== current.includeCustomerContext ||
      includeMediaContext !== current.includeMediaContext
    if (contextFieldsChanged) {
      throw new Error(CONTEXT_GATE_PAID_PLAN_REQUIRED)
    }
  }

  const instruction = input.instruction.trim().slice(0, AI_INSTRUCTION_MAX_LENGTH)
  const data = {
    instruction: instruction === '' ? null : instruction,
    includeProductContext,
    includeCustomerContext,
    includeMediaContext,
    updatedByUserId,
  }
  const row = await prisma.shopAiSetting.upsert({
    where: { shopId },
    create: { shopId, ...data },
    update: data,
    select: {
      instruction: true,
      includeProductContext: true,
      includeCustomerContext: true,
      includeMediaContext: true,
      updatedAt: true,
    },
  })
  return {
    instruction: row.instruction ?? '',
    includeProductContext: row.includeProductContext,
    includeCustomerContext: row.includeCustomerContext,
    includeMediaContext: row.includeMediaContext,
    updatedAt: row.updatedAt,
  }
}
