/**
 * Admin top-up request detail page (SMS-Wallet feature, FR-6.3/D2).
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/components/IssueDetailModal.tsx
 *       (detail-view pattern — composed as in-page 2-col card; same theme ancestor
 *        as in-proj precedent src/app/(paces)/admin/(dashboard)/verifications/[id]/page.tsx)
 *
 * Layout: grid 2/3 main (สลิป + actions) + 1/3 sidebar (ข้อมูลคำขอ)
 * Security:
 *   - requireAdmin() redirect ก่อน fetch — non-admin → /admin/auth/sign-in
 *   - RC-7 isSelfRecord คำนวณ server-side (adminId === record.shop.userId)
 *     ส่ง boolean เท่านั้นข้าม RSC boundary — ห้ามส่ง shop.userId ดิบ (RC-8/least-exposure)
 *   - notFound() ถ้าไม่เจอ record (ไม่ leak PII ผ่าน HTTP 200 RSC flight)
 * Next.js 16: params เป็น Promise → await
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import SlipImageClient from './SlipImageClient'
import TopUpReviewActions from './TopUpReviewActions'

export const metadata: Metadata = { title: 'ตรวจสอบคำขอเติมเครดิต' }

type PageProps = {
  params: Promise<{ id: string }>
}

const STATUS_META: Record<string, { label: string; cls: string; icon: string }> = {
  PENDING: { label: 'รอตรวจสอบ', cls: 'bg-warning/10 text-warning', icon: 'clock' },
  APPROVED: { label: 'อนุมัติแล้ว', cls: 'bg-success/10 text-success', icon: 'circle-check' },
  REJECTED: { label: 'ปฏิเสธ', cls: 'bg-danger/10 text-danger', icon: 'x' },
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function TopUpDetailPage({ params }: PageProps) {
  const { id } = await params

  // requireAdmin(): null ถ้าไม่ใช่ admin → redirect
  const admin = await requireAdmin()
  if (!admin) {
    redirect('/admin/auth/sign-in')
  }

  // RC-7: admin.id จาก requireAdmin() — session callback select id:true → guaranteed
  // (เลี่ยง getServerSession ซ้ำ = wasted DB hit; admin ผ่าน null-guard ด้านบนแล้ว)
  const adminId = (admin as { id?: string }).id

  const record = await prisma.topUpRequest.findUnique({
    where: { id },
    include: {
      shop: {
        select: {
          shopName: true,
          // userId ใช้เฉพาะ RC-7 self-block เปรียบฝั่ง server — ไม่ส่งข้าม boundary (RC-8)
          userId: true,
        },
      },
      reviewedBy: {
        select: { displayName: true },
      },
    },
  })

  if (!record) notFound()

  // RC-7: คำนวณ boolean server-side — ส่งแค่ boolean ไป client ห้ามส่ง shop.userId ดิบ
  const isSelfRecord = !!adminId && adminId === record.shop.userId

  const meta = STATUS_META[record.status] ?? {
    label: record.status,
    cls: 'bg-default-100 text-default-600',
    icon: 'help',
  }

  // Format dates เป็น string ก่อนข้าม RSC boundary (Date object serialize ไม่ได้)
  const createdAtStr = formatDate(record.createdAt)
  const reviewedAtStr = record.reviewedAt ? formatDate(record.reviewedAt) : null

  return (
    <>
      <PageBreadcrumb
        title="ตรวจสอบคำขอเติมเครดิต"
        trail={[
          { label: 'Wallet' },
          { label: 'คำขอเติมเครดิต', href: '/topups' },
        ]}
      />

      {/* back link — ใช้ next/link โดยตรงบน <a> (ไม่ใช่ component={Link} บน MUI component) */}
      <div className="mb-4">
        <Link
          href="/topups"
          className="text-default-500 hover:text-primary inline-flex items-center gap-1.5 text-sm font-medium"
        >
          <Icon icon="arrow-left" className="text-base" />
          กลับหน้ารายการ
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Main 2/3: สลิปโอนเงิน + review actions */}
        <div className="space-y-4 lg:col-span-2">
          <div className="card">
            <div className="card-header flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-dark text-lg font-semibold">สลิปโอนเงิน</h4>
                <p className="text-default-400 mt-1 text-xs">ส่งเมื่อ {createdAtStr}</p>
              </div>
              <span
                className={`badge badge-label text-2xs ${meta.cls} inline-flex items-center gap-1.5 border-transparent`}
              >
                <Icon icon={meta.icon} className="text-sm" />
                {meta.label}
              </span>
            </div>

            <div className="card-body">
              {/* SlipImageClient: แยกเป็น 'use client' เพราะต้องการ onError handler */}
              <SlipImageClient slipFileId={record.slipFileId} amount={record.amount} />
            </div>
          </div>

          {/* Review actions — mount เฉพาะ PENDING */}
          {record.status === 'PENDING' && (
            <TopUpReviewActions topupId={record.id} isSelfRecord={isSelfRecord} />
          )}

          {/* Banner สรุป APPROVED */}
          {record.status === 'APPROVED' && (
            <div className="rounded-lg border border-success/20 bg-success/10 p-4">
              <div className="text-success flex items-start gap-2 text-sm">
                <Icon icon="tabler:circle-check" className="mt-0.5 text-base shrink-0" />
                <div>
                  <strong className="font-semibold">อนุมัติแล้ว</strong>
                  {reviewedAtStr && <> — ตรวจสอบเมื่อ {reviewedAtStr}</>}
                  {record.reviewedBy?.displayName && (
                    <> โดย {record.reviewedBy.displayName}</>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Banner สรุป REJECTED */}
          {record.status === 'REJECTED' && (
            <div className="rounded-lg border border-danger/20 bg-danger/10 p-4">
              <div className="text-danger flex items-start gap-2 text-sm">
                <Icon icon="tabler:x" className="mt-0.5 text-base shrink-0" />
                <div>
                  <strong className="font-semibold">ปฏิเสธแล้ว</strong>
                  {reviewedAtStr && <> — ตรวจสอบเมื่อ {reviewedAtStr}</>}
                  {record.reviewedBy?.displayName && (
                    <> โดย {record.reviewedBy.displayName}</>
                  )}
                  {record.rejectedReason && (
                    <p className="mt-1 text-default-600">เหตุผล: {record.rejectedReason}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar 1/3: ข้อมูลคำขอ */}
        <div className="space-y-4 lg:col-span-1">
          <div className="card">
            <div className="card-header">
              <h4 className="text-dark text-sm font-semibold">ข้อมูลคำขอ</h4>
            </div>
            <div className="card-body">
              <dl className="divide-default-200 divide-y">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-default-500 text-sm">จำนวนเงิน</dt>
                  <dd className="text-dark text-sm font-semibold">
                    ฿{record.amount.toLocaleString('th-TH')}
                  </dd>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-default-500 text-sm">ร้านค้า</dt>
                  <dd className="text-default-700 text-sm font-medium">
                    {record.shop.shopName}
                  </dd>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-default-500 text-sm">สถานะ</dt>
                  <dd>
                    <span
                      className={`badge badge-label text-2xs ${meta.cls} inline-flex items-center gap-1 border-transparent`}
                    >
                      <Icon icon={meta.icon} className="text-xs" />
                      {meta.label}
                    </span>
                  </dd>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-default-500 text-sm">วันที่ส่งคำขอ</dt>
                  <dd className="text-default-700 text-sm">{createdAtStr}</dd>
                </div>

                {reviewedAtStr && (
                  <div className="flex flex-col gap-0.5 py-2.5">
                    <dt className="text-default-500 text-sm">ตรวจสอบเมื่อ</dt>
                    <dd className="text-default-700 text-sm">
                      {reviewedAtStr}
                      {record.reviewedBy?.displayName && (
                        <span className="text-default-500">
                          {' '}โดย {record.reviewedBy.displayName}
                        </span>
                      )}
                    </dd>
                  </div>
                )}

                {record.status === 'REJECTED' && record.rejectedReason && (
                  <div className="flex flex-col gap-0.5 py-2.5">
                    <dt className="text-default-500 text-sm">เหตุผลที่ปฏิเสธ</dt>
                    <dd className="text-default-700 break-words text-sm">
                      {record.rejectedReason}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
