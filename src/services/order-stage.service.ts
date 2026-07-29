import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { deriveOrderStage, type OrderStageInput } from '@/lib/order-stage'

/**
 * order-stage.service — หา "ออเดอร์ล่าสุดของลูกค้าแต่ละเธรด" เพื่อทำป้ายสถานะในรายการแชท
 * (user request 2026-07-29 — แทนชิปตะกร้า+จำนวนเดิม)
 *
 * ทำไมอยู่ที่นี่ ไม่ได้อยู่ใน route: หน้า inbox โหลดหน้าแรกแบบ RSC (page.tsx เรียก service ตรง)
 * แต่ตอนกรอง/เลื่อนหน้าไปดึงผ่าน GET /api/chat/conversations — สองทางคนละไฟล์กัน
 * ของเดิม (enrichWithOrderCount) เขียนไว้ใน route ทางเดียว ผลคือ **ชิปไม่ขึ้นตอนโหลดหน้าแรก**
 * แล้วค่อยโผล่หลัง client refetch ครั้งแรก. ย้ายมาเป็น service กลางให้ทั้งสองทางเรียกตัวเดียวกัน
 * จึงปิดช่องนั้นไปด้วยในตัว
 */

/** เส้นเชื่อม conversation → Customer: ช่องทางนอกผ่าน ExternalContact.customerId, DEEP ผ่าน Customer.userId */
type Linkable = { externalContactId: string | null; buyerUserId: string | null }

async function resolveCustomerIds<T extends Linkable>(items: T[]): Promise<Map<T, string | null>> {
  const externalContactIds = [
    ...new Set(items.map((i) => i.externalContactId).filter((x): x is string => x !== null)),
  ]
  const buyerUserIds = [
    ...new Set(items.map((i) => i.buyerUserId).filter((x): x is string => x !== null)),
  ]

  const [contacts, users] = await Promise.all([
    externalContactIds.length
      ? prisma.externalContact.findMany({
          where: { id: { in: externalContactIds } },
          select: { id: true, customerId: true },
        })
      : Promise.resolve([] as { id: string; customerId: string | null }[]),
    buyerUserIds.length
      ? prisma.user.findMany({
          where: { id: { in: buyerUserIds } },
          select: { id: true, customer: { select: { id: true } } },
        })
      : Promise.resolve([] as { id: string; customer: { id: string } | null }[]),
  ])

  const contactCustomer = new Map(contacts.map((c) => [c.id, c.customerId]))
  const userCustomer = new Map(users.map((u) => [u.id, u.customer?.id ?? null]))

  return new Map(
    items.map((i) => [
      i,
      i.externalContactId
        ? contactCustomer.get(i.externalContactId) ?? null
        : i.buyerUserId
          ? userCustomer.get(i.buyerUserId) ?? null
          : null,
    ]),
  )
}

type LatestOrderRow = {
  customerId: string
  status: string
  statusAt: Date
  labelPrintedAt: Date | null
  labelPrintCount: number | null
  carrierStatus: string | null
}

/**
 * enrichWithOrderStage — เติม `orderStage` ให้ทุกแถว (null = ไม่ต้องแสดงชิป)
 *
 * ทำไม raw SQL: ต้องได้ "ออเดอร์ล่าสุด 1 ใบต่อลูกค้า" พร้อมข้อมูลพัสดุของใบนั้น ในคิวรีเดียว
 * `DISTINCT ON` ของ Postgres ทำได้ตรง ๆ ส่วนทางฝั่ง Prisma ต้องดึงออเดอร์ทั้งหมดของทุกลูกค้ามา
 * แล้วคัดใน JS (ลูกค้าเก่าที่ซื้อบ่อยอาจมีเป็นร้อยใบ ดึงมาทิ้งเกือบหมด) หรือไม่ก็ยิงทีละคน = N+1
 *
 * LEFT JOIN LATERAL — พัสดุใบที่ยัง active ล่าสุดของออเดอร์นั้น; ออเดอร์ที่ไม่มีพัสดุก็ยังคืนแถว
 * (INNER JOIN จะทำให้ออเดอร์ที่ยังไม่ได้สร้างพัสดุหายไปทั้งใบ = ป้าย "สั่งซื้อแล้ว" ไม่มีวันขึ้น)
 *
 * statusAt = COALESCE(carrierStatusAt, o.updatedAt) — ใช้ตัดสินว่าป้ายหมดอายุหรือยัง
 * ตรงเป๊ะสำหรับเคส "ขนส่งแจ้งว่าส่งถึงแล้ว" (มี carrierStatusAt จริง) ส่วนเคสอื่น (ร้านกดยกเลิก,
 * ผู้ซื้อกดยืนยันรับของ) ตาราง Order ไม่มีคอลัมน์เวลาต่อสถานะ จึงใช้ updatedAt เป็นตัวแทน —
 * แม่นพอสำหรับกฎ "แสดง 1-3 วัน" เพราะการแก้ไขออเดอร์หลังปิดงานแทบไม่เกิด แต่ถ้าวันหลังมีคน
 * แก้ออเดอร์ที่ปิดไปแล้ว ป้ายจะกลับมาโผล่อีกรอบ (ยอมรับได้ — ไม่ใช่ข้อมูลผิด แค่โผล่นานกว่าที่ควร)
 */
export async function enrichWithOrderStage<T extends Linkable>(
  items: T[],
  shopId: string,
  now: number = Date.now(),
): Promise<(T & { orderStage: ReturnType<typeof deriveOrderStage> })[]> {
  if (items.length === 0) return []

  const customerIdOf = await resolveCustomerIds(items)
  const customerIds = [...new Set([...customerIdOf.values()].filter((x): x is string => x !== null))]
  if (customerIds.length === 0) {
    return items.map((i) => ({ ...i, orderStage: null }))
  }

  const rows = await prisma.$queryRaw<LatestOrderRow[]>`
    SELECT DISTINCT ON (o."customerId")
      o."customerId" AS "customerId",
      o."status"     AS "status",
      COALESCE(s."carrierStatusAt", o."updatedAt") AS "statusAt",
      s."labelPrintedAt"  AS "labelPrintedAt",
      s."labelPrintCount" AS "labelPrintCount",
      s."carrierStatus"   AS "carrierStatus"
    FROM "Order" o
    LEFT JOIN LATERAL (
      SELECT sh."labelPrintedAt", sh."labelPrintCount", sh."carrierStatus", sh."carrierStatusAt"
      FROM "OrderShipment" sh
      WHERE sh."orderId" = o."id" AND sh."status" <> 'CANCELLED'
      ORDER BY sh."createdAt" DESC
      LIMIT 1
    ) s ON true
    WHERE o."shopId" = ${shopId}
      AND o."customerId" IN (${Prisma.join(customerIds)})
    ORDER BY o."customerId", o."createdAt" DESC
  `

  const byCustomer = new Map<string, OrderStageInput>(
    rows.map((r) => [
      r.customerId,
      {
        status: r.status,
        statusAt: r.statusAt,
        labelPrintedAt: r.labelPrintedAt,
        labelPrintCount: r.labelPrintCount,
        carrierStatus: r.carrierStatus,
      },
    ]),
  )

  return items.map((i) => {
    const cid = customerIdOf.get(i) ?? null
    return { ...i, orderStage: deriveOrderStage(cid ? byCustomer.get(cid) ?? null : null, now) }
  })
}
