import { NextResponse } from 'next/server'

// GET /api/app/command-center — 4 tile ลัดบนหน้า Home (UI config คงที่)
// id ฝั่งแอป map → ไอคอน/สี (ดู CommandTile). sublabel เป็น static ก่อน.
export async function GET() {
  // ฟีเจอร์จริงของผู้ซื้อ (เน้น Trust/กันโกง) — id cc1–cc4 ตรง ICON_MAP + route ใน CommandTile/Home
  return NextResponse.json([
    { id: 'cc1', emoji: '🛡️', label: 'Trust ฉัน', sublabel: 'ความน่าเชื่อถือ' },
    { id: 'cc2', emoji: '🔨', label: 'ที่ฉันบิด', sublabel: 'ประมูลที่ติดตาม' },
    { id: 'cc3', emoji: '🧾', label: 'ออเดอร์', sublabel: 'คำสั่งซื้อ' },
    { id: 'cc4', emoji: '🔔', label: 'แจ้งเตือน', sublabel: 'ล่าสุด' },
  ])
}
