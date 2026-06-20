/**
 * Admin scam-report review queue (spec 2026-06-20-scam-risk-check-report).
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/page.tsx
 *       (rows-with-status queue) — adapted จากหน้า verifications/page.tsx ภายในโปรเจค
 * Adaptations: data จาก prisma (scamReport); คอลัมน์ตาม field รายงานมิจฉาชีพ;
 *              identifiers แสดงแบบ masked (ไม่โชว์ค่าจริง — PDPA)
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { formatDateTime } from '@/lib/format-date'
import { prisma } from '@/lib/prisma'
import { SCAM_TYPE_LABELS, IDENTIFIER_LABELS } from '@/lib/scam-constants'
import type { IdentifierType } from '@/lib/scam-constants'

export const metadata: Metadata = { title: 'รายงานมิจฉาชีพ — รอตรวจสอบ' }

type PageProps = { searchParams: Promise<{ status?: string }> }

const STATUS_TABS = [
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

function evidenceCount(evidence: unknown): number {
  return Array.isArray(evidence) ? evidence.length : 0
}

export default async function AdminScamReportsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const activeStatus = sp.status ?? 'PENDING'
  const where = activeStatus === 'all' ? {} : { status: activeStatus }

  const [records, pendingCount] = await Promise.all([
    prisma.scamReport.findMany({
      where,
      include: {
        identifiers: true,
        reporter: { select: { displayName: true, username: true } },
      },
      orderBy: { createdAt: activeStatus === 'PENDING' ? 'asc' : 'desc' },
      take: 100,
    }),
    prisma.scamReport.count({ where: { status: 'PENDING' } }),
  ])

  return (
    <>
      <PageBreadcrumb title="รายงานมิจฉาชีพ" trail={[{ label: 'ความปลอดภัย' }]} />

      <div className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-dark text-lg font-semibold">รายงานมิจฉาชีพ</h4>
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
              const href = t.value === 'PENDING' ? '/scam-reports' : `/scam-reports?status=${t.value}`
              return (
                <Link
                  key={t.value}
                  href={href}
                  className={
                    'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
                    (isActive ? 'bg-primary/10 text-primary' : 'text-default-500 hover:bg-default-100')
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
              <Icon icon="shield-check" className="text-5xl text-success/60 mx-auto mb-3" />
              <p className="text-default-500 font-semibold">ไม่มีรายงานในสถานะนี้</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-default-50 border-default-200 border-b">
                  <tr>
                    {['สถานะ', 'ผู้รายงาน', 'ข้อมูลผู้ต้องสงสัย', 'ประเภท', 'มูลค่า', 'หลักฐาน', 'ส่งเมื่อ', ''].map((h) => (
                      <th
                        key={h}
                        className="text-default-500 px-4 py-3 text-start text-xs font-semibold uppercase last:text-end"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const meta = STATUS_META[r.status] ?? { label: r.status, cls: 'bg-default-100 text-default-600' }
                    return (
                      <tr key={r.id} className="border-default-200 hover:bg-default-50 border-b transition-colors">
                        <td className="px-4 py-3">
                          <span className={`badge badge-label text-2xs ${meta.cls} border-transparent`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-dark text-sm font-semibold">{r.reporter.displayName}</div>
                          <div className="text-default-400 text-xs">@{r.reporter.username}</div>
                        </td>
                        <td className="text-default-700 px-4 py-3 text-sm">
                          {r.identifiers.map((id) => (
                            <div key={id.id}>
                              <span className="text-default-400 text-xs">
                                {IDENTIFIER_LABELS[id.type as IdentifierType] ?? id.type}:{' '}
                              </span>
                              {id.valueMasked}
                            </div>
                          ))}
                        </td>
                        <td className="text-default-700 px-4 py-3 text-sm">
                          {SCAM_TYPE_LABELS[r.scamType] ?? r.scamType}
                        </td>
                        <td className="text-default-700 px-4 py-3 text-sm">
                          ฿{r.amountLost.toLocaleString('th-TH')}
                        </td>
                        <td className="text-default-500 px-4 py-3 text-sm">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon icon="paperclip" className="text-default-400" />
                            {evidenceCount(r.evidence)} ไฟล์
                          </span>
                        </td>
                        <td className="text-default-500 px-4 py-3 text-sm">{formatDateTime(r.createdAt)}</td>
                        <td className="px-4 py-3 text-end">
                          <Link
                            href={`/scam-reports/${r.id}`}
                            className="btn btn-sm bg-primary hover:bg-primary-hover inline-flex items-center gap-1.5 text-white"
                          >
                            <Icon icon="eye" className="text-sm" />
                            ตรวจสอบ
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
