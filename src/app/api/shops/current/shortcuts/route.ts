/**
 * GET /api/shops/current/shortcuts — แคตตาล็อก + เมนูลัดที่ปักไว้ของ (ผู้ใช้ x ร้านที่กำลังเปิด)
 * feature 00027 — API.md §4.1
 *
 * ไม่รับ userId/shopId จาก client เลย — derive จาก session + requireActiveShop เท่านั้น
 */
import { resolveShortcutState } from '@/services/shortcut.service'
import { getSessionOr401, respond, handleShortcutError } from './_shared'

// per-user data — ห้ามให้ CDN/proxy แคชข้ามคน (memory feedback_auth_api_cache_control)
export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, response } = await getSessionOr401()
  if (!session) return response

  try {
    const res = respond(await resolveShortcutState(session))
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  } catch (e) {
    return handleShortcutError(e, 'GET /api/shops/current/shortcuts')
  }
}
