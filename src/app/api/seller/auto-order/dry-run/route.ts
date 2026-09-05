import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'

import { parseAutoOrderMessage, matchesTriggerPhrase } from '@/lib/auto-order-parser'
import { computeItemsTotal } from '@/lib/auto-order-reasons'
import { getOrCreateAutoOrderConfig } from '@/services/auto-order-config.service'
import { validateAutoOrderCompleteness } from '@/services/auto-order-validate.service'
import { requireAutoOrderShop } from '../_shared'

export const dynamic = 'force-dynamic'

const BodySchema = v.object({ text: v.pipe(v.string(), v.maxLength(5000)) })

/**
 * POST /api/seller/auto-order/dry-run — "ลองวางข้อความดู" บนหน้าตั้งค่า
 *
 * 🛑 **อ่านอย่างเดียว ไม่เขียนอะไรลงฐานเลยสักแถว** — ไม่ใช่ออเดอร์ ไม่ใช่ร่าง ไม่ใช่การ์ด
 * ต่างจากโหมด TEST (`status='TEST'`) ซึ่งเขียนร่าง `isDryRun=true` จริงในห้องแชทจริง
 * สองอย่างนี้ตอบคนละคำถาม: อันนี้ = "ระบบอ่านข้อความแบบนี้ออกไหม" · อันนั้น = "ทั้งเส้นทาง
 * ตั้งแต่ webhook ถึงการ์ดทำงานจริงไหม"
 */
export async function POST(request: NextRequest) {
  const guard = await requireAutoOrderShop()
  if (!guard.ok) return guard.response

  const parsed = v.safeParse(BodySchema, await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อความไม่ถูกต้อง' }, { status: 400 })

  const config = await getOrCreateAutoOrderConfig(guard.shopId)
  const matchedPhrase = matchesTriggerPhrase(
    parsed.output.text,
    config.phrases.map((p) => p.normalizedPhrase),
  )

  const message = parseAutoOrderMessage(parsed.output.text)
  const now = new Date()
  const validation = await validateAutoOrderCompleteness(guard.shopId, message, now, now.getTime())

  return NextResponse.json({
    matchedPhrase,
    // ไม่ match วลี = ข้อความนี้จะไม่ถูกแตะเลยในสถานการณ์จริง — ต้องบอกแยกจาก "แตะแล้วไม่ครบ"
    wouldTrigger: matchedPhrase !== null,
    complete: validation.complete,
    reasons: validation.reasons,
    parsed: {
      customerName: message.customerName,
      phone: message.phone,
      address: {
        line1: message.addressLine,
        subdistrict: message.subdistrict,
        district: message.district,
        province: message.province,
        postcode: message.postcode,
      },
      items: validation.matchedItems,
      discount: message.discount,
      statedTotal: message.statedTotal,
      // ยอดที่ระบบคำนวณได้ — ตัวเดียวกับที่ใช้ตัดสิน TOTAL_MISMATCH เสมอ (HR16)
      computedTotal: computeItemsTotal({ items: validation.matchedItems, discount: message.discount }),
      note: message.note,
      paymentMethod: message.paymentMethod,
    },
  })
}
