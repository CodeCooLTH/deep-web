import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { stopItem } from "@/services/command-center.service"
import { mapCommandCenterError, parseItemNumber } from "../../../_shared"

// POST /api/admin/command-center/items/{number}/stop — หยุดงาน (TFR-CC-12)
// ถอดป้าย stage:* ทุกตัว · ไม่เพิ่มป้ายใหม่ · ไม่โพสต์ comment · เรียกซ้ำ = idempotent success

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 })

  const number = parseItemNumber((await params).number)
  if (number === null) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 })

  try {
    await stopItem(number)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return mapCommandCenterError(err, "POST")
  }
}
