/**
 * Admin verification review queue (PRD FR-10.3).
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/page.tsx
 *       + components/IssueTrackerTable.tsx (rows-with-status queue pattern).
 *
 * Adaptations:
 *   - Data comes from the DB via getPendingVerifications()/prisma; no demo data.
 *   - Columns mapped to SafePay verification fields (user, type, level, docs).
 *   - Added a PENDING/ALL tab selector via ?status query param.
 *   - Rows click through to the detail page instead of opening a modal.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { formatDateTime } from '@/lib/format-date'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = { title: 'ยืนยันตัวตน — รอตรวจสอบ' }

type PageProps = {
  searchParams: Promise<{ status?: string }>
}

const STATUS_TABS: { value: string; label: string; icon: string; dot?: string }[] = [
  { value: 'PENDING', label: 'รอตรวจสอบ', icon: 'clock', dot: 'bg-warning' },
  { value: 'APPROVED', label: 'อนุมัติแล้ว', icon: 'circle-check', dot: 'bg-success' },
  { value: 'REJECTED', label: 'ปฏิเสธ', icon: 'x', dot: 'bg-danger' },
  { value: 'all', label: 'ทั้งหมด', icon: 'list' },
]

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'รอตรวจสอบ', cls: 'bg-warning/10 text-warning' },
  APPROVED: { label: 'อนุมัติ', cls: 'bg-success/10 text-success' },
  REJECTED: { label: 'ปฏิเสธ', cls: 'bg-danger/10 text-danger' },
}

function typeLabel(type: string, level: number): string {
  if (type === 'DOCUMENT' && level === 2) return 'บัตรประชาชน'
  if (type === 'DOCUMENT' && level === 3) return 'จดทะเบียนธุรกิจ'
  if (type === 'EMAIL_OTP') return 'อีเมล OTP'
  if (type === 'PHONE_OTP') return 'เบอร์โทร OTP'
  return type
}

function countDocs(documents: unknown): number {
  if (!documents || typeof documents !== 'object') return 0
  return Object.values(documents as Record<string, unknown>).filter(
    (v) => typeof v === 'string' && v.length > 0,
  ).length
}


export default async function AdminVerificationsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const activeStatus = sp.status ?? 'PENDING'

  const where = activeStatus === 'all' ? {} : { status: activeStatus }

  const [records, pendingCount] = await Promise.all([
    prisma.verificationRecord.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatar: true,
            trustScore: true,
          },
        },
      },
      orderBy: { createdAt: activeStatus === 'PENDING' ? 'asc' : 'desc' },
      take: 100,
    }),
    prisma.verificationRecord.count({ where: { status: 'PENDING' } }),
  ])

  return (
    <>
      <PageBreadcrumb title="ยืนยันตัวตน" trail={[{ label: 'ผู้ใช้' }]} />

      <div className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-dark text-lg font-semibold">คำขอยืนยันตัวตน</h4>
            <p className="text-default-400 mt-1 text-sm">
              รอตรวจสอบทั้งหมด{' '}
              <span className="text-warning font-semibold">{pendingCount}</span> รายการ
            </p>
          </div>
        </div>

        <div className="border-default-200 border-b px-4 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_TABS.map((t) => {
              const isActive = activeStatus === t.value
              const href = t.value === 'PENDING' ? '/verifications' : `/verifications?status=${t.value}`
              return (
                <Link
                  key={t.value}
                  href={href}
                  className={
                    'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
                    (isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-default-500 hover:bg-default-100')
                  }
                >
                  {t.dot && <span className={`size-1.5 rounded-full ${t.dot}`} />}
                  <Icon icon={t.icon} className="text-base" />
                  <span>{t.label}</span>
                </Link>
              )
            })}
          </div>
        </div>

        <div className="card-body p-0">
          {records.length === 0 ? (
            <div className="p-10 text-center">
              <Icon
                icon="shield-check"
                className="text-5xl text-success/60 mx-auto mb-3"
              />
              <p className="text-default-500 font-semibold">ไม่มีคำขอในสถานะนี้</p>
              <p className="text-default-400 mt-1 text-sm">
                เมื่อผู้ใช้ส่งเอกสารใหม่ จะแสดงที่นี่อัตโนมัติ
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-default-50 border-default-200 border-b">
                  <tr>
                    <th className="text-default-500 px-4 py-3 text-start text-xs font-semibold uppercase">
                      สถานะ
                    </th>
                    <th className="text-default-500 px-4 py-3 text-start text-xs font-semibold uppercase">
                      ผู้ส่งคำขอ
                    </th>
                    <th className="text-default-500 px-4 py-3 text-start text-xs font-semibold uppercase">
                      ประเภท
                    </th>
                    <th className="text-default-500 px-4 py-3 text-start text-xs font-semibold uppercase">
                      ระดับ
                    </th>
                    <th className="text-default-500 px-4 py-3 text-start text-xs font-semibold uppercase">
                      เอกสาร
                    </th>
                    <th className="text-default-500 px-4 py-3 text-start text-xs font-semibold uppercase">
                      ส่งเมื่อ
                    </th>
                    <th className="text-default-500 px-4 py-3 text-end text-xs font-semibold uppercase">
                      รายละเอียด
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const meta = STATUS_META[r.status] ?? {
                      label: r.status,
                      cls: 'bg-default-100 text-default-600',
                    }
                    const docCount = countDocs(r.documents)
                    return (
                      <tr
                        key={r.id}
                        className="border-default-200 hover:bg-default-50 border-b transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`badge badge-label text-2xs ${meta.cls} border-transparent`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {r.user.avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={r.user.avatar}
                                alt={r.user.displayName}
                                className="size-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-full text-xs font-semibold">
                                {r.user.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="text-dark text-sm font-semibold">
                                {r.user.displayName}
                              </div>
                              <div className="text-default-400 text-xs">@{r.user.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="text-default-700">{typeLabel(r.type, r.level)}</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="badge badge-label border-default-300 border">
                            L{r.level}
                          </span>
                        </td>
                        <td className="text-default-500 px-4 py-3 text-sm">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon icon="paperclip" className="text-default-400" />
                            ดู {docCount} ไฟล์
                          </span>
                        </td>
                        <td className="text-default-500 px-4 py-3 text-sm">
                          {formatDateTime(r.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-end">
                          <Link
                            href={`/verifications/${r.id}`}
                            className="btn btn-sm bg-primary hover:bg-primary-hover inline-flex items-center gap-1.5 text-white"
                          >
                            <Icon icon="eye" className="text-sm" />
                            ดูรายละเอียด
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
