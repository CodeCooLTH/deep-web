import { NextResponse, type NextRequest } from 'next/server'
import { listAssignmentsForInspector } from '@/services/inspection-round.service'
import { inspectorError, mapInspectorError, requireInspector } from '../_shared'

/**
 * GET /api/inspector/rounds — คิวงานของผู้ตรวจที่ล็อกอินอยู่ (API §4.6)
 *
 * 🛑 ขอบเขตอยู่ใน `WHERE` ของคิวรีแรกเสมอ (`inspectorUserId`) — ห้าม `findMany({ completedAt: null })`
 *    แล้ว `.filter()` ทีหลัง สองรูปแบบให้ผลเหมือนกันในเทสข้อมูลชุดเล็ก แต่รูปแบบหลัง
 *    **ดึงคิวงานของผู้ตรวจทุกคนทั้งระบบออกมาจากฐานจริง ๆ** ก่อนตัด และเหลือแค่บรรทัดเดียว
 *    กั้นไม่ให้ถึงคนนอก การลบบรรทัดนั้นทิ้งไม่มี `tsc` ตัวไหนเห็น
 */
export async function GET(request: NextRequest) {
  const auth = await requireInspector()
  if ('response' in auth) return auth.response

  const status = request.nextUrl.searchParams.get('status') ?? 'OPEN'
  if (status !== 'OPEN' && status !== 'DONE') {
    return inspectorError('VALIDATION_ERROR', { message: 'สถานะที่ระบุไม่ถูกต้อง' })
  }

  try {
    const rounds = await listAssignmentsForInspector(auth.userId, { includeCompleted: status === 'DONE' })
    return NextResponse.json({ rounds })
  } catch (e) {
    return mapInspectorError(e, { tag: 'inspector/rounds' })
  }
}
