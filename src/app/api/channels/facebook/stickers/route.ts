import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchStickerPacks, fetchStickersInPack, searchStickers, GraphApiError } from '@/lib/facebook/graph'

/**
 * GET /api/channels/facebook/stickers — พร็อกซี Sticker Catalog API ของ Meta
 * (user สั่ง 2026-08-04 "channel ที่เป็น facebook รองรับ sticker ด้วย")
 *
 *   ?packs=1     → รายการแพ็ก
 *   ?packId=<id> → สติกเกอร์ในแพ็กนั้น
 *   ?q=<คำค้น>   → ค้นข้ามทุกแพ็ก (Meta บังคับ ≥2 ตัวอักษร)
 *
 * ทำไมต้องพร็อกซี ไม่ให้ client ยิง Graph ตรง: catalog ใช้ **App Access Token** (`APP_ID|APP_SECRET`)
 * ซึ่งเป็น secret ของแอปทั้งใบ — หลุดไปฝั่ง browser คือคนอื่นยิงแทนแอปเราได้ทั้งหมด
 *
 * ต้องล็อกอิน แต่ไม่ผูกกับร้าน/เพจ: catalog เป็นข้อมูลสาธารณะของ Meta เหมือนกันทุกเพจ ไม่มีข้อมูล
 * ของร้านหรือลูกค้าอยู่ในนั้น — เช็ค session พอสำหรับกันคนนอกมาใช้ quota ของแอปเรา
 *
 * cache: แพ็ก/สติกเกอร์แทบไม่เปลี่ยน และ Graph มี rate limit ต่อแอป — ทุกร้านที่เปิดแผงสติกเกอร์
 * ยิงชุดเดียวกันหมด. `private` เพราะ route ตรวจ session (กัน CDN แชร์คำตอบข้ามผู้ใช้)
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const packId = searchParams.get('packId')
  const q = searchParams.get('q')

  try {
    if (packId) {
      const items = await fetchStickersInPack(packId)
      return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
    }
    if (q) {
      // คำค้นสั้นกว่า 2 ตัวอักษร Meta ตีตก — searchStickers คืน [] ให้เองเงียบ ๆ
      const items = await searchStickers(q)
      return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, max-age=300' } })
    }
    const packs = await fetchStickerPacks()
    return NextResponse.json({ packs }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'FB_CHAT_APP_CREDENTIALS_MISSING') {
      return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่าแอป Facebook ในระบบ' }, { status: 503 })
    }
    if (e instanceof GraphApiError) {
      console.error('[GET /api/channels/facebook/stickers] graph', e.message, e.code)
      return NextResponse.json({ error: 'โหลดสติกเกอร์จาก Facebook ไม่สำเร็จ' }, { status: 502 })
    }
    console.error('[GET /api/channels/facebook/stickers]', msg || e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' }, { status: 500 })
  }
}
