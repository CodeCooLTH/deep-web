import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sessionUserId } from '@/lib/session-user'

/**
 * ตัวช่วยร่วมของหน้าผู้ตรวจ `(paces)/inspector/**` (feature 00060 · T13)
 *
 * 🛑 หน้านี้อยู่บน**โดเมนหลัก** ไม่ใช่ subdomain — session ที่ใช้คือ session ของผู้ซื้อ/บุคคลทั่วไป
 * (NextAuth cookie ของ main host) เพราะผู้ตรวจเป็น `User` ปกติที่ถูกติดธง `isInspector=true`
 * (API §4.16) ไม่ใช่บทบาทที่มี subdomain ของตัวเอง — ล็อกอินผ่านหน้า `/auth/sign-in` ปกติ
 *
 * 🛑 ตรวจ `isInspector` **ทุกครั้งที่เปิดหน้า** ไม่ใช่ตอน login (TFR-012, มิเรอร์
 * `requireInspector()` ของ `/api/inspector/_shared.ts`) — ถอดสิทธิ์แล้วต้องเข้าไม่ได้ทันที
 *
 * ผู้ใช้ไม่ใช่ isInspector → redirect `/` โดยไม่บอกเหตุผล (edge state ตาม UX spec §C: "ไม่ leak
 * URL structure") ไม่ใช่ 403 error page ที่ยืนยันว่า route นี้มีจริง
 */
export async function requireInspectorPage(): Promise<{ userId: string }> {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (userId === null) {
    redirect('/auth/sign-in?callbackUrl=%2Finspector')
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, isInspector: true, deletedAt: null },
    select: { id: true },
  })
  if (user === null) {
    redirect('/')
  }

  return { userId }
}
