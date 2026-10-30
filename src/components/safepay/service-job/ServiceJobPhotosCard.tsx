/**
 * ServiceJobPhotosCard — การ์ด "รูปก่อน-หลัง" / "บันทึกงาน" ฝั่งร้าน (feature 00086 S-10 · ต้นแบบ v13 `cardPhotos`)
 *
 * ข้อมูลมาจาก Order.serviceJobRecords (getOrderForShop → ร้านบริการเท่านั้น · ช่างผ่าน toNoMoneyOrder allow-list)
 * ไม่มี record เลย = ไม่ render (ค่าตั้งต้นของระบบคือเงียบ — ร้านที่ไม่ใช้รูปไม่ได้การ์ดเปล่า)
 * รูปใช้ ReviewImageGallery เดิม (รูปย่อ + lightbox + scroll lock + รูปเปิดไม่ได้ = ช่อง photo-off ทีละใบ · UX D11)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/images/page.tsx (รูปย่อมุมมน) · โครงการ์ด card/card-header/card-body
 *   เดียวกับ orders/[token]/components/ServiceJobCard.tsx ← theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx
 */

import Icon from '@/components/wrappers/Icon'
import ReviewImageGallery from '@/app/(paces)/seller/(dashboard)/reviews/components/ReviewImageGallery'
import { formatDayMonthTimeTH } from '@/lib/format-date'
import type { ServiceJobPhotoMode } from '@/lib/service-job'

import type { ServiceJobRecordView } from './service-job-facts'

export type { ServiceJobRecordView }

type Props = {
  records: readonly ServiceJobRecordView[]
  photoMode: ServiceJobPhotoMode
  buyerVisible: boolean
  /** ชื่อผู้รับผิดชอบตอนนี้ — ใช้ในบรรทัด "รอ…กด ทำเสร็จแล้ว" */
  assigneeName: string | null
  /** งานปิดแล้ว — หลังทำว่าง ∧ ปิดแล้ว (ข้ามขั้นทำเสร็จ) = ไม่มีส่วนหลังทำ */
  closed: boolean
  /**
   * กด "ทำเสร็จแล้ว" ไปแล้ว (Order.serviceFinishedAt) — ทำเสร็จโดยไม่แนบรูป/บันทึก = ไม่มี record AFTER
   * ⇒ "ไม่มีบันทึกหลังทำ" ไม่ใช่ "รอ…กด ทำเสร็จแล้ว" (ซึ่งเท็จ: กดไปแล้ว)
   */
  finished: boolean
}

function Section({ title, rec, label }: { title: string; rec: ServiceJobRecordView; label: string }) {
  return (
    <div>
      <h5 className="text-dark mb-0 text-sm font-semibold">{title}</h5>
      <p className="text-default-700 mb-0 text-xs">
        {formatDayMonthTimeTH(rec.createdAtISO)} น.{rec.createdByName ? ` · โดย ${rec.createdByName}` : ''}
      </p>
      {rec.fileIds.length > 0 && <ReviewImageGallery images={rec.fileIds} thumbClassName="size-20" label={label} />}
      {rec.note && (
        <p className="bg-default-100 text-default-800 mb-0 mt-2 whitespace-pre-line break-words rounded-lg px-3 py-2 text-sm">
          {rec.note}
        </p>
      )}
    </div>
  )
}

export default function ServiceJobPhotosCard({ records, photoMode, buyerVisible, assigneeName, closed, finished }: Props) {
  if (records.length === 0) return null
  const before = records.find((r) => r.phase === 'BEFORE') ?? null
  const after = records.find((r) => r.phase === 'AFTER') ?? null
  const photosOn = photoMode !== 'NONE'
  const seenByBuyer = buyerVisible && photosOn
  const showAfter = after !== null || !closed

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-2">
        <h4 className="card-title">{photosOn ? 'รูปก่อน-หลัง' : 'บันทึกงาน'}</h4>
        {/* ข้อเท็จจริง ไม่ใช่สถานะ — ข้อความเทา ไม่ใช่ป้ายสี */}
        <span className="text-default-700 inline-flex items-center gap-1 text-xs">
          <Icon icon={seenByBuyer ? 'eye' : 'eye-off'} className="shrink-0 text-sm" aria-hidden="true" />
          {seenByBuyer ? 'ลูกค้าเห็น' : 'เห็นเฉพาะในร้าน'}
        </span>
      </div>
      <div className="card-body">
        {before ? (
          <Section title="ก่อนทำ" rec={before} label="รูปก่อนทำ" />
        ) : (
          <div>
            <h5 className="text-dark mb-0 text-sm font-semibold">ก่อนทำ</h5>
            <p className="text-default-700 mb-0 text-xs">ไม่มีบันทึก</p>
          </div>
        )}
        {showAfter && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            {after ? (
              <Section title="หลังทำ" rec={after} label="รูปหลังทำ" />
            ) : (
              <>
                <h5 className="text-dark mb-0 text-sm font-semibold">หลังทำ</h5>
                <p className="text-default-700 mb-0 text-xs">
                  {finished ? 'ไม่มีบันทึกหลังทำ' : <>รอ {assigneeName ?? 'ผู้รับผิดชอบ'} กด &ldquo;ทำเสร็จแล้ว&rdquo;</>}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
