import { NextRequest, NextResponse } from "next/server"
import * as v from "valibot"
import { requireAdmin } from "@/lib/auth"
import { rejectItem } from "@/services/command-center.service"
import { mapCommandCenterError, parseItemNumber } from "../../../_shared"

// POST /api/admin/command-center/items/{number}/reject — ตีกลับพร้อมเหตุผล (TFR-CC-05)

const RejectSchema = v.object({
  reason: v.pipe(
    v.string("กรุณาระบุเหตุผลก่อนตีกลับ"),
    v.trim(),
    v.minLength(1, "กรุณาระบุเหตุผลก่อนตีกลับ"),
    v.maxLength(2000, "เหตุผลยาวเกิน 2,000 ตัวอักษร"),
  ),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 })

  const number = parseItemNumber((await params).number)
  if (number === null) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "กรุณาระบุเหตุผลก่อนตีกลับ" }, { status: 422 })
  }

  // 🛑 เหตุผลว่าง = 422 ก่อนแตะ GitHub — ใบที่ตีกลับโดยไม่มีเหตุผลคือใบที่ developer agent
  //    รับต่อแล้วไม่รู้ว่าต้องแก้อะไร (สิ่งที่ FR-CC-05 มีอยู่เพื่อป้องกัน)
  const parsed = v.safeParse(RejectSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0].message }, { status: 422 })
  }

  try {
    await rejectItem(number, parsed.output.reason)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return mapCommandCenterError(err, "POST")
  }
}
