import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { validateUpload, saveFile } from '@/lib/storage'

// POST /api/app/upload — อัปไฟล์ (multipart `file`) → คืน { fileId } (Bearer auth)
// ใช้สำหรับ: เอกสาร verify, สลิปโอนเงิน
export async function POST(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

  try {
    validateUpload(file) // เช็คขนาด/ชนิด (throw ถ้าไม่ผ่าน)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'ไฟล์ไม่ถูกต้อง' },
      { status: 400 },
    )
  }

  const fileId = await saveFile(file)
  return NextResponse.json({ fileId }, { status: 201 })
}
