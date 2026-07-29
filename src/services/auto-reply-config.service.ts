import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type { HumanTakeoverPauseMode, AdsContextMode } from '@/lib/auto-reply-constants'

/**
 * auto-reply-config.service — การตั้งค่าระดับร้านของฟีเจอร์ 00023 (SRS TFR-001)
 *
 * ownership: shopId มาจาก resolveActiveShopContext ที่ชั้น route เท่านั้น (TFR-005) — ไฟล์นี้
 * **ห้ามแตะ session/role** รับ shopId/userId เป็น argument ธรรมดา แล้วให้ route เป็นคนตัดสินสิทธิ์
 * (SDS §3.2, pattern เดียวกับ ai-setting.service / quick-message.service)
 *
 * lazy default (TFR-001): ร้านที่ยังไม่มีแถว `AutoReplyConfig` คืนค่าเริ่มต้นจากโค้ด **ไม่สร้างแถว**
 * ล่วงหน้า — mirror ShopAiSetting (feature 00019 TFR-001) เหตุผลเดียวกัน: DB dev/prod แชร์กัน
 * การ backfill ทุกร้านคือเขียนข้อมูลจำนวนมากโดยไม่จำเป็น
 *
 * [ข้อบังคับ] ห้าม cache ไฟล์นี้ (TD-004, ดู comment บนหัว auto-reply-cache.ts) — isEnabled ต้องอ่านสดทุกครั้ง
 * ไม่งั้นร้านปิดสวิตช์แล้วระบบยังตอบต่ออีกสูงสุด 60 วิ ขัด AC-015-02 ตรง ๆ — ไฟล์นี้จึงไม่ import
 * auto-reply-cache และไม่เรียก invalidateShop (คนละความถี่การอ่านกับ auto-reply-rule.service)
 */

export type AutoReplyConfigView = {
  isEnabled: boolean
  testMode: boolean
  testModeExpiresAt: Date | null
  humanTakeoverPauseMode: string
  keywordCooldownSec: number
  maxRepliesPerConversation: number
  adsContextMode: string
  adsContextHours: number | null
  handoffPhrases: string[]
  updatedAt: Date | null
  // GAP-03 (Gate 0 baseline) — AC-023-05 "จำนวนงานค้าง/ล้มเหลวต้องตรวจสอบได้": เกาะ endpoint
  // GET config เดิมแทนสร้างหน้า/endpoint ใหม่ (มติ Gate 0: "รับเข้าแบบน้อยที่สุด")
  pendingJobCount: number
  failedJobCount: number
}

/** ค่าเริ่มต้นของร้านที่ยังไม่เคยตั้งค่า — ต้องตรงกับ `@default` ใน DATABASE.md §3.1 ทุกตัว */
export const DEFAULT_AUTO_REPLY_CONFIG: Omit<AutoReplyConfigView, 'pendingJobCount' | 'failedJobCount'> = {
  // [ข้อบังคับ] default false ตั้งใจ (BR-AR ระดับ 0) — ห้ามเปลี่ยนเป็น true ในโค้ดใด ๆ (AC-015-01)
  isEnabled: false,
  testMode: false,
  testModeExpiresAt: null,
  humanTakeoverPauseMode: '2H',
  keywordCooldownSec: 300,
  maxRepliesPerConversation: 10,
  adsContextMode: 'UNTIL_RESOLVED',
  adsContextHours: null,
  handoffPhrases: [],
  updatedAt: null,
}

const CONFIG_SELECT = {
  isEnabled: true,
  testMode: true,
  testModeExpiresAt: true,
  humanTakeoverPauseMode: true,
  keywordCooldownSec: true,
  maxRepliesPerConversation: true,
  adsContextMode: true,
  adsContextHours: true,
  handoffPhrases: true,
  updatedAt: true,
} satisfies Prisma.AutoReplyConfigSelect

type ConfigRow = {
  isEnabled: boolean
  testMode: boolean
  testModeExpiresAt: Date | null
  humanTakeoverPauseMode: string
  keywordCooldownSec: number
  maxRepliesPerConversation: number
  adsContextMode: string
  adsContextHours: number | null
  handoffPhrases: string[]
  updatedAt: Date
}

function toConfigView(
  row: ConfigRow,
  jobCounts: { pendingJobCount: number; failedJobCount: number },
): AutoReplyConfigView {
  return {
    isEnabled: row.isEnabled,
    testMode: row.testMode,
    testModeExpiresAt: row.testModeExpiresAt,
    humanTakeoverPauseMode: row.humanTakeoverPauseMode,
    keywordCooldownSec: row.keywordCooldownSec,
    maxRepliesPerConversation: row.maxRepliesPerConversation,
    adsContextMode: row.adsContextMode,
    adsContextHours: row.adsContextHours,
    handoffPhrases: row.handoffPhrases,
    updatedAt: row.updatedAt,
    ...jobCounts,
  }
}

/**
 * GAP-04 — AC-023-05: จำนวนงานค้าง (`PENDING`) และงานล้มเหลว (`FAILED`) ของร้าน
 * best-effort: query พัง (เช่น DB ช้า) ต้องไม่ทำให้อ่านการตั้งค่าทั้งหน้าพังตาม — คืน 0 แล้ว log แทน
 * (สถานะดู DATABASE.md §3.8 `AutoReplyJob.status` — FROZEN)
 */
async function getJobCounts(shopId: string): Promise<{ pendingJobCount: number; failedJobCount: number }> {
  try {
    const [pendingJobCount, failedJobCount] = await Promise.all([
      prisma.autoReplyJob.count({ where: { shopId, status: 'PENDING' } }),
      prisma.autoReplyJob.count({ where: { shopId, status: 'FAILED' } }),
    ])
    return { pendingJobCount, failedJobCount }
  } catch (e) {
    console.error(
      '[auto-reply-config] getJobCounts ล้มเหลว — คืน 0 แทน',
      shopId,
      e instanceof Error ? e.message : e,
    )
    return { pendingJobCount: 0, failedJobCount: 0 }
  }
}

/** getConfig — lazy default ต่อร้าน (TFR-001) */
export async function getConfig(shopId: string): Promise<AutoReplyConfigView> {
  const [row, jobCounts] = await Promise.all([
    prisma.autoReplyConfig.findUnique({ where: { shopId }, select: CONFIG_SELECT }),
    getJobCounts(shopId),
  ])
  if (!row) return { ...DEFAULT_AUTO_REPLY_CONFIG, ...jobCounts }
  return toConfigView(row, jobCounts)
}

export type AutoReplyConfigInput = {
  isEnabled: boolean
  humanTakeoverPauseMode: HumanTakeoverPauseMode
  keywordCooldownSec: number
  maxRepliesPerConversation: number
  adsContextMode: AdsContextMode
  adsContextHours: number | null
  handoffPhrases: string[]
}

/**
 * upsertConfig — บันทึกการตั้งค่า (full replace ตาม TFR-001 "การบันทึกใช้ upsert โดย shopId
 * เป็น key และเซ็ต updatedByUserId ทุกครั้ง") ไม่แตะ testMode* (แยกไปที่ setTestMode/expireTestMode
 * เพราะมี invariant/สิทธิ์คนละชุด — ไม่ปนกันเพื่อกันการเผลอเคลียร์โหมดทดสอบตอนแก้ค่าอื่น)
 *
 * ไม่ทำ enum-range validation ซ้ำที่นี่ (`humanTakeoverPauseMode`/`adsContextMode` picklist,
 * ช่วงตัวเลข ฯลฯ) — ตาม TFR-001/TFR-027 validation เกิดที่ Valibot ชั้น route (S-10) เท่านั้น
 * เพราะคอลัมน์เป็น String ไม่มี DB CHECK ตาม convention เดิมทั้งโปรเจกต์
 */
export async function upsertConfig(
  shopId: string,
  userId: string,
  input: AutoReplyConfigInput,
): Promise<AutoReplyConfigView> {
  const data = {
    isEnabled: input.isEnabled,
    humanTakeoverPauseMode: input.humanTakeoverPauseMode,
    keywordCooldownSec: input.keywordCooldownSec,
    maxRepliesPerConversation: input.maxRepliesPerConversation,
    adsContextMode: input.adsContextMode,
    // adsContextHours ต้องเป็น null เสมอเมื่อไม่ใช่โหมด HOURS (TFR-027) — กันค่าที่ค้างจากโหมดก่อนหน้า
    adsContextHours: input.adsContextMode === 'HOURS' ? input.adsContextHours : null,
    handoffPhrases: input.handoffPhrases,
    updatedByUserId: userId,
  }
  const row = await prisma.autoReplyConfig.upsert({
    where: { shopId },
    create: { shopId, ...data },
    update: data,
    select: CONFIG_SELECT,
  })
  const jobCounts = await getJobCounts(shopId)
  return toConfigView(row, jobCounts)
}

/**
 * setTestMode — เปิด/ปิดโหมดทดสอบ (FR-021) แยกจาก upsertConfig เพราะสิทธิ์/จังหวะเรียกต่างกัน
 * (ร้านอาจกดเปิด/ปิดโหมดทดสอบบ่อยกว่าการแก้ค่าตั้งค่าหลัก) และ lazy-upsert เหมือนกันเพราะ
 * ร้านอาจยังไม่เคยมีแถว `AutoReplyConfig` มาก่อนตอนกดเปิดโหมดทดสอบครั้งแรก
 */
export async function setTestMode(
  shopId: string,
  userId: string,
  input: { testMode: boolean; testModeExpiresAt: Date | null },
): Promise<AutoReplyConfigView> {
  const data = {
    testMode: input.testMode,
    testModeExpiresAt: input.testMode ? input.testModeExpiresAt : null,
    testModeEnabledByUserId: input.testMode ? userId : null,
    updatedByUserId: userId,
  }
  const row = await prisma.autoReplyConfig.upsert({
    where: { shopId },
    create: { shopId, ...data },
    update: data,
    select: CONFIG_SELECT,
  })
  const jobCounts = await getJobCounts(shopId)
  return toConfigView(row, jobCounts)
}

/**
 * expireTestMode — GAP-03 (Gate 0 baseline, AC-021-08): ปิดโหมดทดสอบของทุกร้านที่หมดอายุแล้ว
 * (`testMode=true` และ `testModeExpiresAt <= now`) พร้อมสร้าง `Notification` แจ้งเจ้าของร้าน —
 * กันร้านเข้าใจผิดว่ายังทดสอบอยู่ (ความเสี่ยง PRD §6.1 "ร้านลืมปิดโหมดทดสอบ" กลับด้าน)
 *
 * เรียกเป็นระยะจาก cron sweeper (S-09) — ไม่รับ shopId เดี่ยว เพราะเป็นงานกวาดทุกร้านพร้อมกัน
 * แต่ละแถวอัปเดต+แจ้งเตือนในทรานแซกชันเดียวกัน (atomic ต่อร้าน ไม่ผูกข้ามร้าน — ร้านหนึ่งพังไม่ควร
 * ทำให้ร้านอื่นที่หมดอายุพร้อมกันไม่ถูกปิดตาม)
 */
export async function expireTestMode(now: Date = new Date()): Promise<{ expiredShopIds: string[] }> {
  const rows = await prisma.autoReplyConfig.findMany({
    where: { testMode: true, testModeExpiresAt: { lte: now } },
    select: { id: true, shopId: true, shop: { select: { userId: true } } },
  })

  const expiredShopIds: string[] = []
  for (const row of rows) {
    await prisma.$transaction([
      prisma.autoReplyConfig.update({
        where: { id: row.id },
        data: { testMode: false, testModeExpiresAt: null, testModeEnabledByUserId: null },
      }),
      prisma.notification.create({
        data: {
          userId: row.shop.userId,
          kind: 'auto_reply_test_mode_expired',
          title: 'โหมดทดสอบตอบแชทอัตโนมัติหมดอายุแล้ว',
          body: 'ระบบปิดโหมดทดสอบให้อัตโนมัติแล้ว เปิดใหม่ได้จากหน้าตั้งค่าตอบแชทอัตโนมัติ',
          refId: row.shopId,
        },
      }),
    ])
    expiredShopIds.push(row.shopId)
  }
  return { expiredShopIds }
}
