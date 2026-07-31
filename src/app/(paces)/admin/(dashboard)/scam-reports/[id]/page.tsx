import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { formatDateTime } from '@/lib/format-date'
import { prisma } from '@/lib/prisma'
import { SCAM_TYPE_LABELS, IDENTIFIER_LABELS } from '@/lib/scam-constants'
import type { IdentifierType } from '@/lib/scam-constants'
import ReviewActions from './ReviewActions'

export const metadata: Metadata = { title: 'ตรวจสอบรายงานมิจฉาชีพ' }

type PageProps = { params: Promise<{ id: string }> }

export default async function ScamReportDetailPage({ params }: PageProps) {
  const { id } = await params

  const report = await prisma.scamReport.findUnique({
    where: { id },
    include: {
      identifiers: true,
      reporter: { select: { displayName: true, username: true } },
      reviewedBy: { select: { displayName: true } },
    },
  })

  if (!report) notFound()

  const evidence = Array.isArray(report.evidence) ? (report.evidence as string[]) : []

  return (
    <>
      <PageBreadcrumb title="ตรวจสอบรายงาน" trail={[{ label: 'รายงานมิจฉาชีพ', href: '/scam-reports' }]} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-5">
          <div className="card">
            <div className="card-header">
              <h4 className="text-dark text-lg font-semibold">รายละเอียดรายงาน</h4>
            </div>
            <div className="card-body grid gap-4 sm:grid-cols-2">
              <Field label="ผู้รายงาน" value={`${report.reporter.displayName} (@${report.reporter.username})`} />
              <Field label="ประเภท" value={SCAM_TYPE_LABELS[report.scamType] ?? report.scamType} />
              <Field label="มูลค่าความเสียหาย" value={`฿${report.amountLost.toLocaleString('th-TH')}`} />
              <Field label="ส่งเมื่อ" value={formatDateTime(report.createdAt)} />
              <div className="sm:col-span-2">
                <p className="text-default-400 text-xs">รายละเอียดเหตุการณ์</p>
                <p className="text-default-700 mt-1 whitespace-pre-wrap text-sm">{report.description}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h4 className="text-dark text-lg font-semibold">ข้อมูลผู้ต้องสงสัย (masked)</h4>
            </div>
            <div className="card-body flex flex-col gap-2">
              {report.identifiers.map((idf) => (
                <div key={idf.id} className="border-default-200 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="badge badge-label border-default-300 border">
                    {IDENTIFIER_LABELS[idf.type as IdentifierType] ?? idf.type}
                  </span>
                  <span className="text-default-700 font-medium">{idf.valueMasked}</span>
                  {idf.bankName && <span className="text-default-400">· {idf.bankName}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h4 className="text-dark text-lg font-semibold">หลักฐาน ({evidence.length})</h4>
            </div>
            <div className="card-body grid grid-cols-2 gap-3 sm:grid-cols-3">
              {evidence.map((fid) => (
                <a
                  key={fid}
                  href={`/api/files/${fid}`}
                  target="_blank"
                  rel="noreferrer"
                  className="border-default-200 hover:border-primary group block overflow-hidden rounded-lg border"
                >
                  {/* aspect-square ต้องอยู่ที่กรอบ ไม่ใช่ที่ <img> — img เป็น replaced element ที่มี
                      intrinsic ratio ของตัวเอง สั่ง aspect-ratio ทับไม่ได้ผล และ object-cover ไม่มี
                      อะไรให้ครอปเพราะความสูงยัง auto → รูปหลักฐานแต่ละใบสูงไม่เท่ากันในกริดเดียวกัน */}
                  <span className="relative block aspect-square w-full overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${fid}`} alt="หลักฐาน" className="absolute inset-0 size-full object-cover" />
                  </span>
                </a>
              ))}
              {evidence.length === 0 && <p className="text-default-400 text-sm">ไม่มีหลักฐานแนบ</p>}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="card sticky top-4">
            <div className="card-header">
              <h4 className="text-dark text-lg font-semibold">ดำเนินการ</h4>
            </div>
            <div className="card-body">
              <ReviewActions id={report.id} status={report.status} />
              {report.status !== 'PENDING' && report.reviewedBy && (
                <p className="text-default-400 mt-3 text-xs">
                  ตรวจโดย {report.reviewedBy.displayName}
                  {report.reviewedAt ? ` · ${formatDateTime(report.reviewedAt)}` : ''}
                </p>
              )}
              {report.rejectedReason && (
                <p className="text-danger mt-2 text-sm">เหตุผล: {report.rejectedReason}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-default-400 text-xs">{label}</p>
      <p className="text-default-700 mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}
