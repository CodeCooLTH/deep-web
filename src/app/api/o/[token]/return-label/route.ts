// feature 00056 — ใบปะหน้าพัสดุ **ขากลับ** ที่ผู้ซื้อเปิดเองได้ (หัวหน้าสั่ง 2026-08-24)
//
// 🛑 ทำไมต้องมีเส้นทางสาธารณะ ทั้งที่มี /api/seller/iship/shipments/[id]/label อยู่แล้ว:
// ตัวนั้นต้องเป็นร้านที่ล็อกอิน — แต่คนที่ต้อง **พิมพ์ใบปะหน้า** คือผู้ซื้อ ซึ่งไม่มีบัญชี
// ในระบบส่วนใหญ่ (prod 2026-08-24: Customer 477 คน มีบัญชี 36) ⇒ ต้องเปิดจากลิงก์ได้เลย
//
// สิทธิ์ = `publicToken` ของออเดอร์ ซึ่งเป็นกุญแจเดียวกับหน้า `/o/[token]` ที่ผู้ซื้อถืออยู่แล้ว
// ไม่ได้เปิดข้อมูลใหม่: ใบปะหน้ามีที่อยู่ผู้ซื้อ (ของเขาเอง) + ที่อยู่ร้าน (ที่เขากำลังจะส่งไป)
//
// 🛑 ยังต้อง proxy ผ่านเซิร์ฟเวอร์เสมอ — token ของร้านห้ามหลุดไปที่เบราว์เซอร์ผู้ซื้อ
// (ใครที่เปิด devtools แล้วเห็นจะเอาไปเปิดพัสดุกินเครดิตร้านได้)

import { NextResponse, type NextRequest } from 'next/server'

import { prisma } from '@/lib/prisma'
import { mapIShipError, NO_STORE } from '@/lib/iship/route-helpers'
import { getLabelPdf } from '@/services/iship.service'
import { RETURN_SHIPMENT } from '@/lib/shipment-direction'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: {
      shopId: true,
      shipments: {
        // เฉพาะพัสดุ **ขากลับ** ที่เปิดสำเร็จ — ห้ามหลุดใบขาไป (ผู้ซื้อไม่ต้องพิมพ์ใบนั้น
        // และมันคือใบที่ร้านใช้ส่งของ ไม่ใช่ของที่ผู้ซื้อต้องใช้)
        where: { direction: RETURN_SHIPMENT, status: 'CREATED', isDryRun: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
  })

  if (!order) return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อนี้' }, { status: 404 })

  const shipmentId = order.shipments[0]?.id
  // ยังไม่มีพัสดุขากลับ = ยังไม่ถึงเวลาพิมพ์ ไม่ใช่ error ของผู้ใช้ — บอกตรง ๆ ว่ายังไม่มี
  if (!shipmentId) {
    return NextResponse.json({ error: 'ยังไม่มีใบปะหน้าสำหรับการส่งคืน' }, { status: 404 })
  }

  try {
    const { pdf } = await getLabelPdf(order.shopId, [shipmentId])
    return new Response(pdf, {
      headers: {
        ...NO_STORE,
        'content-type': 'application/pdf',
        // inline = เปิดดู/สั่งพิมพ์ได้ทันทีบนมือถือ ไม่บังคับดาวน์โหลดเป็นไฟล์
        'content-disposition': `inline; filename="return-label-${token}.pdf"`,
      },
    })
  } catch (err) {
    return mapIShipError(err)
  }
}
