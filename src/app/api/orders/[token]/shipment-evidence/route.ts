// feature 00055 — หลักฐานจากขนส่งของออเดอร์ใบนี้ (อ่านอย่างเดียว)
//
// 🛑 **ไม่คืนคอลัมน์ `parcel` ออกไปเด็ดขาด** (BR-BR-22)
// `parcel` คือ payload ดิบของ `get_order` ซึ่งมีชื่อ/เบอร์/ที่อยู่ผู้รับแบบไม่ตัดทอน —
// มันถูกเก็บไว้เพื่อ *การสืบสวนข้อพิพาท* ไม่ใช่เพื่อแสดงบนจอ และร้านเห็นที่อยู่ของออเดอร์
// ตัวเองอยู่แล้วในหน้าเดียวกัน การส่งก้อนดิบไปอีกทางจึงเพิ่มความเสี่ยงโดยไม่เพิ่มข้อมูล
//
// สิ่งที่เป็นหลักฐานจริงคือ `traces` — บันทึกของขนส่งเองว่าพยายามส่งกี่ครั้ง เมื่อไร ที่ไหน
// ซึ่งเป็นสิ่งเดียวที่ตอบคำถาม "มีคนเอาของไปส่งจริงไหม" ได้

import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'
import { describeCarrierStatus } from '@/lib/iship/status'

export const dynamic = 'force-dynamic'

/** แถวเดินทางดิบจาก iShip — ชื่อฟิลด์เป็น snake_case ตามที่ผู้ให้บริการส่งมา */
type RawTrace = {
  status?: unknown
  status_text?: unknown
  status_desc?: unknown
  current_location?: unknown
  timestamp?: unknown
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { id: true, shopId: true },
  })
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (!(await canAccessShop(order.shopId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await prisma.shipmentEvidence.findMany({
    where: { orderId: order.id },
    // 🛑 ไม่มี `parcel` ใน select — บังคับที่ชั้น query ไม่ใช่ที่การ render
    // (ค่าที่ดึงมาจะไหลเข้า payload ฟรี ๆ แม้จอไม่แสดง)
    select: { id: true, reason: true, capturedAt: true, traceCount: true, traces: true, error: true },
    orderBy: { capturedAt: 'asc' },
  })

  return NextResponse.json({
    evidence: rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      // คำไทยของสถานะมาจากตารางกลาง ไม่พิมพ์เองที่นี่ (HR16)
      reasonText: describeCarrierStatus(r.reason).text,
      capturedAt: r.capturedAt.toISOString(),
      traceCount: r.traceCount,
      error: r.error,
      /**
       * normalize เฉพาะ 4 ช่องที่ใช้เล่าเรื่อง — ไม่ส่งก้อนดิบทั้งอัน
       * แถวที่ไม่มี timestamp ก็ยังส่ง (ไม่กรองทิ้ง) เพราะ "ขนส่งบันทึกไม่ครบ" เป็นข้อมูล
       * ในตัวมันเอง การกรองทิ้งจะทำให้จำนวนที่เห็นบนจอไม่ตรงกับ traceCount ที่บันทึกไว้
       */
      traces: Array.isArray(r.traces)
        ? (r.traces as RawTrace[]).map((t) => ({
            status: str(t.status),
            statusText: str(t.status_text),
            statusDesc: str(t.status_desc),
            location: str(t.current_location),
            occurredAt:
              typeof t.timestamp === 'number' ? new Date(t.timestamp * 1000).toISOString() : null,
          }))
        : [],
    })),
  })
}
