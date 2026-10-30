import { getServerSession } from 'next-auth'
import type { NextRequest } from 'next/server'
import { authOptions } from '@/lib/auth'
import { parseLoadWindow } from '@/lib/assignee-load'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { listServiceStaff } from '@/services/service-job.service'

/**
 * GET /api/shops/current/service-staff — รายชื่อช่างของร้าน (feature 00086 API §4.10)
 * ใช้ในชีตมอบงาน + ฟอร์มสร้างงาน · O2s (คนที่มอบงานได้) · `{ staff: [{ userId, displayName }] }` เรียงชื่อ
 * ไม่มีเบอร์/อีเมล · ร้านที่ไม่ใช่บริการ → `{ staff: [] }` (ไม่ใช่ 403 — ฟอร์มสร้างงานซ่อนส่วนนี้เมื่อว่าง)
 *
 * `?shopId=` (P3-T8) — ฟอร์มสร้างงานในกล่องแชทรวมหลายร้านผูกกับร้านเจ้าของเธรด ไม่ใช่ร้าน active
 * (แบบเดียวกับ service-resources) · ระบุแล้วห้ามถอยไปร้าน active — ไม่ใช่สมาชิกร้านนั้น = 403
 *
 * `?from=&to=` (ISO · มติ 2026-10-30 ร้านช่างเยอะ) — แนบ `load: { dayJobs, clash }` ต่อคน สำหรับป้าย "ว่าง/ติดงาน"
 * `&exclude=<publicToken>` = งานที่กำลังมอบ ไม่นับ · ช่วงผิดรูป/กว้างเกิน 2 วัน = ไม่แนบ (รายชื่อแบบเดิม ไม่ใช่ 400)
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'O2s', {
    shopId: request.nextUrl.searchParams.get('shopId'),
  })
  if (!gate.ok) return gate.response
  try {
    const sp = request.nextUrl.searchParams
    const loadWindow = parseLoadWindow(sp.get('from'), sp.get('to'))
    const staff = loadWindow
      ? await listServiceStaff(gate.shopId, { window: loadWindow, excludeToken: sp.get('exclude') })
      : await listServiceStaff(gate.shopId)
    return jsonNoStore({ staff })
  } catch (e) {
    console.error('[GET /api/shops/current/service-staff] shopId:', gate.shopId, e instanceof Error ? e.message : e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
