/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx
 *
 * ปรับจาก Paces CustomerDetails card primitive:
 * - คง: card → card-header → card-body pattern, icon-row layout
 * - เปลี่ยน content เป็น per-order review: rating (ใช้ Rating wrapper), comment, reviewer label
 * - ลบ: avatar image, country flag, dropdown actions, contact list (ไม่ใช่ scope นี้)
 * - เพิ่ม: empty-state ภาษาไทยถ้าไม่มีรีวิว
 * - reviewer label: รับ reviewerLabel (already-safe string) จาก RSC — mask เสร็จแล้วที่ server boundary
 *   ตาม PII constraint S-C1 — ห้ามส่ง raw phone/email ข้าม RSC→client; ห้าม mask ใน client component
 * - date → ISO string เพราะข้ามขอบเขต RSC → client ไม่ได้ถ้าเป็น Date object
 */

import Icon from '@/components/wrappers/Icon'
import Rating from '@/components/Rating'
import { formatDate } from '@/lib/format-date'

export interface OrderReviewData {
  /** rating 1-5 จาก Review.rating */
  rating: number
  /** comment อาจเป็น null */
  comment: string | null
  /**
   * safe label สำหรับแสดงผู้รีวิว — mask เสร็จแล้วที่ RSC boundary (S-C1)
   * ค่าเป็น displayName (public) หรือ masked contact หรือ 'ผู้ซื้อนิรนาม'
   * ห้ามส่ง raw phone/email มาใน field นี้หรือ field อื่น
   */
  reviewerLabel: string
  /** ISO string ของ review.createdAt */
  createdAtISO: string
}

interface OrderReviewCardProps {
  /** null = ยังไม่มีรีวิวสำหรับออเดอร์นี้ */
  review: OrderReviewData | null
}

const OrderReviewCard = ({ review }: OrderReviewCardProps) => {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">รีวิวออเดอร์</h4>
      </div>
      <div className="card-body">
        {!review ? (
          /* empty-state: ยังไม่มีรีวิวสำหรับออเดอร์นี้ */
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icon icon="star-off" className="text-3xl text-default-300 mb-2" />
            <p className="text-default-400 text-sm">ยังไม่มีรีวิวสำหรับออเดอร์นี้</p>
            <p className="text-default-400 text-xs mt-1">
              ผู้ซื้อจะสามารถรีวิวได้หลังยืนยันการรับสินค้า
            </p>
          </div>
        ) : (
          <>
            {/* reviewer label: ใช้ reviewerLabel ที่ mask แล้วจาก server — ไม่ต้อง mask ที่นี่ (S-C1) */}
            <div className="mb-5 flex items-center gap-2.5">
              <span className="btn btn-icon bg-light text-default-800 size-8! rounded-full shrink-0">
                <Icon icon="user" className="text-base" />
              </span>
              <div>
                <h5 className="text-default-800 text-sm font-medium leading-tight">
                  {review.reviewerLabel}
                </h5>
                <p className="text-default-400 text-xs mt-0.5">
                  {formatDate(review.createdAtISO)}
                </p>
              </div>
            </div>

            {/* rating stars */}
            <div className="mb-3">
              <Rating rating={review.rating} />
              <span className="text-default-400 text-xs ml-2">{review.rating} / 5</span>
            </div>

            {/* comment หรือ empty-comment notice */}
            {review.comment ? (
              <p className="text-default-600 text-sm italic leading-relaxed">
                &ldquo;{review.comment}&rdquo;
              </p>
            ) : (
              <p className="text-default-300 text-sm italic">ไม่มีความคิดเห็นเพิ่มเติม</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default OrderReviewCard
