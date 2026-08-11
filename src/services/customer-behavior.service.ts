/**
 * customer-behavior.service — เติมป้ายพฤติกรรมลูกค้าให้ "แถวในรายการแชท" แบบ batch
 * (user สั่ง 2026-08-11 รอบสอง: "มันต้องขึ้น label บน chat lists นะ")
 *
 * ทำไมต้องมี service แยกแทนที่จะ query ในหน้า: รายการแชทมีได้ถึง 30 แถวต่อหน้า ถ้าถามทีละแถวคือ
 * N+1 ทันที — ตัวนี้ resolve customerId ทั้งชุดครั้งเดียว (ใช้ `resolveCustomerIds` ตัวเดียวกับ
 * `enrichWithOrderStage` ไม่ก็อปมาเขียนใหม่) แล้วดึงหลักฐานของทุกคนใน query เดียว
 *
 * 🛑 scope ด้วย **(shopId, customerId)** เสมอ — "ประวัติของลูกค้าคนนี้" ต้องแปลว่า "กับร้านนี้"
 * ไม่ใช่ "กับทุกร้านที่ฉันดูอยู่" ในกล่องแชทรวมหลายร้าน (feature 00037) — เหตุผลเดียวกับที่
 * `enrichWithOrderStage` ต้องมี shopId เป็นคีย์แรกของ DISTINCT ON
 * (`docs/conventions/distinct-on-needs-shop-key.md`)
 */
import { prisma } from '@/lib/prisma'
import { summarizeCustomerBehavior, type CustomerBehavior } from '@/lib/customer-behavior'
import { resolveCustomerIds, type Linkable } from './order-stage.service'

const key = (shopId: string, customerId: string) => `${shopId}::${customerId}`

export async function enrichWithCustomerBehavior<T extends Linkable>(
  items: T[],
  shopIds: string[],
): Promise<(T & { customerBehavior: CustomerBehavior | null })[]> {
  if (items.length === 0 || shopIds.length === 0) {
    return items.map((i) => ({ ...i, customerBehavior: null }))
  }

  const customerIdOf = await resolveCustomerIds(items)
  const customerIds = [...new Set([...customerIdOf.values()].filter((x): x is string => x !== null))]
  if (customerIds.length === 0) {
    return items.map((i) => ({ ...i, customerBehavior: null }))
  }

  // หลักฐานรายใบของทุกคนในหน้าเดียว — select แค่ field ที่ตัวตัดสินใช้จริง
  // `shipments.where` ชุดเดียวกับที่หน้าเธรด/ตารางออเดอร์ใช้ — นิยาม "พัสดุของใบนี้" ต้องมีชุดเดียว
  const rows = await prisma.order.findMany({
    where: { shopId: { in: shopIds }, customerId: { in: customerIds } },
    select: {
      shopId: true,
      customerId: true,
      status: true,
      cancelInitiator: true,
      cancelReason: true,
      shipments: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { carrierStatus: true },
      },
    },
  })

  const evidenceByKey = new Map<string, Parameters<typeof summarizeCustomerBehavior>[0]>()
  for (const r of rows) {
    if (!r.customerId) continue
    const k = key(r.shopId, r.customerId)
    const list = evidenceByKey.get(k) ?? []
    list.push({
      status: r.status,
      cancelInitiator: r.cancelInitiator ?? null,
      cancelReason: r.cancelReason ?? null,
      activeShipmentCarrierStatus: r.shipments[0]?.carrierStatus ?? null,
    })
    evidenceByKey.set(k, list)
  }

  const summaryCache = new Map<string, CustomerBehavior>()
  return items.map((i) => {
    const cid = customerIdOf.get(i) ?? null
    if (!cid) return { ...i, customerBehavior: null }
    const k = key(i.shopId, cid)
    const evidence = evidenceByKey.get(k)
    // ผูกกับลูกค้าในระบบแล้วแต่ยังไม่เคยมีออเดอร์กับร้านนี้ → คืน summary ว่าง (ไม่ใช่ null)
    // เพื่อให้ฝั่ง UI แยก "ยังไม่ผูก" (null) ออกจาก "ผูกแล้วแต่ยังไม่เคยสั่ง" ได้
    if (!evidence) return { ...i, customerBehavior: summarizeCustomerBehavior([]) }
    let summary = summaryCache.get(k)
    if (!summary) {
      summary = summarizeCustomerBehavior(evidence)
      summaryCache.set(k, summary)
    }
    return { ...i, customerBehavior: summary }
  })
}
