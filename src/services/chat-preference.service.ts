/**
 * chat-preference.service.ts — ค่าตั้งกล่องแชทต่อ (ผู้ใช้ × ร้าน) — 00018 ส่วนขยาย 2026-09-09
 *
 * เอกสาร: docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-09-09-inbox-sort-mode.md
 *
 * lazy default (แพตเทิร์นเดียวกับ ai-setting.service TD-002): ผู้ใช้ที่ยังไม่เคยตั้งอะไรจะ
 * "ไม่มีแถว" ไม่ใช่ "มีแถวที่เป็นค่าตั้งต้น" ⇒ ไม่ต้อง backfill ใครเลย และเพิ่มค่าตั้งตัวใหม่
 * ในอนาคตก็ไม่ต้อง migrate ข้อมูล (AC-SORT-04)
 *
 * ownership: userId/shopId ต้อง resolve จาก session ที่ชั้น route แล้วส่งลงมา — service ไม่แตะ
 * session เอง (แพตเทิร์นเดียวกับ listConversationsForShops)
 */
import { prisma } from '@/lib/prisma'
import { DEFAULT_INBOX_SORT, parseInboxSortMode, type InboxSortMode } from '@/lib/inbox-sort'
import {
  DEFAULT_INBOX_PREFERENCE,
  parseInboxFilterPreference,
  serializeInboxFilterPreference,
  type InboxPreference,
} from '@/lib/inbox-filter-pref'
import type { Prisma } from '@prisma/client'

/**
 * อ่านโหมดเรียงของ (ผู้ใช้ × ร้าน)
 *
 * 🛑 shopId ที่ส่งเข้ามาต้องเป็น `scope.activeShopId` เสมอ ไม่ใช่ร้านใดร้านหนึ่งใน `scope.shopIds`
 * — ในโหมดกล่องรวมหลายร้าน (UNIFIED) รายการเดียวครอบหลายร้าน แต่ค่าตั้งต้องมีเจ้าของที่แน่นอน
 * ตัวเดียว ไม่งั้นผู้ใช้กดตั้งค่าแล้วเปิดใหม่จะได้ค่าคนละตัวตามลำดับร้านที่ query คืนมา
 */
export async function getInboxSortMode(userId: string, shopId: string): Promise<InboxSortMode> {
  const row = await prisma.sellerChatPreference.findUnique({
    where: { userId_shopId: { userId, shopId } },
    select: { inboxSort: true },
  })
  // ไม่มีแถว = ค่าตั้งต้น · ค่าที่อ่านไม่ออก = ค่าตั้งต้น (parseInboxSortMode fail-closed)
  return row ? parseInboxSortMode(row.inboxSort) : DEFAULT_INBOX_SORT
}

/** เขียนโหมดเรียง — ค่าที่ไม่รู้จักถูกบีบเป็นค่าตั้งต้นก่อนลงฐาน (CHECK ที่ DB เป็นด่านสุดท้าย) */
export async function setInboxSortMode(
  userId: string,
  shopId: string,
  mode: InboxSortMode,
): Promise<InboxSortMode> {
  const inboxSort = parseInboxSortMode(mode)
  await prisma.sellerChatPreference.upsert({
    where: { userId_shopId: { userId, shopId } },
    create: { userId, shopId, inboxSort },
    update: { inboxSort },
  })
  return inboxSort
}

/**
 * อ่านค่าเริ่มต้นของกล่องแชททั้งชุด (การเรียง + ตัวกรอง + ช่องทาง + เพจ)
 * — 00018 ext รอบสอง 2026-09-09
 *
 * 🛑 นี่คือค่าที่ "หน้าจอต้องเริ่มด้วย" ⇒ **ทั้ง SSR และชุดแรกของ Chat Rail ต้องใช้ตัวเดียวกัน**
 * invariant เดิมที่เขียนไว้ใน chat-list-query.ts ("ชุดแรกต้องตรงกับ DEFAULT_CHAT_FILTER")
 * เปลี่ยนความหมายไปแล้ว: ค่าตั้งต้นไม่ใช่ค่าคงที่อีกต่อไป แต่เป็นค่าของผู้ใช้คนนั้น ⇒ กติกาใหม่คือ
 * **"ชุดแรกต้องตรงกับค่าที่ resolveInboxPreference() คืน"** — เคยพังเพราะเรื่องนี้มาแล้ว 2 รอบ
 * (2026-07-31 SSR, 2026-08-01 ChatRail) ทั้งสองครั้งอาการเหมือนกัน: เธรดหายตอนเข้าครั้งแรก
 * แล้วโผล่หลังกดสลับแท็บ
 */
export async function getInboxPreference(userId: string, shopId: string): Promise<InboxPreference> {
  const row = await prisma.sellerChatPreference.findUnique({
    where: { userId_shopId: { userId, shopId } },
    select: { inboxSort: true, inboxFilter: true },
  })
  if (!row) return DEFAULT_INBOX_PREFERENCE
  return parseInboxFilterPreference(row.inboxFilter, row.inboxSort)
}

/** บันทึกทั้งชุด (ปุ่ม "บันทึกเป็นค่าเริ่มต้น") — คืนค่าที่บันทึกจริงหลังผ่านด่าน parse */
export async function setInboxPreference(
  userId: string,
  shopId: string,
  pref: InboxPreference,
): Promise<InboxPreference> {
  // ผ่าน parse ก่อนเขียนเสมอ ไม่ใช่เชื่อสิ่งที่ client ส่งมา — คอลัมน์เป็น JSONB ที่ฐานบังคับ
  // รูปร่างไม่ได้ ถ้าปล่อยของแปลกลงไปได้ ทุกครั้งที่อ่านกลับมาจะต้องมาแก้ที่ขาอ่านแทน
  const clean = parseInboxFilterPreference(serializeInboxFilterPreference(pref), pref.sort)
  await prisma.sellerChatPreference.upsert({
    where: { userId_shopId: { userId, shopId } },
    create: {
      userId,
      shopId,
      inboxSort: clean.sort,
      inboxFilter: serializeInboxFilterPreference(clean) as Prisma.InputJsonValue,
    },
    update: {
      inboxSort: clean.sort,
      inboxFilter: serializeInboxFilterPreference(clean) as Prisma.InputJsonValue,
    },
  })
  return clean
}
