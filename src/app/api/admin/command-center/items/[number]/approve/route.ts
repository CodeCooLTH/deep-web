import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { approveItem } from "@/services/command-center.service"
import { mapCommandCenterError, parseItemNumber } from "../../../_shared"

// POST /api/admin/command-center/items/{number}/approve — เคาะป้าย "พร้อมขึ้น" (TFR-CC-11)
//
// 🛑 นี่คือ **ประตูอนุมัติเดียวของทั้งระบบ** — ป้าย "พร้อมขึ้น" ปรากฏได้ 2 ทางเท่านั้น:
//    ปุ่มที่เรียก route นี้ หรือ user ติดเองบน GitHub
//    ไม่มี token ของ agent ตัวไหนมีสิทธิ์ติดป้ายนี้ (บังคับตอนออก PAT — นอกโค้ด)

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 })

  const number = parseItemNumber((await params).number)
  if (number === null) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 })

  try {
    // service อ่าน label + kind สดจาก GitHub เอง — ห้ามเชื่อสิ่งที่ client ส่งมา
    await approveItem(number)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return mapCommandCenterError(err, "POST")
  }
}
