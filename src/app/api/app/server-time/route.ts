import { NextResponse } from 'next/server'

// GET /api/app/server-time — ให้แอป sync นาฬิกา (countdown drift compensation)
// field ต้องชื่อ `serverNowMs` ให้ตรงกับ syncServerTime() ฝั่งแอป (ไม่งั้น offset = NaN)
export async function GET() {
  return NextResponse.json({ serverNowMs: Date.now() })
}
