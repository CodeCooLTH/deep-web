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
 * upsertAiSetting — บันทึกการตั้งค่า (full replace ไม่ใช่ partial patch ตาม API.md §4.2)
 *
 * ไม่ fail-soft: การบันทึกล้มเหลวต้องแจ้งผู้ใช้จริง ๆ ไม่ใช่กลืนเงียบแล้วทำเหมือนบันทึกสำเร็จ
 * (ต่างจาก getAiSetting ที่เป็นเส้นทางอ่านซึ่งมีค่าเริ่มต้นให้ถอยไปได้)
 */
export async function upsertAiSetting(
  shopId: string,
  updatedByUserId: string,
  input: {
    instruction: string
    includeProductContext: boolean
    includeCustomerContext: boolean
    includeMediaContext: boolean
  },
): Promise<ShopAiSetting> {
  const instruction = input.instruction.trim().slice(0, AI_INSTRUCTION_MAX_LENGTH)
  const data = {
    instruction: instruction === '' ? null : instruction,
    includeProductContext: input.includeProductContext,
    includeCustomerContext: input.includeCustomerContext,
    includeMediaContext: input.includeMediaContext,
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
