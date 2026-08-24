/**
 * customer-directory.service — ชั้น I/O ของ "ทะเบียนลูกค้าของร้าน" (feature 00057)
 *
 * ทั้งหน้า `/customers` (ลิสต์), `/customers/[id]` (โปรไฟล์) และ endpoint เปิดเผยเบอร์เต็ม
 * เรียกไฟล์นี้ตัวเดียว — **ห้าม group ออเดอร์เป็นลูกค้าที่อื่นอีก** (BR-CUSTP-05)
 *
 * 🛑 ไฟล์นี้ **ไม่จับ exception เอง** โดยตั้งใจ — ปล่อยให้ throw ขึ้นไปถึงผู้เรียก
 * ของเดิมใน `customers/page.tsx` เขียน `catch { orders = [] }` ซึ่งทำให้ "ฐานข้อมูลล่ม" กับ
 * "ร้านนี้ยังไม่มีลูกค้า" มีหน้าตาเหมือนกันเป๊ะ — ร้านที่มีลูกค้า 400 คนจะเห็นข้อความชวนให้
 * "รอผู้ซื้อสั่งซื้อ" โดยไม่มีอะไรบอกว่าระบบมีปัญหา (BRD §6.3)
 *
 * 🛑 ผลลัพธ์เป็น **unmasked** — ผู้เรียกที่จะส่งข้ามไป client component ต้อง map เป็น
 * `CustomerRow` (masked) ก่อนเสมอ (`feedback_rsc_pii_neutralize_at_source`)
 */
import { prisma } from '@/lib/prisma'
import { makeCustomerRowKey } from '@/lib/customer-row-key'
import { countsAsRevenue } from '@/lib/order-revenue'
import { summarizeCustomerBehavior, type CustomerOrderEvidence } from '@/lib/customer-behavior'
import {
  findEntryByKey,
  isValidCustomerKey,
  type CustomerDirectoryEntry,
  type CustomerDirectoryOrder,
} from '@/lib/customer-directory'

/**
 * ตัวสะสมระหว่าง group — มี field ที่ไม่ต้องส่งออก (evidence สำหรับ summarize)
 * แยกจาก `CustomerDirectoryEntry` เพื่อไม่ให้ evidence รั่วออกไปเป็นส่วนหนึ่งของ contract
 */
type Accumulator = Omit<CustomerDirectoryEntry, 'behavior'> & {
  evidence: CustomerOrderEvidence[]
}

/**
 * ดึงออเดอร์ทั้งร้านแล้ว group เป็นลูกค้า
 *
 * เป็น query เดียว (+ join relation ใน select เดียวกัน) — ไม่ paginate ในรอบนี้ตามมติ
 * Out-of-Scope ของ BRD (ร้านใหญ่สุดบน prod 2026-08-24 มี 413 ออเดอร์ / ลูกค้าไม่ซ้ำ 397 คน)
 * เพดานที่ยอมรับตาม SRS §6 คือ ~2,000 ออเดอร์ต่อร้าน
 */
export async function aggregateShopCustomers(shopId: string): Promise<CustomerDirectoryEntry[]> {
  const orders = await prisma.order.findMany({
    where: { shopId },
    select: {
      publicToken: true,
      orderNo: true,
      status: true,
      totalAmount: true,
      createdAt: true,
      conversationId: true,
      shippingAddress: true,
      customerId: true,
      buyerUserId: true,
      buyerContact: true,
      buyerName: true,
      cancelInitiator: true,
      cancelReason: true,
      /**
       * 🛑 ดึงพัสดุ "ทุกใบ" ของออเดอร์ ไม่ใช่ take 1 — เพราะที่นี่ต้องตอบ 2 คำถามที่ใช้ชุดพัสดุ
       * ต่างกัน จาก query เดียว:
       *   1. `countsAsRevenue()` ทำ `.some()` บนพัสดุ **ทุกใบ** (ใบที่ถูกยกเลิกไปแล้วต้องไม่บัง
       *      ใบที่ยังใช้ได้)
       *   2. `summarizeCustomerBehavior()` ต้องการพัสดุ **active ล่าสุดใบเดียว**
       * ถ้า take 1 ตั้งแต่ query ข้อ 1 จะเพี้ยนเงียบ ๆ; ถ้าแยกเป็น 2 query ก็เป็น N+1 เปล่า ๆ
       * — คัดใบ active ในหน่วยความจำแทน ด้วยเกณฑ์เดียวกับ `customer-behavior.service.ts`
       */
      shipments: {
        orderBy: { createdAt: 'desc' },
        select: { status: true, isDryRun: true, carrierStatus: true },
      },
      buyer: {
        select: { id: true, username: true, displayName: true, avatar: true, deletedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const map = new Map<string, Accumulator>()

  for (const o of orders) {
    const key = makeCustomerRowKey(o.customerId, o.buyerUserId, o.buyerContact)
    const createdAtRaw = o.createdAt.getTime()
    const isRevenue = countsAsRevenue(o)
    const amount = Number(o.totalAmount)

    /**
     * "พัสดุของใบนี้" = ใบล่าสุดที่ยังไม่ถูกยกเลิก — เกณฑ์เดียวกับ `customer-behavior.service.ts`
     * (`where: { status: { not: 'CANCELLED' } }` + `orderBy createdAt desc` + `take 1`)
     * ห้ามนิยามคำว่า "พัสดุของใบนี้" ใหม่ที่นี่
     */
    const activeShipment = o.shipments.find((s) => s.status !== 'CANCELLED') ?? null

    const orderRow: CustomerDirectoryOrder = {
      publicToken: o.publicToken,
      orderNo: o.orderNo,
      status: o.status,
      totalAmount: amount,
      createdAtISO: o.createdAt.toISOString(),
      createdAtRaw,
      conversationId: o.conversationId,
      isRevenue,
      shippingAddress: o.shippingAddress ?? null,
    }

    const evidenceRow: CustomerOrderEvidence = {
      status: o.status,
      cancelInitiator: o.cancelInitiator ?? null,
      cancelReason: o.cancelReason ?? null,
      activeShipmentCarrierStatus: activeShipment?.carrierStatus ?? null,
    }

    const existing = map.get(key)
    if (existing) {
      existing.totalOrders += 1
      if (isRevenue) {
        existing.totalSpent += amount
        existing.revenueOrderCount += 1
      }
      // orders มาเรียง desc อยู่แล้ว — push ต่อท้ายจึงยังเรียงใหม่→เก่า
      existing.orders.push(orderRow)
      existing.evidence.push(evidenceRow)
      if (createdAtRaw > existing.lastOrderRaw) {
        existing.lastOrderRaw = createdAtRaw
        existing.lastOrderISO = orderRow.createdAtISO
      }
      if (createdAtRaw < existing.firstOrderRaw) {
        existing.firstOrderRaw = createdAtRaw
        existing.firstOrderISO = orderRow.createdAtISO
      }
      // ใบล่าสุดที่มีข้อมูลติดต่อชนะ — ใบเก่ากว่าไม่ทับของใหม่ (orders เรียง desc)
      if (!existing.contactFull && o.buyerContact) existing.contactFull = o.buyerContact
      continue
    }

    /**
     * ผู้ใช้ที่ soft-delete แล้ว (`deletedAt` ตั้งแล้วยังไม่ purge) ต้อง render เป็น guest-like —
     * ไม่มีลิงก์ `/u/{username}` เพราะ `findByUsername` กัน `deletedAt` ที่ต้นทางแล้ว ลิงก์จะ 404
     * (BR-CUST-08 ของ 00014 — พฤติกรรมเดิม ยกมาตรง ๆ ห้ามเปลี่ยน)
     */
    const isReg = !!o.buyer && !o.buyer.deletedAt
    const typedName = o.buyerName?.trim() || ''
    const name = isReg ? (o.buyer?.displayName ?? 'สมาชิก') : typedName || 'ลูกค้าทั่วไป'
    const initial = isReg
      ? name.charAt(0).toUpperCase() || '?'
      : typedName
        ? typedName.charAt(0).toUpperCase()
        : '?'

    map.set(key, {
      key,
      customerId: o.customerId,
      buyerUserId: o.buyerUserId,
      displayName: name,
      initial,
      contactFull: o.buyerContact ?? null,
      isRegistered: isReg,
      username: isReg ? (o.buyer?.username ?? null) : null,
      avatarUrl: isReg ? (o.buyer?.avatar ?? null) : null,
      totalOrders: 1,
      totalSpent: isRevenue ? amount : 0,
      revenueOrderCount: isRevenue ? 1 : 0,
      firstOrderISO: orderRow.createdAtISO,
      firstOrderRaw: createdAtRaw,
      lastOrderISO: orderRow.createdAtISO,
      lastOrderRaw: createdAtRaw,
      orders: [orderRow],
      evidence: [evidenceRow],
    })
  }

  return Array.from(map.values())
    .map(({ evidence, ...rest }) => ({
      ...rest,
      behavior: summarizeCustomerBehavior(evidence),
    }))
    .sort((a, b) => b.lastOrderRaw - a.lastOrderRaw)
}

/** ผลลัพธ์ของการหาลูกค้าจาก key — discriminated union แทนการ throw (SRS §10) */
export type ResolveCustomerResult =
  | { ok: true; entry: CustomerDirectoryEntry }
  | { ok: false; reason: 'INVALID_KEY' | 'NOT_FOUND' }

/**
 * หาลูกค้า 1 คนจาก opaque key — ใช้ตัวนี้ทั้งหน้าโปรไฟล์และ endpoint เปิดเผยเบอร์
 *
 * 🛑 **authorization อยู่ที่ `where: { shopId }` ของ query ไม่ใช่การเช็คทีหลัง** — `aggregateShopCustomers`
 * ไม่มีทางคืน entry ของร้านอื่นได้เลยตั้งแต่ SELECT แรก การยิง key ของร้านอื่นเข้ามาจึงได้
 * `NOT_FOUND` เสมอโดยไม่ต้องมีโค้ดเปรียบเทียบเจ้าของเพิ่ม (`feedback_rsc_dal_authz`)
 *
 * ผู้เรียกต้องแปลง `INVALID_KEY`/`NOT_FOUND` เป็น 404 **เหมือนกันทั้งคู่** — ห้ามแยกข้อความ
 * ให้ผู้ใช้เห็น เพราะจะบอกผู้โจมตีได้ว่า "key นี้มีอยู่จริงแต่เป็นของร้านอื่น" (SRS §8)
 */
export async function resolveCustomerByKey(
  shopId: string,
  key: string,
): Promise<ResolveCustomerResult> {
  if (!isValidCustomerKey(key)) return { ok: false, reason: 'INVALID_KEY' }
  const entries = await aggregateShopCustomers(shopId)
  const entry = findEntryByKey(entries, key)
  if (!entry) return { ok: false, reason: 'NOT_FOUND' }
  return { ok: true, entry }
}
