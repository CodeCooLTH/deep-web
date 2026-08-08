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

/** เส้นเชื่อม conversation → Customer: ช่องทางนอกผ่าน ExternalContact.customerId, DEEP ผ่าน Customer.userId
 *
 * shopId (feature 00037) — จำเป็นตั้งแต่มีกล่องแชทรวมหลายร้าน: `Customer` เป็นตารางระดับ **ทั้งระบบ**
 * (`phone @unique` ไม่ได้ unique ต่อร้าน) ลูกค้าคนเดียวจึงมีออเดอร์ในหลายร้านพร้อมกันได้ ถ้าจับคู่
 * ป้ายสถานะด้วย customerId อย่างเดียว เธรดของร้าน B จะได้ป้ายจากออเดอร์ของร้าน A มาแปะ — ผิดแบบ
 * ที่ดูเนียนมาก (ป้ายขึ้นสวยงามและอัปเดตจริง แค่เป็นออเดอร์คนละร้าน)
 */
type Linkable = { externalContactId: string | null; buyerUserId: string | null; shopId: string }

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
  shopId: string
  customerId: string
  status: string
  statusAt: Date
  labelPrintedAt: Date | null
  labelPrintCount: number | null
  carrierStatus: string | null
  hasShipment: boolean
  serviceStart: Date | null
  appointmentStatus: string | null
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
  /** ร้านที่รายการครอบคลุม (feature 00037) — ความยาว 1 = โหมดเดิม */
  shopIds: string[],
  now: number = Date.now(),
): Promise<(T & { orderStage: ReturnType<typeof deriveOrderStage> })[]> {
  if (items.length === 0 || shopIds.length === 0) return items.map((i) => ({ ...i, orderStage: null }))

  const customerIdOf = await resolveCustomerIds(items)
  const customerIds = [...new Set([...customerIdOf.values()].filter((x): x is string => x !== null))]
  if (customerIds.length === 0) {
    return items.map((i) => ({ ...i, orderStage: null }))
  }

  const rows = await prisma.$queryRaw<LatestOrderRow[]>`
    -- DISTINCT ON ต้องมี shopId เป็นคีย์แรกเสมอ (feature 00037) — "ออเดอร์ล่าสุดของลูกค้าคนนี้"
    -- ต้องแปลว่า "ในร้านนี้" ไม่ใช่ "ในบรรดาทุกร้านที่ฉันดูอยู่" ดู comment ที่ type Linkable
    SELECT DISTINCT ON (o."shopId", o."customerId")
      o."shopId"     AS "shopId",
      o."customerId" AS "customerId",
      o."status"     AS "status",
      -- นัดหมาย (feature 00024/00036) — ป้ายของร้านคิวงานพูดเรื่อง "นัดวันไหน" แทน "สั่งซื้อแล้ว"
      -- serviceStart คือตัวนิยามว่าใบนี้เป็นนัด (ไม่ได้ดูจาก Shop.vertical) ดู appointmentFace()
      o."serviceStart"      AS "serviceStart",
      o."appointmentStatus" AS "appointmentStatus",
      COALESCE(s."carrierStatusAt", o."updatedAt") AS "statusAt",
      s."labelPrintedAt"  AS "labelPrintedAt",
      s."labelPrintCount" AS "labelPrintCount",
      s."carrierStatus"   AS "carrierStatus",
      -- มีแถวพัสดุที่ยัง active อยู่จริงหรือไม่ — ต้องเช็คจาก id ไม่ใช่จาก labelPrintedAt/carrierStatus
      -- เพราะพัสดุที่เพิ่งสร้าง (ยังไม่พิมพ์ ขนส่งยังไม่แจ้ง) ทั้งสองคอลัมน์นั้นเป็น null ทั้งคู่
      (s."id" IS NOT NULL) AS "hasShipment"
    FROM "Order" o
    LEFT JOIN LATERAL (
      SELECT sh."id", sh."labelPrintedAt", sh."labelPrintCount", sh."carrierStatus", sh."carrierStatusAt"
      FROM "OrderShipment" sh
      -- นิยาม "มีพัสดุจริง" ต้องตรงกับ getShippingStageCounts/getOrdersByShop เป๊ะ ๆ:
      -- status='CREATED' และไม่ใช่ของทดสอบ. เดิมใช้ <> 'CANCELLED' ซึ่งนับใบที่ *สร้างไม่สำเร็จ*
      -- (FAILED) ด้วย → แถวในกล่องแชทขึ้นชิป "สร้างพัสดุแล้ว" ทั้งที่ไม่มีเลขพัสดุสักตัว
      -- (user เจอบน prod 2026-08-06: DP256908A896B1BE ล้มเพราะเครดิต iShip ไม่พอ)
      WHERE sh."orderId" = o."id" AND sh."status" = 'CREATED' AND sh."isDryRun" = false
      ORDER BY sh."createdAt" DESC
      LIMIT 1
    ) s ON true
    WHERE o."shopId" IN (${Prisma.join(shopIds)})
      AND o."customerId" IN (${Prisma.join(customerIds)})
    ORDER BY o."shopId", o."customerId", o."createdAt" DESC
  `

  // คีย์เป็น "shopId|customerId" ไม่ใช่ customerId เดี่ยว — ดูเหตุผลที่ type Linkable
  const byCustomer = new Map<string, OrderStageInput>(
    rows.map((r) => [
      `${r.shopId}|${r.customerId}`,
      {
        status: r.status,
        statusAt: r.statusAt,
        labelPrintedAt: r.labelPrintedAt,
        labelPrintCount: r.labelPrintCount,
        carrierStatus: r.carrierStatus,
        hasShipment: r.hasShipment,
        serviceStart: r.serviceStart,
        appointmentStatus: r.appointmentStatus,
      },
    ]),
  )

  return items.map((i) => {
    const cid = customerIdOf.get(i) ?? null
    const key = cid ? `${i.shopId}|${cid}` : null
    return { ...i, orderStage: deriveOrderStage(key ? byCustomer.get(key) ?? null : null, now) }
  })
}
