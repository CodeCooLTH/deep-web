import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getLineQuota } from '@/services/line-quota.service'

/**
 * GET /api/channels/line/[channelId]/quota — โควตาข้อความคงเหลือของ LINE OA (feature 00025, S-9)
 *
 * API.md §4.4 บังคับ 3 ข้อ:
 *   1. ใช้ค่า cache ถ้าอายุ < 5 นาที ไม่ยิง LINE ซ้ำ (จัดการใน line-quota.service)
 *   2. 🛑 อ่านจาก LINE ไม่สำเร็จ → **คืน 200 พร้อม `stale: true` ห้ามคืน 5xx** — การอ่านโควตาไม่ได้
 *      ต้องไม่ทำให้หน้าอินบ็อกซ์พัง (มาตรวัดตัวเดียวไม่ควรมีอำนาจล้มทั้งหน้าจอ)
 *   3. `cache-control: private, no-store`
 */
export const dynamic = 'force-dynamic'
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' }

// pattern เดียวกับ PATCH /api/channels/line/[channelId] (route พี่น้องในโฟลเดอร์เดียวกัน)
const ChannelIdParamSchema = v.pipe(v.string(), v.uuid())

export async function GET(_request: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = (session.user as { id: string }).id

  const activeCtx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId: ((session.user as { activeShopId?: string | null }).activeShopId as string | null | undefined) ?? null,
    },
  })
  if (!activeCtx) return NextResponse.json({ error: 'ไม่พบร้านที่กำลังใช้งาน' }, { status: 404 })

  const { channelId: rawChannelId } = await params
  const idCheck = v.safeParse(ChannelIdParamSchema, rawChannelId)
  if (!idCheck.success) return NextResponse.json({ error: 'รหัสช่องทางไม่ถูกต้อง' }, { status: 400 })

  // 🛑 scope ownership ใน WHERE ไม่ใช่ดึงมาแล้วค่อยเทียบทีหลัง (feedback_rsc_dal_authz) — และ select
  // เฉพาะคอลัมน์ที่ต้องใช้: แถวนี้มี accessTokenEnc/channelSecretEnc อยู่ด้วย ห้ามเผลอคืนทั้งแถว
  const channel = await prisma.shopChannel.findFirst({
    where: { id: idCheck.output, shopId: activeCtx.shopId, provider: 'LINE' },
    select: { id: true, accessTokenEnc: true, quotaValue: true, quotaUsed: true, quotaFetchedAt: true },
  })
  if (!channel) return NextResponse.json({ error: 'ไม่พบช่องทางนี้' }, { status: 404, headers: NO_STORE_HEADERS })

  // getLineQuota ไม่โยน error ในทุกกรณีตามสัญญาของมันเอง — ไม่มี try/catch ที่นี่โดยตั้งใจ
  // (ถ้ามันโยนขึ้นมาจริงแปลว่าสัญญาถูกละเมิด ให้ 500 ดังออกมาแทนการซ่อน)
  const quota = await getLineQuota(channel)

  return NextResponse.json(
    {
      type: quota.type,
      total: quota.total,
      used: quota.used,
      remaining: quota.remaining,
      // (เพิ่มจาก API.md §4.4 ฉบับแรก, additive) ระดับที่คำนวณจากเกณฑ์ ≤20% ฝั่ง server — ห้ามให้
      // หน้าจอคำนวณ % เอง ไม่งั้นเกณฑ์เดียวจะมีสองนิยาม (Hard Rule 16)
      level: quota.level,
      fetchedAt: quota.fetchedAt?.toISOString() ?? null,
      stale: quota.stale,
    },
    { status: 200, headers: NO_STORE_HEADERS },
  )
}
