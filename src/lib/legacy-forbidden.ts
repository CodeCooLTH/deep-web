import { NextResponse } from 'next/server'

/**
 * ด่าน cap ปฏิเสธด้วย 403 FORBIDDEN/FORBIDDEN_ROLE — route ที่ UI เดิมอ่านรหัสเฉพาะ (NOT_OWNER / NOT_PRIMARY_OWNER ของ
 * member-error-text) ต้องได้รหัสเดิม (P2 มติ 0.4) · status อื่น (401/404) ผ่านตามเดิม
 */
export function keepErrorCode(res: NextResponse, code: string): NextResponse {
  return res.status === 403 ? NextResponse.json({ error: code }, { status: 403, headers: { 'cache-control': 'private, no-store' } }) : res
}
