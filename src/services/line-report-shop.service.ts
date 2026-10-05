/**
 * line-report-shop.service.ts — ร้านที่รวมในรายงานกลุ่ม LINE (00070 · SRS TFR-08/16)
 *
 * 🛑 reportable = `userId=owner ∧ ¬deleted ∧ ¬purged ∧ ¬locked` กรองที่ query แรก — ห้ามใช้ `listAccessibleShopIds`
 * (นั่นรวมร้านที่เป็น ADMIN ของเจ้าของอื่น = รั่วตัวเลขร้านคนอื่นเข้ากลุ่ม)
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { LineReportError } from '@/lib/line-report/errors'
import type { ShopRef } from '@/lib/line-report/types'
import { isOwnerPaidForReports } from '@/services/line-report-access.service'

type Db = Prisma.TransactionClient
export const MAX_REPORT_SHOPS = 10

export type ExcludedReason = 'LOCKED' | 'DELETED' | 'PURGED'
export type ShopState = 'OK' | ExcludedReason

type ShopRow = { id: string; shopName: string; vertical: string; kind?: string; packageLockedAt: Date | null; deletedAt: Date | null; purgedAt: Date | null }
export const SHOP_STATE_SELECT = {
  id: true, shopName: true, vertical: true, kind: true, packageLockedAt: true, deletedAt: true, purgedAt: true,
} as const

/** terminal ก่อน: ร้าน purge ย่อมถูกลบแล้ว — ถ้าเช็ค LOCKED ก่อน PURGED จะไปไม่ถึงเลย */
export function shopState(s: Pick<ShopRow, 'packageLockedAt' | 'deletedAt' | 'purgedAt'>): ShopState {
  if (s.purgedAt) return 'PURGED'
  if (s.deletedAt) return 'DELETED'
  if (s.packageLockedAt) return 'LOCKED'
  return 'OK'
}

const toRef = (s: Pick<ShopRow, 'id' | 'shopName' | 'vertical'>): ShopRef => ({ id: s.id, name: s.shopName, vertical: s.vertical })

export async function listReportableShops(ownerId: string): Promise<(ShopRef & { kind: string })[]> {
  const rows = await prisma.shop.findMany({
    where: { userId: ownerId, deletedAt: null, purgedAt: null, packageLockedAt: null },
    select: { id: true, shopName: true, vertical: true, kind: true },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((s) => ({ ...toRef(s), kind: s.kind }))
}

/** 1..10 ไม่ซ้ำ */
export function assertShopCount(shopIds: readonly string[]): void {
  if (shopIds.length < 1 || shopIds.length > MAX_REPORT_SHOPS) throw new LineReportError('SHOP_COUNT_OUT_OF_RANGE')
  if (new Set(shopIds).size !== shopIds.length) throw new LineReportError('VALIDATION')
}

/** ทุก id ต้อง reportable ของเจ้าของนี้ — ว่าง = ผ่าน (ไม่มีอะไรให้ตรวจ) */
export async function assertReportableIds(ownerId: string, shopIds: readonly string[], db: Db | typeof prisma = prisma): Promise<ShopRef[]> {
  if (shopIds.length === 0) return []
  const rows = await db.shop.findMany({
    where: { id: { in: [...shopIds] }, userId: ownerId, deletedAt: null, purgedAt: null, packageLockedAt: null },
    select: { id: true, shopName: true, vertical: true },
  })
  if (rows.length !== new Set(shopIds).size) throw new LineReportError('SHOP_NOT_ALLOWED')
  return rows.map(toRef)
}

/** ชุดร้านที่จะผูกใหม่ทั้งชุด (สร้างโค้ด) — นับ + reportable */
export async function assertReportable(ownerId: string, shopIds: readonly string[], db: Db | typeof prisma = prisma): Promise<ShopRef[]> {
  assertShopCount(shopIds)
  return assertReportableIds(ownerId, shopIds, db)
}

/** `NOT_OWNED` = ร้านที่ไม่ใช่ของเจ้าของกลุ่ม (ข้อมูลผิดปกติ/สิทธิ์เปลี่ยนมือ) — แสดงเป็น "ไม่พร้อมใช้งาน" ไม่รั่วยอดเข้ากลุ่ม */
export type SendExcludedReason = ExcludedReason | 'NOT_OWNED'

/**
 * ร้านของกลุ่ม อ่านสด ณ ตอนส่ง — ตัดร้านล็อก/ลบ/purge ออกพร้อมเหตุ (TFR-16)
 * 🛑 ตรวจ `shop.userId = group.ownerId` ซ้ำที่จุดส่งด้วย (defense in depth — แถว GroupShop เขียนผ่านด่าน reportable อยู่แล้ว
 * แต่ร้านย้ายเจ้าของ/ข้อมูลหลุดด่านต้องไม่ทำให้ตัวเลขร้านคนอื่นเข้ากลุ่มของเรา)
 */
export async function resolveSendableShops(group: { id: string; ownerId: string }): Promise<{
  sendable: ShopRef[]
  excluded: { shop: ShopRef; reason: SendExcludedReason }[]
}> {
  const rows = await prisma.lineReportGroupShop.findMany({
    where: { groupId: group.id },
    select: { shop: { select: { ...SHOP_STATE_SELECT, userId: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const sendable: ShopRef[] = []
  const excluded: { shop: ShopRef; reason: SendExcludedReason }[] = []
  for (const { shop } of rows) {
    const st = shopState(shop)
    if (st !== 'OK') excluded.push({ shop: toRef(shop), reason: st })
    else if (shop.userId !== group.ownerId) excluded.push({ shop: toRef(shop), reason: 'NOT_OWNED' })
    else sendable.push(toRef(shop))
  }
  return { sendable, excluded }
}

/** ล็อกแถวกลุ่มของเจ้าของ (FOR UPDATE) กัน autosave/PUT ซ้อนกัน — ไม่เจอ/ของคนอื่น/REMOVED = 404 */
export async function lockOwnedGroup(tx: Db, ownerId: string, groupId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "LineReportGroup"
    WHERE "id" = ${groupId} AND "ownerId" = ${ownerId} AND "status" <> 'REMOVED'
    FOR UPDATE`
  if (rows.length === 0) throw new LineReportError('GROUP_NOT_FOUND')
}

export type GroupShopDto = { shopId: string; name: string; vertical: string; kind: string; state: ShopState }

async function readGroupShops(db: Db | typeof prisma, groupId: string, ownerId: string): Promise<GroupShopDto[]> {
  const rows = await db.lineReportGroupShop.findMany({
    where: { groupId },
    select: { shop: { select: { ...SHOP_STATE_SELECT, userId: true } } },
    orderBy: { createdAt: 'asc' },
  })
  // ร้านที่โอนเจ้าของหลักไปแล้ว (EXT 00012 transferShopOwnership) ไม่ใช่ร้านของเจ้าของกลุ่มอีก — ตัวส่งตัดออกเป็น NOT_OWNED
  // แสดงเป็น DELETED (state ของ API §4.4 มีแค่ OK|LOCKED|DELETED · UI ไม่ต้องเปลี่ยน) ไม่ให้โชว์ OK ทั้งที่ส่งไม่ถึง
  return rows.map(({ shop }) => {
    const st = shopState(shop)
    return { shopId: shop.id, name: shop.shopName, vertical: shop.vertical, kind: shop.kind, state: st === 'OK' && shop.userId !== ownerId ? 'DELETED' : st }
  })
}

/**
 * แทนที่ร้านของกลุ่ม (PUT shops) — ร้านที่เพิ่มใหม่ต้อง reportable · ร้านเดิมที่ล็อก/ลบภายหลังคงไว้ได้ (AC-09-3)
 * `GROUP_NOT_FOUND` ถ้าไม่ใช่ของตน/REMOVED (scope ownerId ที่ query แรก)
 */
export async function replaceGroupShops(ownerId: string, groupId: string, shopIds: readonly string[]): Promise<GroupShopDto[]> {
  assertShopCount(shopIds)
  if (!(await isOwnerPaidForReports(ownerId))) throw new LineReportError('PACKAGE_REQUIRED') // ด่านระดับ service (security LOW-3)
  return prisma.$transaction(async (tx) => {
    await lockOwnedGroup(tx, ownerId, groupId)
    const current = (await tx.lineReportGroupShop.findMany({ where: { groupId }, select: { shopId: true } })).map((r) => r.shopId)
    const added = shopIds.filter((id) => !current.includes(id))
    await assertReportableIds(ownerId, added, tx)
    await tx.lineReportGroupShop.deleteMany({ where: { groupId, shopId: { notIn: [...shopIds] } } })
    if (added.length > 0) {
      await tx.lineReportGroupShop.createMany({ data: added.map((shopId) => ({ groupId, shopId })), skipDuplicates: true })
    }
    return readGroupShops(tx, groupId, ownerId)
  })
}

export { readGroupShops }
