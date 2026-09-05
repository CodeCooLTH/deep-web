import { NextResponse } from 'next/server'
import * as v from 'valibot'
import { UpdateInspectorRoleSchema } from '@/lib/validations'
import { setInspectorRole } from '@/services/inspection-admin.service'
import { adminError, mapAdminError, requireAdminActor } from '@/app/api/admin/inspection/_shared'

/**
 * PATCH /api/admin/users/[id]/inspector — ตั้ง/ถอนบทบาทผู้ตรวจ (API §4.16)
 *
 * อยู่ใต้ `/api/admin/users/` ไม่ใช่ `/api/admin/inspection/` เพราะสิ่งที่มันแก้คือคุณสมบัติของ
 * **ผู้ใช้** ซึ่งมีผลข้ามทุกร้าน — วางไว้ใต้ `inspection/` จะชวนให้คนถัดไปคิดว่าเป็นค่าต่อร้าน
 *
 * 🛑 ต้องมี endpoint นี้ ไม่ใช่ให้ ops ไปแก้ที่ฐานตรง ๆ — ผู้ตรวจท้องถิ่นเป็นคนนอกที่จ้างรายครั้ง
 *    และ **หมุนเวียนตลอด** ถ้าเปิดบัญชีใหม่ให้แต่ละคนไม่ได้ในทางปฏิบัติ ทีมจะแก้ปัญหาด้วยการ
 *    เอาบัญชีเดิมไปใช้ซ้ำกันหลายคน ⇒ ชื่อที่ปรากฏบนโปรไฟล์จะไม่ใช่คนที่ตรวจจริง
 *    ซึ่งแย่กว่าไม่ระบุชื่อเลย
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminActor()
  if ('response' in auth) return auth.response
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(UpdateInspectorRoleSchema, body)
  if (!parsed.success) return adminError('VALIDATION_ERROR', { message: parsed.issues[0]?.message })

  try {
    const result = await setInspectorRole({
      targetUserId: id,
      actorUserId: auth.actorUserId,
      isInspector: parsed.output.isInspector,
      reason: parsed.output.reason,
      now: new Date(),
    })
    return NextResponse.json(result)
  } catch (e) {
    return mapAdminError(e, { tag: 'admin/users/inspector' })
  }
}
