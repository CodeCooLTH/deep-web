/**
 * POST /api/shops/current/shortcuts/reset — กลับไปใช้ค่าเริ่มต้น
 * feature 00027 — API.md §4.4
 *
 * ค่าเริ่มต้นคำนวณจาก catalog สด ณ ขณะกด ไม่ใช่ค่าที่คำนวณตอนเปิดหน้า
 */
import { resetShortcuts } from '@/services/shortcut.service'
import { getSessionOr401, respond, handleShortcutError } from '../_shared'

export const dynamic = 'force-dynamic'

export async function POST() {
  const { session, response } = await getSessionOr401()
  if (!session) return response

  try {
    return respond(await resetShortcuts(session))
  } catch (e) {
    return handleShortcutError(e, 'POST /api/shops/current/shortcuts/reset')
  }
}
