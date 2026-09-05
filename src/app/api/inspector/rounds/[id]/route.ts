import { NextResponse } from 'next/server'
import { getRoundDetailForInspector } from '@/services/inspection-round.service'
import { mapInspectorError, requireInspector } from '../../_shared'

/**
 * GET /api/inspector/rounds/[id] — รายละเอียดรอบ + ข้อที่ต้องบันทึก + หลักฐานที่ร้านส่งมา (API §4.7)
 *
 * 🛑 ด่านความเป็นเจ้าของรอบอยู่ใน **คิวรีแรก** (`findFirst({ where: { id, inspectorUserId } })`)
 *    ห้ามดึงด้วย id เปล่าแล้วเทียบทีหลัง และห้ามแยก 404 ออกจาก 403
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireInspector()
  if ('response' in auth) return auth.response

  const { id } = await params
  try {
    return NextResponse.json(await getRoundDetailForInspector(id, auth.userId))
  } catch (e) {
    return mapInspectorError(e, { tag: 'inspector/rounds/detail', roundId: id })
  }
}
