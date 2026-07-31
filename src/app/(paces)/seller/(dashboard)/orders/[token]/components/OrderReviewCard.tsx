/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx
 *
 * ปรับจาก Paces CustomerDetails card primitive:
 * - คง: card → card-header → card-body pattern, icon-row layout
 * - เปลี่ยน content เป็น per-order review: rating (ใช้ Rating wrapper), comment, reviewer label
 * - ลบ: avatar image, country flag, dropdown actions, contact list (ไม่ใช่ scope นี้)
 * - เพิ่ม: empty-state ภาษาไทยถ้าไม่มีรีวิว
 * - reviewer label: รับ reviewerLabel จาก RSC — เป็น raw displayName/contact ตรง ๆ (ไม่ mask)
 *   ตาม user decision 2026-07-30 (โชว์เบอร์เต็มทั้งหน้า) — S-C1 คุมแค่ neutralize-at-source
 *   (scope shopId กัน flight payload หลุดไปหาคนที่ไม่ควรเห็น) ไม่ใช่ "ต้อง mask เสมอ"
 * - date → ISO string เพราะข้ามขอบเขต RSC → client ไม่ได้ถ้าเป็น Date object
 */

import Icon from '@/components/wrappers/Icon'
import Rating from '@/components/Rating'
import { formatDateTime } from '@/lib/format-date'

export interface OrderReviewData {
  /** rating 1-5 จาก Review.rating */
  rating: number
  /** comment อาจเป็น null */
  comment: string | null
  /**
   * label สำหรับแสดงผู้รีวิว — displayName (public) หรือ raw contact (เบอร์/อีเมล) เต็ม
   * หรือ 'ผู้ซื้อ (ไม่ระบุชื่อ)' — ไม่ mask ตาม user decision 2026-07-30
   */
  reviewerLabel: string
  /** ISO string ของ review.createdAt */
  createdAtISO: string
}

interface OrderReviewCardProps {
  /** null = ยังไม่มีรีวิวสำหรับคำสั่งซื้อนี้ */
  review: OrderReviewData | null
}

const OrderReviewCard = ({ review }: OrderReviewCardProps) => {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">รีวิวจากผู้ซื้อ</h4>
      </div>
      <div className="card-body">
        {!review ? (
          /* empty-state: ยังไม่มีรีวิวสำหรับคำสั่งซื้อนี้ */
          /* P5 (T14): text-default-400 บนพื้นขาว = 2.46:1 ไม่ผ่าน AA → default-700 (~4.69:1) */
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icon icon="star-off" className="text-3xl text-default-300 mb-2" />
            <p className="text-default-700 text-sm">ยังไม่มีรีวิวสำหรับคำสั่งซื้อนี้</p>
            <p className="text-default-700 text-xs mt-1">
              ผู้ซื้อจะสามารถรีวิวได้หลังยืนยันการรับสินค้า
            </p>
          </div>
        ) : (
          <>
            {/* reviewer label: raw จาก server (ไม่ mask — ดู comment หัวไฟล์)
                P6 (T14): เดิมใช้ <h5> ทำให้เกิด heading ปลอมต่อคำสั่งซื้อ (ไม่ใช่หัวข้อจริงของหน้า)
                — เปลี่ยนเป็น <p> คงคลาส/ภาพเดิมทั้งหมด (เหมือน S-3 ที่แก้ไปแล้วใน ShippingActivity.tsx) */}
            <div className="mb-5 flex items-center gap-2.5">
              <span className="btn btn-icon bg-light text-default-800 size-8! rounded-full shrink-0">
                <Icon icon="user" className="text-base" />
              </span>
              <div>
                <p className="text-default-800 text-sm font-medium leading-tight">
                  {review.reviewerLabel}
                </p>
                {/* P5 (T14): text-default-400 = 2.46:1 ไม่ผ่าน AA → default-700 */}
                <p className="text-default-700 text-xs mt-0.5">
                  {formatDateTime(review.createdAtISO)}
                </p>
              </div>
            </div>

            {/* rating stars */}
            <div className="mb-3">
              <Rating rating={review.rating} />
              <span className="text-default-700 text-xs ms-2">{review.rating} / 5</span>
            </div>

            {/* comment หรือ empty-comment notice
                P5 (T14): text-default-600 (comment) = 3.03:1 · text-default-400 (empty) = 2.46:1
                ไม่ผ่าน AA ทั้งคู่ → default-800 สำหรับ comment จริง (เนื้อหาหลัก, ~10.7:1) /
                default-700 สำหรับ placeholder (~4.69:1) ยัง maintain hierarchy (comment เข้มกว่า) */}
            {review.comment ? (
              <p className="text-default-800 text-sm italic leading-relaxed">
                &ldquo;{review.comment}&rdquo;
              </p>
            ) : (
              <p className="text-default-700 text-sm italic">ไม่มีความคิดเห็นเพิ่มเติม</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default OrderReviewCard
