/**
 * /business/line-reports/[groupId] — หน้ากลุ่ม: PENDING = ผูกต่อ (resume) · ACTIVE/INACTIVE = ตั้งค่า (E3 · GroupDetailClient) · RSC
 * INACTIVE: เปิดดูค่าที่ตั้งไว้ได้ แล้วสลับไปผูกใหม่ (rebind) ผ่านปุ่ม "ผูกใหม่" ของแบนเนอร์ (หรือเข้าด้วย `?rebind=1`)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx (page shell + PageBreadcrumb)
 *   chase ผ่าน ../page.tsx (guard เดียวกับรายการ) · wizard อยู่ใน ../_components/BindWizard.tsx · ตั้งค่าอยู่ใน ./GroupDetailClient.tsx
 * Spec: docs/superpowers/specs/2026-10-05-line-group-summary-report-design-addendum-E.md §3.3/§4.1
 *
 * Guard: ANON → sign-in · NOT_OWNER → notFound() · กลุ่มไม่ใช่ของตน/ถูกยกเลิก (`getGroupDetail` throw GROUP_NOT_FOUND) → notFound()
 *   (กรอง ownerId ใน service — ไม่เปิดช่องให้รู้ว่ามี id นี้อยู่ของคนอื่น)
 * LOCKED (แพ็กเกจหยุด) ที่มีกลุ่ม: ยังเปิดดูได้ — wizard disabled พร้อมเหตุ (API จะตอบ 403)
 * 🛑 ไม่ส่งโค้ดเดิมลง client — เซิร์ฟเวอร์ไม่มีโค้ดดิบ (hash at rest) มีแค่ hasLiveCode/expiresAt
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { getAppShell, shouldHidePayments } from '@/lib/app-shell-server'
import { addFriendUrl, isReportBotReady } from '@/lib/line-report/config'
import { PENDING_GROUP_FALLBACK_NAME } from '@/lib/line-report/list-view'
import { LineReportError } from '@/lib/line-report/errors'
import { getGroupDetail } from '@/services/line-report-group.service'
import { listReportableShops } from '@/services/line-report-shop.service'
import { resolveReportAccess } from '@/services/line-report-access.service'
import BindWizard from '../_components/BindWizard'
import GroupDetailClient from './GroupDetailClient'

export const metadata: Metadata = { title: 'กลุ่มรายงาน LINE' }

export default async function LineReportGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>
  searchParams: Promise<{ rebind?: string }>
}) {
  const [{ groupId }, { rebind }, session] = await Promise.all([params, searchParams, getServerSession(authOptions)])
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
  const hidePayments = await shouldHidePayments()
  // ในแอปที่ซ่อนการจ่ายเงิน /business เด้งออก → ไม่ทำ crumb เป็นลิงก์
  const crumb = (
    <PageBreadcrumb
      // PENDING ยังไม่เคยรู้ชื่อกลุ่ม LINE (groupName = '') → ใช้คำแทน ไม่ปล่อยหัวหน้าว่าง
      title={group.groupName || (group.status === 'PENDING' ? PENDING_GROUP_FALLBACK_NAME : 'กลุ่ม LINE')}
      trail={[
        { label: 'ธุรกิจ', href: hidePayments ? undefined : '/business' },
        { label: 'รายงานเข้ากลุ่ม LINE', href: '/business/line-reports' },
      ]}
    />
  )

  // เหตุที่ API จะปฏิเสธการสร้างโค้ด — บอกก่อนกดแทนที่จะให้ผู้ใช้เจอ 403/503 หลังกด
  const blockedReason = group.paused
    ? 'แพ็กเกจหยุดใช้งาน สร้างโค้ดไม่ได้จนกว่าจะต่อแพ็กเกจ'
    : !isReportBotReady()
      ? 'ฟีเจอร์ยังไม่พร้อมใช้งาน'
      : null

  if (group.status === 'ACTIVE' || group.status === 'INACTIVE') {
    const [shell, reportableShops] = await Promise.all([getAppShell(), listReportableShops(access.userId)])
    return (
      <>
        {crumb}
        <GroupDetailClient
          // สถานะเปลี่ยน (ผูกใหม่สำเร็จ → refresh) ต้องเริ่ม view/state ใหม่ ไม่ค้าง rebind
          key={`${group.id}:${group.status}`}
          initialGroup={group}
          reportableShops={reportableShops}
          shell={shell}
          lockReason={access.kind === 'LOCKED' ? access.reason : 'RENEWAL_FAILED'}
          serverNowIso={new Date().toISOString()}
          initialView={group.status === 'INACTIVE' && rebind === '1' ? 'rebind' : 'settings'}
          rebind={{ addFriendUrl: addFriendUrl(), blockedReason }}
        />
      </>
    )
  }

  return (
    <>
      {crumb}
      <BindWizard
        mode="resume"
        groupId={group.id}
        shopNames={group.shops.map((s) => s.name)}
        liveCodeExpiresAt={group.bind.hasLiveCode ? group.bind.expiresAt : null}
        addFriendUrl={addFriendUrl()}
        blockedReason={blockedReason}
      />
    </>
  )
}
