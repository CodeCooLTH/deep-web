import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { canClaimServiceJob } from '@/lib/shop-permissions'
import { appointmentErrorResponse } from '@/lib/appointment-api'
import { serviceJobErrorResponse } from '@/lib/service-job-api'
import { ServiceJobClaimTechnicianOnlyError } from '@/lib/service-job'
import { claimServiceJob } from '@/services/service-job.service'

/**
 * POST /api/orders/[token]/assign/claim — ช่าง "รับงานนี้" (feature 00086 API §4.8 · FR-008)
 *
 * 🛑 path นี้ ไม่ใช่ `/api/orders/[token]/claim` — ตัวนั้นคือ OTP claim ของผู้ซื้อ (feature 00015 · class BUYER)
 * O4 + ถือ TECHNICIAN (canClaimServiceJob) else 403 SERVICE_JOB_CLAIM_TECHNICIAN_ONLY · ไม่มี body
 * → 200 `{ assignedUserId: <ฉัน> }` · มีคนรับแล้ว (รวมแพ้การกดพร้อมกัน) → 409 SERVICE_JOB_ALREADY_ASSIGNED + assigneeName
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gate = await requireShopCapability(await getServerSession(authOptions), 'O4', {
    shopId: request.nextUrl.searchParams.get('shopId'),
  })
  if (!gate.ok) return gate.response
  const ctx = gate
  // ตอบเร็วที่ route (service ตรวจซ้ำ — เรียกตรงไม่ผ่าน route ก็ติดด่านเดียวกัน)
  if (!canClaimServiceJob(ctx.roles)) return serviceJobErrorResponse(new ServiceJobClaimTechnicianOnlyError())!

  try {
    const r = await claimServiceJob({ shopId: ctx.shopId, orderToken: token, actorUserId: ctx.userId, actorRoles: ctx.roles })
    return jsonNoStore({ assignedUserId: r.assignedUserId })
  } catch (e) {
    const mapped = serviceJobErrorResponse(e) ?? appointmentErrorResponse(e)
    if (mapped) return mapped
    console.error('[POST /api/orders/[token]/assign/claim] shopId:', ctx.shopId, e instanceof Error ? e.message : e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
