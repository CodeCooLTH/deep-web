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
