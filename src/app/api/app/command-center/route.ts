import { NextResponse } from 'next/server'

// GET /api/app/command-center — 4 tile ลัดบนหน้า Home (UI config คงที่)
// id ฝั่งแอป map → ไอคอน/สี (ดู CommandTile). sublabel เป็น static ก่อน.
export async function GET() {
  // id ต้องเป็น cc1–cc4 ให้ตรง ICON_MAP ใน CommandTile (wallet/calendar/pricetag/bell)
  return NextResponse.json([
    { id: 'cc1', emoji: '💰', label: 'กระเป๋าเงิน', sublabel: 'ยอดคงเหลือ' },
    { id: 'cc2', emoji: '📅', label: 'นัดหมาย', sublabel: 'รายการนัด' },
    { id: 'cc3', emoji: '🏷️', label: 'ดีลเด็ด', sublabel: 'โปรวันนี้' },
    { id: 'cc4', emoji: '🔔', label: 'แจ้งเตือน', sublabel: 'ล่าสุด' },
  ])
}
