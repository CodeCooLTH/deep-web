import { NextRequest, NextResponse } from "next/server"
import * as v from "valibot"
import { requireAdmin } from "@/lib/auth"
import { createTask } from "@/services/command-center.service"
import { mapCommandCenterError } from "../_shared"

// POST /api/admin/command-center/tasks — สั่งงานใหม่ (TFR-CC-01)

const CreateTaskSchema = v.object({
  title: v.pipe(
    v.string("กรุณากรอกหัวข้องาน"),
    v.trim(),
    v.minLength(1, "กรุณากรอกหัวข้องาน"),
    v.maxLength(200, "หัวข้องานยาวเกิน 200 ตัวอักษร"),
  ),
  description: v.pipe(
    v.string("กรุณากรอกรายละเอียด"),
    v.trim(),
    v.minLength(1, "กรุณากรอกรายละเอียด"),
    v.maxLength(5000, "รายละเอียดยาวเกิน 5,000 ตัวอักษร"),
  ),
})

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 422 })
  }

  // 🛑 validate ก่อนแตะ GitHub เสมอ — ใบงานที่หัวข้อว่างไม่ควรไปเกิดบน GitHub แล้วค่อยลบ
  const parsed = v.safeParse(CreateTaskSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0].message }, { status: 422 })
  }

  try {
    const created = await createTask(parsed.output.title, parsed.output.description)
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    // 🛑 ไม่ retry อัตโนมัติ — การสั่งซ้ำเป็นการตัดสินใจของ user ไม่ใช่ของระบบ
    //    (retry เงียบ ๆ = ใบงานซ้ำบน GitHub โดยไม่มีใครสั่ง ขัด FR-CC-02)
    return mapCommandCenterError(err, "POST")
  }
}
