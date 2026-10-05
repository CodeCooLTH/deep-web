/**
 * /business/line-reports/[groupId]/template — หน้าจัดข้อความรายงานเต็มจอ (ทิศทาง A) · feature 00070 EXT · FR-LGS-EXT-11 · RSC
 *
 * Base: src/app/(paces)/seller/(fullscreen)/public-profile/builder/page.tsx (RSC โหลดข้อมูล → ส่งเข้า client orchestrator)
 *   + src/app/(paces)/seller/(dashboard)/business/line-reports/[groupId]/page.tsx (guard เดียวกัน)
 *   + theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx (เปลือก fullscreen header)
 * Spec: docs/superpowers/specs/2026-10-05-line-report-message-builder-ux-spec.md §3.1
 *
 * Guard: ANON → sign-in · NOT_OWNER/GROUP_NOT_FOUND → notFound() · ยังไม่ผูก (PENDING) → กลับหน้าตั้งค่า (ยังไม่มีอะไรให้จัด)
 * 🛑 ชื่อ dynamic segment ต้อง `[groupId]` เท่ากับ (dashboard)/…/[groupId] · ห้ามสร้างไฟล์ชื่อ `template.tsx` ในโฟลเดอร์นี้ (ชื่อสงวนของ Next)
 * 🛑 เวลาจาก server (`serverNowIso`) — ห้าม new Date() ฝั่ง client (hydration mismatch)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getAppShell } from '@/lib/app-shell-server'
import { LineReportError } from '@/lib/line-report/errors'
import { resolveReportAccess } from '@/services/line-report-access.service'
import { getGroupDetail } from '@/services/line-report-group.service'
import TemplateBuilderClient from './TemplateBuilderClient'

export const metadata: Metadata = { title: 'จัดข้อความรายงาน' }

export default async function LineReportTemplatePage({ params }: { params: Promise<{ groupId: string }> }) {
  const [{ groupId }, session] = await Promise.all([params, getServerSession(authOptions)])
  const access = await resolveReportAccess(session)
  if (access.kind === 'ANON') redirect('/auth/sign-in')
  if (access.kind === 'NOT_OWNER') notFound()

  let group
  try {
    group = (await getGroupDetail(access.userId, groupId)).group
  } catch (e) {
    if (e instanceof LineReportError && e.code === 'GROUP_NOT_FOUND') notFound()
    throw e
  }
  if (group.status !== 'ACTIVE' && group.status !== 'INACTIVE') redirect(`/business/line-reports/${group.id}`)

  const shell = await getAppShell()
  return (
    <TemplateBuilderClient
      // key ไม่รวม templateVersion — router.refresh() หลังส่งทดสอบต้องไม่ทิ้งฉบับร่างที่พิมพ์ค้าง · สถานะ/แพ็กเกจเปลี่ยน = เริ่มใหม่
      key={`${group.id}:${group.status}:${group.paused}`}
      group={group}
      shell={shell}
      lockReason={access.kind === 'LOCKED' ? access.reason : 'RENEWAL_FAILED'}
      serverNowIso={new Date().toISOString()}
    />
  )
}
