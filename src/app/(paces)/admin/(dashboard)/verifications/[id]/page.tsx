/**
 * Admin verification detail + review page (PRD FR-10.3).
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/components/IssueDetailModal.tsx
 *       (detail view pattern — composed here as an in-page card instead of modal)
 *       + Preline card primitives used in src/app/(paces)/seller/**.
 *
 * Renders submitter info, document previews (image <img>, PDF link), status badge,
 * and the approve/reject ReviewActions client component.
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { formatDateTime } from '@/lib/format-date'
import { prisma } from '@/lib/prisma'
import ReviewActions from './ReviewActions'

export const metadata: Metadata = { title: 'ตรวจสอบคำขอยืนยันตัวตน' }

type PageProps = {
  params: Promise<{ id: string }>
}

const STATUS_META: Record<string, { label: string; cls: string; icon: string }> = {
  PENDING: { label: 'รอตรวจสอบ', cls: 'bg-warning/10 text-warning', icon: 'clock' },
  APPROVED: { label: 'อนุมัติแล้ว', cls: 'bg-success/10 text-success', icon: 'circle-check' },
  REJECTED: { label: 'ปฏิเสธ', cls: 'bg-danger/10 text-danger', icon: 'x' },
}

function typeLabel(type: string, level: number): string {
  if (type === 'DOCUMENT' && level === 2) return 'ยืนยันด้วยบัตรประชาชน (L2)'
  if (type === 'DOCUMENT' && level === 3) return 'ยืนยันจดทะเบียนธุรกิจ (L3)'
  if (type === 'EMAIL_OTP') return 'ยืนยันอีเมล (L1)'
  if (type === 'PHONE_OTP') return 'ยืนยันเบอร์โทร (L1)'
  return `${type} (L${level})`
}

// Field-label dictionary for the `documents` JSON payload.
const DOC_FIELD_LABEL: Record<string, string> = {
  idCard: 'บัตรประชาชน',
  selfie: 'Selfie คู่กับบัตรประชาชน',
  shopPhoto: 'รูปหน้าร้าน / ป้ายร้าน',
  bizDoc: 'เอกสารจดทะเบียนธุรกิจ',
  doc: 'เอกสารประกอบ',
}

// Non-file text fields in the documents JSON that should be rendered as plain text.
const TEXT_FIELD_LABEL: Record<string, string> = {
  socialLink: 'Social Link',
  registrationNumber: 'เลขที่จดทะเบียน',
  address: 'ที่อยู่ร้าน',
}

function isLikelyFileId(v: unknown): v is string {
  // Upload service returns a uuid-ish token; accept any non-URL, non-empty string.
  return typeof v === 'string' && v.length > 0 && !v.startsWith('http') && !v.includes(' ')
}


export default async function VerificationDetailPage({ params }: PageProps) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  const adminId = (session?.user as { id?: string } | undefined)?.id

  const record = await prisma.verificationRecord.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatar: true,
          trustScore: true,
          isShop: true,
          createdAt: true,
        },
      },
      reviewedBy: { select: { id: true, displayName: true, username: true } },
    },
  })

  if (!record) notFound()

  const meta = STATUS_META[record.status] ?? {
    label: record.status,
    cls: 'bg-default-100 text-default-600',
    icon: 'help',
  }

  const docs = (record.documents ?? {}) as Record<string, unknown>
  const fileEntries = Object.entries(docs).filter(([k, v]) => DOC_FIELD_LABEL[k] && isLikelyFileId(v)) as [
    string,
    string,
  ][]
  const textEntries = Object.entries(docs).filter(
    ([k, v]) => TEXT_FIELD_LABEL[k] && typeof v === 'string' && v.length > 0,
  ) as [string, string][]

  return (
    <>
      <PageBreadcrumb
        title="ตรวจสอบคำขอยืนยันตัวตน"
        trail={[
          { label: 'ผู้ใช้' },
          { label: 'ยืนยันตัวตน', href: '/verifications' },
        ]}
      />

      <div className="mb-4">
        <Link
          href="/verifications"
          className="text-default-500 hover:text-primary inline-flex items-center gap-1.5 text-sm font-medium"
        >
          <Icon icon="arrow-left" className="text-base" />
          กลับหน้ารายการ
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Main content — docs + text fields */}
        <div className="space-y-4 lg:col-span-2">
          <div className="card">
            <div className="card-header flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-dark text-lg font-semibold">{typeLabel(record.type, record.level)}</h4>
                <p className="text-default-400 mt-1 text-xs">
                  ส่งเมื่อ {formatDateTime(record.createdAt)}
                </p>
              </div>
              <span className={`badge badge-label text-2xs ${meta.cls} inline-flex items-center gap-1.5 border-transparent`}>
                <Icon icon={meta.icon} className="text-sm" />
                {meta.label}
              </span>
            </div>

            <div className="card-body space-y-5">
              {record.status === 'REJECTED' && record.rejectedReason && (
                <div className="bg-danger/5 border-danger/20 rounded-lg border p-4">
                  <div className="text-danger flex items-start gap-2">
                    <Icon icon="alert-circle" className="mt-0.5 text-base" />
                    <div>
                      <div className="text-sm font-semibold">เหตุผลที่ปฏิเสธก่อนหน้า</div>
                      <p className="text-default-600 mt-1 text-sm">{record.rejectedReason}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Document previews */}
              <div>
                <h5 className="text-dark mb-3 text-sm font-semibold">เอกสารที่ส่ง</h5>
                {fileEntries.length === 0 ? (
                  <p className="text-default-400 text-sm">ไม่มีไฟล์แนบ</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {fileEntries.map(([key, fileId]) => (
                      <div
                        key={key}
                        className="border-default-200 overflow-hidden rounded-lg border"
                      >
                        <div className="bg-default-50 flex items-center justify-between px-3 py-2">
                          <span className="text-default-700 text-sm font-semibold">
                            {DOC_FIELD_LABEL[key]}
                          </span>
                          <a
                            href={`/api/files/${fileId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                          >
                            <Icon icon="external-link" className="text-sm" />
                            เปิดไฟล์
                          </a>
                        </div>
                        <div className="bg-default-100 flex items-center justify-center">
                          {/* Image render — if it's a PDF the server returns octet-stream so the
                              browser will show a broken image; user can click "เปิดไฟล์" above. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/files/${fileId}`}
                            alt={DOC_FIELD_LABEL[key]}
                            className="max-h-80 w-full object-contain"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Text fields */}
              {textEntries.length > 0 && (
                <div>
                  <h5 className="text-dark mb-3 text-sm font-semibold">ข้อมูลเพิ่มเติม</h5>
                  <dl className="border-default-200 divide-default-200 divide-y rounded-lg border">
                    {textEntries.map(([key, val]) => (
                      <div key={key} className="grid grid-cols-3 gap-2 px-4 py-3">
                        <dt className="text-default-500 col-span-1 text-sm">
                          {TEXT_FIELD_LABEL[key]}
                        </dt>
                        <dd className="text-default-800 col-span-2 break-all text-sm">
                          {key === 'socialLink' ? (
                            <a
                              href={val}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {val}
                            </a>
                          ) : (
                            val
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </div>

          {/* Review actions — only for PENDING records */}
          {record.status === 'PENDING' && (
            <ReviewActions recordId={record.id} isSelfRecord={adminId === record.userId} />
          )}

          {record.status !== 'PENDING' && (
            <div className="card p-5">
              <div className="text-default-500 flex items-center gap-2 text-sm">
                <Icon icon="info-circle" className="text-base" />
                คำขอนี้ได้รับการตรวจสอบแล้ว
                {record.reviewedAt && <> เมื่อ {formatDateTime(record.reviewedAt)}</>}
                {record.reviewedBy && <> โดย {record.reviewedBy.displayName}</>}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — submitter info */}
        <div className="space-y-4 lg:col-span-1">
          <div className="card">
            <div className="card-header">
              <h4 className="text-dark text-sm font-semibold">ผู้ส่งคำขอ</h4>
            </div>
            <div className="card-body space-y-4">
              <div className="flex items-center gap-3">
                {record.user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={record.user.avatar}
                    alt={record.user.displayName}
                    className="size-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full text-lg font-semibold">
                    {record.user.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-dark font-semibold">{record.user.displayName}</div>
                  <div className="text-default-400 text-sm">@{record.user.username}</div>
                </div>
              </div>

              <dl className="divide-default-200 divide-y">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-default-500 text-sm">Trust Score ปัจจุบัน</dt>
                  <dd className="text-dark text-sm font-semibold">
                    <span className="text-primary">{record.user.trustScore}</span>
                    <span className="text-default-400"> / 100</span>
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-default-500 text-sm">สถานะร้านค้า</dt>
                  <dd className="text-sm font-medium">
                    {record.user.isShop ? (
                      <span className="text-success">เปิดร้านแล้ว</span>
                    ) : (
                      <span className="text-default-400">ยังไม่เปิดร้าน</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-default-500 text-sm">สมัครเมื่อ</dt>
                  <dd className="text-default-700 text-sm">
                    {formatDateTime(record.user.createdAt)}
                  </dd>
                </div>
              </dl>

              <Link
                href={`/u/${record.user.username}`}
                target="_blank"
                className="btn border-default-300 text-default-700 hover:bg-default-50 inline-flex w-full items-center justify-center gap-2 border"
              >
                <Icon icon="user-circle" className="text-base" />
                ดูโปรไฟล์สาธารณะ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
