import 'server-only'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { recordOrderEvent } from '@/services/order-event.service'
import { FORWARD_SHIPMENT } from '@/lib/shipment-direction'
import {
  OPEN_RETURN_STATUSES,
  RETURN_BLOCK_TEXT,
  RETURN_SHIPPING_BLOCK_TEXT,
  RETURN_STATUS,
  canCreateReturn,
  computeRefundAmount,
  isFullyReturned,
  parseReturnParcel,
  resolveReturnShippingChoice,
  validateReturnShipping,
  type ReturnMethodKey,
  type ReturnParcelBox,
  type ReturnPayer,
  type ReturnTrackingSource,
} from '@/lib/order-return'
import { toFileUrl } from '@/lib/file-url'

/**
 * order-return.service — ระบบคืนของ (feature 00056)
 *
 * 🛑 **ห้ามมี `prisma.order.create(` ในไฟล์นี้เด็ดขาด** (BR-RT-05 · AC-RT-11)
 * เหตุผลทั้งหมดที่ฟีเจอร์นี้มีอยู่คือ "การคืนของต้องไม่สร้างออเดอร์ใบใหม่" — ของเดิมร้านต้อง
 * สร้าง OD ปลอมเพื่อออกเลขพัสดุขากลับ ทำให้จำนวนออเดอร์/ยอดขาย/Trust Score เฟ้อ
 * มีเทส [blocker] สแกนซอร์สปักหมุดไว้
 */

export class OrderReturnError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'OrderReturnError'
  }
}

/**
 * พัสดุ **ขาไป** ใบล่าสุดของออเดอร์ — ตัวตัดสินว่า "ของถึงมือลูกค้าแล้วหรือยัง"
 *
 * ดึงขนส่ง/เลข/กล่องมาด้วย เพราะจอคืนของต้องใช้ทั้ง 3 อย่างในคำขอเดียวกัน (D-3/D-5):
 * แถบ "ขาไป" บนหัวชีต · ค่าตั้งต้นของขนส่งขากลับ · กล่องที่ใช้ประเมินค่าส่ง
 */
const forwardShipmentQuery = {
  where: { status: 'CREATED', isDryRun: false, direction: FORWARD_SHIPMENT },
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: {
    carrierStatus: true,
    courierCode: true,
    courierName: true,
    trackingNo: true,
    weight: true,
    width: true,
    length: true,
    height: true,
  },
} as const

/**
 * loadReturnContext — ข้อมูลทั้งหมดที่ใช้ตัดสิน อ่านครั้งเดียว
 *
 * scope ownership ใน `where` ไม่ใช่ดึงมาแล้วเช็คทีหลัง — การ throw หลังดึงข้อมูลทำให้ PII
 * ไหลเข้า payload ไปแล้ว (feedback_rsc_dal_authz)
 */
async function loadReturnContext(shopId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
    select: {
      id: true,
      status: true,
      buyerName: true,
      buyerContact: true,
      shippingAddress: true,
      items: {
        select: {
          id: true,
          name: true,
          qty: true,
          price: true,
          // รูปสินค้าจริงในแถวเลือกของ (D-9) — ไม่มีรูป = กล่องเทาเปล่า ห้ามใช้ไอคอนแทน
          product: { select: { images: true } },
        },
      },
      shipments: forwardShipmentQuery,
      /**
       * 🛑 เลขพัสดุมี **2 ทางเข้า เก็บคนละตาราง** (docs/conventions/one-value-many-entry-points.md)
       * ส่งเอง → `ShipmentTracking` (ชื่อขนส่งเป็นข้อความ ไม่มีรหัส) · ผ่าน iShip → `OrderShipment`
       * อ่านทางเดียวแล้วแถบ "ขาไป" จะว่างเปล่าสำหรับร้านที่แจ้งเลขเอง ซึ่งเป็นครึ่งหนึ่งของร้าน
       */
      shipmentTracking: { select: { provider: true, trackingNo: true } },
      returns: {
        select: {
          id: true,
          status: true,
          items: { select: { orderItemId: true, qty: true } },
        },
      },
    },
  })
  if (!order) throw new OrderReturnError('NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้')
  return order
}

type LoadedOrder = Awaited<ReturnType<typeof loadReturnContext>>

/**
 * claimedQtyByItem — จำนวนที่ถูก "จอง" ไปแล้วต่อรายการ
 *
 * 🛑 นับเฉพาะใบที่ **สำเร็จแล้ว** (`RECEIVED`) และใบที่ **ยังไม่จบ** — ใบที่ถูกยกเลิกต้องคืน
 * โควตากลับมา ไม่งั้นลูกค้าที่เปลี่ยนใจครั้งเดียวจะคืนของชิ้นนั้นไม่ได้อีกตลอดไป (BR-RT-04)
 */
function claimedQtyByItem(order: LoadedOrder): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of order.returns) {
    if (r.status === RETURN_STATUS.CANCELLED) continue
    for (const it of r.items) m.set(it.orderItemId, (m.get(it.orderItemId) ?? 0) + it.qty)
  }
  return m
}

export type ReturnableItem = {
  orderItemId: string
  name: string
  orderedQty: number
  returnedQty: number
  remainingQty: number
  unitPrice: number
  /** รูปสินค้าจริง (D-9) — `null` = ไม่มีรูป จอต้องแสดงกล่องเทาเปล่า **ห้ามใช้ไอคอนแทน** */
  imageUrl: string | null
}

/**
 * พัสดุ **ขาไป** ที่แถบบนสุดของชีตต้องแสดง — รวมสองทางเข้าเป็นรูปเดียว
 *
 * 🛑 iShip ชนะเมื่อมีทั้งคู่ (มีรหัสขนส่งจริง จับคู่โลโก้/สถานะได้) แต่ห้ามอ่านทางเดียว
 * — ร้านที่แจ้งเลขเองมีแค่ `ShipmentTracking` และเป็นครึ่งหนึ่งของร้านทั้งหมด
 */
export type ForwardParcelFacts = {
  courierCode: string | null
  courierName: string | null
  trackingNo: string | null
  /** สถานะดิบจากขนส่ง — จอแปลเป็นชิปเองด้วย SSOT เดียวกับหน้าอื่น (`deriveShippingStage`) */
  carrierStatus: string | null
  /** กล่องของขาไป = ค่าตั้งต้นของขากลับ (D-5) · null ทั้งก้อนเมื่อไม่ครบ 4 ช่อง */
  box: ReturnParcelBox | null
}

/** รายการที่ยังคืนได้ + เหตุผลถ้าคืนไม่ได้ — หน้าจอเรียกตัวนี้ตัวเดียว ไม่คิดเกณฑ์เอง */
export async function getReturnEligibility(shopId: string, orderId: string) {
  const order = await loadReturnContext(shopId, orderId)
  const claimed = claimedQtyByItem(order)

  const items: ReturnableItem[] = order.items.map((i) => {
    const returnedQty = claimed.get(i.id) ?? 0
    // `images[]` เก็บได้ทั้ง fileId และ URL เต็ม (seed/external) — `toFileUrl` เป็นตัวตัดสิน
    // ที่เดียวของทั้งระบบ ห้ามต่อ `/api/files/` เอง (จะได้ `/api/files/https://…` = 404)
    const images = i.product?.images
    const firstImage = Array.isArray(images) && images.length > 0 ? images[0] : null
    return {
      orderItemId: i.id,
      name: i.name,
      orderedQty: i.qty,
      returnedQty,
      remainingQty: Math.max(0, i.qty - returnedQty),
      unitPrice: Number(i.price),
      imageUrl: typeof firstImage === 'string' ? toFileUrl(firstImage) : null,
    }
  })

  const blocked = canCreateReturn({
    orderStatus: order.status,
    forwardCarrierStatus: order.shipments[0]?.carrierStatus ?? null,
    hasOpenReturn: order.returns.some((r) =>
      (OPEN_RETURN_STATUSES as string[]).includes(r.status),
    ),
    remainingQty: items.reduce((sum, i) => sum + i.remainingQty, 0),
  })

  /**
   * ใบคืนที่มีอยู่ — ดึงในคำขอเดียวกับสิทธิ์ เพราะหน้าจอต้องใช้พร้อมกันเสมอ
   * (แยกเป็นสอง endpoint = สองสถานะที่อาจไม่ตรงกันบนจอเดียว)
   */
  const rows = await prisma.orderReturn.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      payer: true,
      trackingSource: true,
      manualTrackingNo: true,
      returnCourierCode: true,
      returnCourierName: true,
      countAsCost: true,
      refundAmount: true,
      createdAt: true,
      shipment: { select: { trackingNo: true } },
    },
  })

  /**
   * เชื่อม iShip อยู่ไหม — ตัดสินว่าจอจะโชว์วิธี "ส่งด้วย iShip" หรือซ่อนทั้งข้อ
   *
   * 🛑 เกณฑ์เดียวกับ `getShipmentPanelOrReason()` เป๊ะ (มีแถว + ไม่ใช่ DISCONNECTED) —
   * เขียนเกณฑ์ที่สองขึ้นมาเมื่อไหร่ จอนี้กับโมดัลเปิดพัสดุจะตัดสินไม่ตรงกันวันที่ร้าน
   * ยกเลิกการเชื่อมต่อ แล้วร้านจะเห็นตัวเลือกที่กดแล้วตายที่ปลายทาง
   */
  const ishipAccount = await prisma.shopShippingAccount.findUnique({
    where: { shopId },
    select: { status: true },
  })
  const ishipConnected = ishipAccount != null && ishipAccount.status !== 'DISCONNECTED'

  const fwd = order.shipments[0]
  const dec = (v: unknown) => (v == null ? null : Number(v))
  const forward: ForwardParcelFacts = {
    // iShip ชนะเมื่อมีทั้งคู่ — มีรหัสขนส่งจริงจึงแปลเป็นโลโก้/สถานะได้
    courierCode: fwd?.courierCode ?? null,
    courierName: fwd?.courierName ?? order.shipmentTracking?.provider ?? null,
    trackingNo: fwd?.trackingNo ?? order.shipmentTracking?.trackingNo ?? null,
    carrierStatus: fwd?.carrierStatus ?? null,
    box: parseReturnParcel({
      weight: dec(fwd?.weight),
      width: fwd?.width,
      length: fwd?.length,
      height: fwd?.height,
    }),
  }

  return {
    canReturn: blocked === null,
    blockedReason: blocked,
    blockedText: blocked ? RETURN_BLOCK_TEXT[blocked] : null,
    /** 🛑 ไม่มีที่อยู่/ชื่อ/เบอร์ผู้ซื้อในนี้เลย — หน้านี้อยู่ใต้ client layout ค่าที่ส่งไปไหลเข้า
     *  flight payload · การประเมินค่าส่งอ่านที่อยู่ฝั่ง server เอง (route `/returns/quote`) */
    forward,
    ishipConnected,
    orderStatus: order.status,
    items,
    returns: rows.map((r) => ({
      id: r.id,
      status: r.status,
      payer: r.payer as ReturnPayer,
      trackingSource: r.trackingSource as ReturnTrackingSource,
      manualTrackingNo: r.manualTrackingNo,
      returnCourierCode: r.returnCourierCode,
      returnCourierName: r.returnCourierName,
      countAsCost: r.countAsCost,
      // Decimal → number ที่ RSC/JSON boundary — ห้ามปล่อย Decimal ข้ามไปฝั่ง client
      refundAmount: r.refundAmount != null ? Number(r.refundAmount) : null,
      createdAt: r.createdAt.toISOString(),
      trackingNo: r.shipment?.trackingNo ?? null,
    })),
  }
}

/**
 * CreateReturnInput — สิ่งที่จอส่งมา
 *
 * 🛑 **จอส่ง `method` มาเท่านั้น ห้ามส่ง `payer`/`trackingSource`** (D-1) — สองค่านั้นเป็น
 * *ผลลัพธ์* ที่ `resolveReturnShippingChoice()` ตัดสิน ถ้าเปิดให้ client ส่งมาเอง คู่ที่เป็นไป
 * ไม่ได้ (ลูกค้าจ่าย + ระบบออกเลข) จะกลับมาเป็น "สิ่งที่ต้องกันด้วยกฎ" แทนที่จะเป็นไปไม่ได้
 * โดยโครงสร้าง ซึ่งเป็นรูปร่างของบั๊กที่ 5 ตัวเลือกเดิมมีอยู่
 */
export type CreateReturnInput = {
  items: { orderItemId: string; qty: number }[]
  reason?: string | null
  method: ReturnMethodKey
  /** เว้นว่างได้ = "ไม่มีเลขพัสดุ" ไม่ใช่ข้อผิดพลาด (D-4 · BR-RT-19) */
  trackingNo?: string | null
  /** ขนส่งขากลับที่ร้านเลือก — รหัสจาก `COURIER_OPTIONS` หรือรหัสแพ็กเกจจริงของ iShip */
  returnCourierCode?: string | null
  returnCourierName?: string | null
  /** กล่องขากลับเมื่อร้านกดแก้เอง (D-5) — null/ไม่ครบ = ใช้กล่องของขาไป */
  returnParcel?: unknown
  countAsCost?: boolean
  shippingCost?: number | null
}

/**
 * createOrderReturn — เปิดใบคืนของ
 *
 * 🛑 ไม่ยิง iShip ที่นี่ — การออกเลขพัสดุขากลับเป็นขั้นแยก (`createReturnShipment`) เพราะมัน
 * ยิงเครือข่ายและตัดเครดิตจริง ถ้ารวมอยู่ใน transaction เดียว ใบคืนจะสร้างไม่ได้เลยเมื่อ iShip ล่ม
 * ทั้งที่การ "บันทึกว่าลูกค้าขอคืน" ไม่ได้ต้องพึ่งขนส่งเลย
 */
export async function createOrderReturn(
  shopId: string,
  userId: string | null,
  orderId: string,
  input: CreateReturnInput,
) {
  // จุดเดียวที่ payer/trackingSource ถูกตัดสิน — และเป็นตัวที่ทิ้งเลขที่หลุดมากับวิธีที่ไม่รับเลข
  const choice = resolveReturnShippingChoice(input.method, input.trackingNo, input.countAsCost)

  /**
   * ด่านนี้ยังต้องอยู่ทั้งที่ `resolveReturnShippingChoice` ผลิตแต่ค่าที่ผ่านอยู่แล้ว —
   * มันคือด่านที่พิสูจน์ว่าสองตัวยังไม่เลื่อนออกจากกัน ถ้าวันหนึ่งมีคนเพิ่มวิธีที่ 4 แล้วลืม
   * กฎบางข้อ ร้านจะเจอ error ที่บอกเหตุผลจริง ไม่ใช่ 500 จาก CHECK ที่ระดับฐาน
   */
  const shippingBlock = validateReturnShipping(choice)
  if (shippingBlock) {
    throw new OrderReturnError(shippingBlock, RETURN_SHIPPING_BLOCK_TEXT[shippingBlock])
  }

  const order = await loadReturnContext(shopId, orderId)
  const claimed = claimedQtyByItem(order)
  const byId = new Map(order.items.map((i) => [i.id, i]))

  const blocked = canCreateReturn({
    orderStatus: order.status,
    forwardCarrierStatus: order.shipments[0]?.carrierStatus ?? null,
    hasOpenReturn: order.returns.some((r) =>
      (OPEN_RETURN_STATUSES as string[]).includes(r.status),
    ),
    remainingQty: order.items.reduce(
      (sum, i) => sum + Math.max(0, i.qty - (claimed.get(i.id) ?? 0)),
      0,
    ),
  })
  if (blocked) throw new OrderReturnError(blocked, RETURN_BLOCK_TEXT[blocked])

  if (input.items.length === 0) {
    throw new OrderReturnError('NO_ITEMS', 'เลือกรายการที่จะคืนอย่างน้อย 1 รายการ')
  }

  const lines = input.items.map((sel) => {
    const item = byId.get(sel.orderItemId)
    if (!item) throw new OrderReturnError('ITEM_NOT_IN_ORDER', 'รายการนี้ไม่ได้อยู่ในคำสั่งซื้อนี้')
    const remaining = Math.max(0, item.qty - (claimed.get(item.id) ?? 0))
    if (!Number.isInteger(sel.qty) || sel.qty < 1) {
      throw new OrderReturnError('QTY_INVALID', 'จำนวนที่คืนต้องเป็นจำนวนเต็มอย่างน้อย 1')
    }
    if (sel.qty > remaining) {
      throw new OrderReturnError(
        'QTY_EXCEEDS_REMAINING',
        `"${item.name}" คืนได้อีกไม่เกิน ${remaining} ชิ้น`,
      )
    }
    // ราคาแช่แข็ง ณ เวลาที่ขาย — ไม่ join กลับไปอ่านราคาสินค้าปัจจุบัน
    return { orderItemId: item.id, qty: sel.qty, unitPrice: Number(item.price) }
  })

  // กล่องขากลับ: ยอมรับเฉพาะก้อนที่ครบ 4 ช่องและเป็นบวกทั้งหมด — ไม่ครบ = ใช้กล่องของขาไป
  const returnParcel: ReturnParcelBox | null = parseReturnParcel(input.returnParcel)

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.orderReturn.create({
        data: {
          orderId,
          shopId,
          status: RETURN_STATUS.REQUESTED,
          reason: input.reason?.trim() || null,
          payer: choice.payer,
          trackingSource: choice.trackingSource,
          manualTrackingNo: choice.manualTrackingNo,
          returnCourierCode: input.returnCourierCode?.trim() || null,
          returnCourierName: input.returnCourierName?.trim() || null,
          returnParcel: returnParcel ?? Prisma.DbNull,
          countAsCost: choice.countAsCost,
          shippingCost: input.shippingCost != null ? new Prisma.Decimal(input.shippingCost) : null,
          createdByUserId: userId,
          items: { create: lines },
        },
        select: { id: true, status: true, trackingSource: true, returnCourierCode: true },
      })

      await recordOrderEvent(tx, {
        orderId,
        type: 'RETURN_REQUESTED',
        actorUserId: userId,
        meta: {
          returnId: created.id,
          itemCount: lines.length,
          refundAmount: computeRefundAmount(lines),
          method: input.method,
          payer: choice.payer,
          trackingSource: choice.trackingSource,
          returnCourierCode: input.returnCourierCode?.trim() || null,
        } as never,
      })

      return created
    })
  } catch (e) {
    /**
     * 🛑 P2002 บน partial unique `(orderId) WHERE status IN ('REQUESTED','SHIPPING')` =
     * มีคนในร้านกดพร้อมกันแล้วอีกคนสร้างสำเร็จไปก่อน (BR-RT-03)
     * ด่านในโค้ดข้างบนกันได้แค่กรณีที่อ่านแล้วเห็น — ความถูกต้องต้องอยู่ที่ฐานเสมอ
     */
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new OrderReturnError('RETURN_ALREADY_OPEN', RETURN_BLOCK_TEXT.RETURN_ALREADY_OPEN)
    }
    throw e
  }
}

/**
 * receiveOrderReturn — ร้านกดยืนยันว่าของกลับถึงแล้ว
 *
 * 🛑 **จุดเดียวที่ผลทางบัญชีเกิด** (BRD §2) — ของที่ยังไม่กลับถึงร้านคือของที่ยังอยู่กับลูกค้า
 * หักยอดตั้งแต่ตอนกดขอคืนแล้วลูกค้าเปลี่ยนใจ = ต้องย้อนคืน ซึ่งไม่มีใครทำถูกทุกครั้ง
 */
export async function receiveOrderReturn(shopId: string, userId: string | null, returnId: string) {
  const ret = await prisma.orderReturn.findFirst({
    where: { id: returnId, shopId },
    select: {
      id: true,
      orderId: true,
      status: true,
      items: { select: { orderItemId: true, qty: true, unitPrice: true } },
    },
  })
  if (!ret) throw new OrderReturnError('NOT_FOUND', 'ไม่พบใบคืนของนี้')
  if (ret.status === RETURN_STATUS.RECEIVED) {
    throw new OrderReturnError('ALREADY_RECEIVED', 'ใบคืนนี้ยืนยันรับของไปแล้ว')
  }
  if (ret.status === RETURN_STATUS.CANCELLED) {
    throw new OrderReturnError('RETURN_CANCELLED', 'ใบคืนนี้ถูกยกเลิกไปแล้ว')
  }

  const refundAmount = computeRefundAmount(
    ret.items.map((i) => ({ qty: i.qty, unitPrice: Number(i.unitPrice) })),
  )

  return prisma.$transaction(async (tx) => {
    await tx.orderReturn.update({
      where: { id: ret.id },
      data: {
        status: RETURN_STATUS.RECEIVED,
        receivedAt: new Date(),
        refundAmount: new Prisma.Decimal(refundAmount),
      },
    })

    /**
     * `Order.status = 'RETURNED'` เมื่อ **ทุกรายการถูกคืนครบ** เท่านั้น (BR-RT-06)
     * คืนบางส่วน = สถานะเดิมไม่เปลี่ยน (ยอดขายหักตามจริงอยู่แล้วผ่าน refundAmount)
     *
     * อ่านสถานะการคืนใหม่ทั้งหมด **ในทรานแซกชันเดียวกัน** ไม่ใช้ค่าที่อ่านมาก่อนหน้า —
     * ระหว่างนั้นอาจมีใบคืนอื่นของออเดอร์เดียวกันถูกยืนยันไปแล้ว
     */
    const order = await tx.order.findUniqueOrThrow({
      where: { id: ret.orderId },
      select: {
        status: true,
        items: { select: { id: true, qty: true } },
        returns: {
          where: { status: RETURN_STATUS.RECEIVED },
          select: { items: { select: { orderItemId: true, qty: true } } },
        },
      },
    })

    const received = new Map<string, number>()
    for (const r of order.returns) {
      for (const it of r.items) {
        received.set(it.orderItemId, (received.get(it.orderItemId) ?? 0) + it.qty)
      }
    }
    const full = isFullyReturned(
      order.items.map((i) => ({ orderedQty: i.qty, returnedQty: received.get(i.id) ?? 0 })),
    )

    if (full && order.status !== 'CANCELLED') {
      await tx.order.update({ where: { id: ret.orderId }, data: { status: 'RETURNED' } })
    }

    await recordOrderEvent(tx, {
      orderId: ret.orderId,
      type: 'RETURN_RECEIVED',
      actorUserId: userId,
      meta: { returnId: ret.id, refundAmount, fullyReturned: full } as never,
    })

    return { id: ret.id, refundAmount, fullyReturned: full }
  })
}

/** ยกเลิกเรื่องคืน — ไม่มีผลย้อนหลังใด ๆ (AC-RT-09) โควตาที่จองไว้ถูกคืนโดยอัตโนมัติ */
export async function cancelOrderReturn(shopId: string, userId: string | null, returnId: string) {
  const ret = await prisma.orderReturn.findFirst({
    where: { id: returnId, shopId },
    select: { id: true, orderId: true, status: true },
  })
  if (!ret) throw new OrderReturnError('NOT_FOUND', 'ไม่พบใบคืนของนี้')
  if (ret.status === RETURN_STATUS.RECEIVED) {
    // ของกลับมาถึงร้านแล้วและยอดถูกหักไปแล้ว — ยกเลิกตรงนี้จะทำให้ตัวเลขกับของจริงไม่ตรงกัน
    throw new OrderReturnError('ALREADY_RECEIVED', 'ใบคืนที่รับของแล้วยกเลิกไม่ได้')
  }

  return prisma.$transaction(async (tx) => {
    await tx.orderReturn.update({
      where: { id: ret.id },
      data: { status: RETURN_STATUS.CANCELLED, cancelledAt: new Date() },
    })
    await recordOrderEvent(tx, {
      orderId: ret.orderId,
      type: 'RETURN_CANCELLED',
      actorUserId: userId,
      meta: { returnId: ret.id } as never,
    })
    return { id: ret.id }
  })
}
