import 'server-only'
import { ACTIVE_FORWARD_SHIPMENT } from '@/lib/shipment-direction'

import { prisma } from '@/lib/prisma'
import { summarizeBuyerReputation, type BuyerReputation } from '@/lib/buyer-reputation'

/**
 * buyer-reputation.service — ดึงสถิติผู้ซื้อ **ข้ามทุกร้าน** (feature 00055 · BR-BR-01)
 *
 * 🛑 **ห้ามมี `shopId` ใน `where` ของไฟล์นี้เด็ดขาด** — นั่นคือความต่างทั้งหมดระหว่างตัวนี้กับ
 * `customer-behavior.service.ts` ที่มีอยู่แล้ว ถ้าเผลอใส่กลับเข้าไป มันจะกลายเป็นสถิติรายร้าน
 * อีกตัวที่ทำงานซ้ำซ้อน โดยหน้าจอยังพาดหัวว่า "ทั้งระบบ" อยู่ = โกหกผู้ใช้แบบที่ไม่มีอะไรฟ้อง
 * (มีเทส [blocker] สแกนซอร์สปักหมุดไว้)
 *
 * 🛑 **`select` ต้องไม่ดึง `shopId`/ชื่อร้าน/`orderId` ออกมาเลย** (BR-BR-02 · มติ D-2)
 * ไม่ใช่ "ดึงมาแล้วไม่แสดง" — ค่าที่ดึงมาจะไหลเข้า flight payload ของ RSC ฟรี ๆ
 * (feedback_rsc_pii_neutralize_at_source) และร้าน A ไม่มีสิทธิ์รู้ว่าลูกค้าเคยสั่งร้าน B
 */

/** ชุดเดียวกับที่ทุกหน้าใช้เรียก "พัสดุของใบนี้" — ห้ามนิยามใหม่ที่นี่ */
const ACTIVE_SHIPMENT = {
  where: ACTIVE_FORWARD_SHIPMENT,
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: { carrierStatus: true },
} as const

export async function getBuyerReputation(customerId: string): Promise<BuyerReputation | null> {
  if (!customerId) return null

  const rows = await prisma.order.findMany({
    // ไม่มี shopId — นี่คือประเด็นทั้งหมดของฟีเจอร์นี้ (BR-BR-01)
    where: { customerId },
    select: {
      status: true,
      cancelInitiator: true,
      cancelReason: true,
      shipments: ACTIVE_SHIPMENT,
    },
  })

  if (rows.length === 0) return null

  return summarizeBuyerReputation(
    rows.map((r) => ({
      status: r.status,
      cancelInitiator: r.cancelInitiator ?? null,
      cancelReason: r.cancelReason ?? null,
      activeShipmentCarrierStatus: r.shipments[0]?.carrierStatus ?? null,
      hasShipment: r.shipments.length > 0,
    })),
  )
}

/**
 * โหลดหลายคนในคำขอเดียว — สำหรับหน้าที่มีลูกค้าหลายคนบนจอเดียว (รายการแชท/ตารางออเดอร์)
 *
 * ยิงคิวรีเดียวแล้วจัดกลุ่มใน TS ไม่วนต่อคน — ปริมาณรับได้เพราะ select แค่ 4 คอลัมน์
 * และหน้าที่เรียกดึงออเดอร์ของตัวเองมาอยู่แล้ว
 */
export async function getBuyerReputations(
  customerIds: string[],
): Promise<Map<string, BuyerReputation>> {
  const ids = [...new Set(customerIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const rows = await prisma.order.findMany({
    where: { customerId: { in: ids } },
    select: {
      // customerId จำเป็นต้องมีเพื่อจัดกลุ่ม — เป็นคีย์ที่ผู้เรียกส่งมาเอง ไม่ใช่ข้อมูลร้านอื่น
      customerId: true,
      status: true,
      cancelInitiator: true,
      cancelReason: true,
      shipments: ACTIVE_SHIPMENT,
    },
  })

  const byCustomer = new Map<string, Parameters<typeof summarizeBuyerReputation>[0]>()
  for (const r of rows) {
    if (!r.customerId) continue
    const list = byCustomer.get(r.customerId) ?? []
    list.push({
      status: r.status,
      cancelInitiator: r.cancelInitiator ?? null,
      cancelReason: r.cancelReason ?? null,
      activeShipmentCarrierStatus: r.shipments[0]?.carrierStatus ?? null,
      hasShipment: r.shipments.length > 0,
    })
    byCustomer.set(r.customerId, list)
  }

  const out = new Map<string, BuyerReputation>()
  for (const [cid, evidence] of byCustomer) out.set(cid, summarizeBuyerReputation(evidence))
  return out
}
