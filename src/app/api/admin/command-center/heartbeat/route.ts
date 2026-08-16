import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getHeartbeat } from "@/services/command-center.service"
import { mapCommandCenterError } from "../_shared"

// GET /api/admin/command-center/heartbeat — ชีพจร Hermes (TFR-CC-14)
// คืนทั้งค่าดิบและสถานะ issue ใน response เดียว (UX spec §9 ข้อ 5)

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 })

  try {
    return NextResponse.json(await getHeartbeat(), {
      headers: { "cache-control": "no-store" },
    })
  } catch (err) {
    // 502 ที่นี่ไม่บล็อกทั้งหน้า — heartbeat เป็นข้อมูลรอง client แสดง banner ที่แถบบนเท่านั้น
    return mapCommandCenterError(err, "GET")
  }
}
