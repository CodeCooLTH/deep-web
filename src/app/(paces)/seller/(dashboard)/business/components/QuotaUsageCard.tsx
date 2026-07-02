/**
 * QuotaUsageCard — การ์ดสรุปโควตาธุรกิจ (progress bar) + รายชื่อธุรกิจของ owner/admin (Design Spec §1 ข้อ 3)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx (Examples block — progress bar
 *   `bg-default-100 h-4 rounded` + inner `bg-primary` ตาม % width)
 *   + src/app/(paces)/seller/(dashboard)/settings/ConnectedAccountsClient.tsx:254 (ProviderRow —
 *   `flex items-center justify-between gap-3 py-3 border-b border-default-200 last:border-0` list row)
 *   + card-header ปุ่มขวา = pattern ทั่วไปของ Paces (card-header flex justify-between)
 *
 * server component ล้วน — ไม่มี interactive state (ปุ่ม "สร้างธุรกิจใหม่" เป็นแค่ next/link)
 */
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'

export interface QuotaBusinessItem {
  shopId: string
  shopName: string
  role: 'OWNER' | 'ADMIN'
  locked: boolean
}

export interface QuotaUsageCardProps {
  /** จำนวนธุรกิจที่ owner เป็นเจ้าของทั้งหมด (kind=BUSINESS, deletedAt=null รวม LOCKED — มิเรอร์ TFR-006) */
  ownedCount: number
  maxBusinesses: number | null
  /** ธุรกิจทั้งหมดที่ user เป็นสมาชิก (owner หรือ admin) — มิเรอร์ GET /context businesses[] */
  businesses: QuotaBusinessItem[]
  canCreate: boolean
}

export default function QuotaUsageCard({ ownedCount, maxBusinesses, businesses, canCreate }: QuotaUsageCardProps) {
  const pct =
    maxBusinesses === null
      ? ownedCount > 0
        ? 100
        : 0
      : maxBusinesses > 0
        ? Math.min(100, (ownedCount / maxBusinesses) * 100)
        : ownedCount > 0
          ? 100
          : 0

  return (
    <div className="card mb-base">
      <div className="card-header flex items-center justify-between gap-3">
        <h4 className="card-title">ธุรกิจของฉัน</h4>
        {canCreate ? (
          <Link
            href="/business/create"
            className="btn btn-sm bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-1.5"
          >
            <Icon icon="plus" className="text-base" aria-hidden="true" />
            สร้างธุรกิจใหม่
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="btn btn-sm bg-light text-default-400 inline-flex cursor-not-allowed items-center gap-1.5"
          >
            <Icon icon="plus" className="text-base" aria-hidden="true" />
            สร้างธุรกิจใหม่
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="mb-2 flex items-center justify-between text-sm font-medium">
          <span>จำนวนธุรกิจที่ใช้ไป</span>
          <span>
            {ownedCount}/{maxBusinesses === null ? 'ไม่จำกัด' : maxBusinesses}
          </span>
        </div>
        <div
          className="bg-default-100 mb-5 flex h-4 w-full overflow-hidden rounded"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="bg-primary flex flex-col justify-center overflow-hidden text-center whitespace-nowrap transition duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {businesses.length === 0 ? (
          <p className="text-default-400 text-sm">ยังไม่มีธุรกิจ — สมัครแพ็กเกจแล้วสร้างธุรกิจแรกได้เลย</p>
        ) : (
          <div>
            {businesses.map((b) => (
              <div
                key={b.shopId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-default-200 py-3 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Icon icon="building-store" className="text-default-400 text-base" aria-hidden="true" />
                  <span className="font-medium">{b.shopName}</span>
                  <span
                    className={
                      b.role === 'OWNER' ? 'badge bg-primary/15 text-primary' : 'badge bg-default-100 text-default-500'
                    }
                  >
                    {b.role === 'OWNER' ? 'เจ้าของ' : 'ผู้ดูแล'}
                  </span>
                  {b.locked && <span className="badge bg-danger/15 text-danger">ถูกล็อก</span>}
                </div>
                <Link href={`/business/${b.shopId}/invites`} className="text-primary text-sm font-medium hover:underline">
                  จัดการ
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
