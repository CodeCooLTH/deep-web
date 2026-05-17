/**
 * Badges page — seller earned/locked badge grid (Design Spec T8b)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products-grid/page.tsx
 *   — grid layout + section header row pattern
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products-grid/components/ProductCard.tsx
 *   — card shell (Paces `card`, padding, border, hover-lift)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx
 *   — progress bar markup (Examples section: bg-default-100 h-4 overflow-hidden rounded + fill bg-primary)
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx (redirect ถ้าไม่มี session)
 * BadgeImage เป็น 'use client' island — ไม่แตะ RSC contract ของ page นี้
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBadgeProgress } from '@/services/badge.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import type { Metadata } from 'next'
import type { BadgeProgress } from '@/types/badge'
import { BadgeImage } from './BadgeImage'

export const metadata: Metadata = { title: 'ความสำเร็จของร้านค้า' }
// หมายเหตุ: ไม่ต้องตั้ง dynamic — getServerSession (อ่าน cookie) ทำให้หน้า dynamic
// อยู่แล้ว เหมือน reviews/dashboard sibling. force-dynamic บน child ทำ Paces
// AppProvidersWrapper/LayoutProvider แตก (MenuToggler crash)

// ─── Category label map — derive จาก criteria.type (ไม่ใช่ badge.type) ──────────
// badge.type จริงมีแค่ ACHIEVEMENT|VERIFICATION — category label derive จาก criteria.type
// เพื่อให้ card บอก context ที่ meaningful กว่า
const CRITERIA_CATEGORY_LABEL: Record<string, string> = {
  FIRST_ORDER: 'ยอดขาย',
  ORDER_COUNT: 'ยอดขาย',
  PERFECT_RATING: 'รีวิว',
  HIGH_RATING: 'รีวิว',
  UNIQUE_REVIEWERS: 'รีวิว',
  VETERAN: 'อายุร้าน',
  FAST_SHIPPING: 'การจัดส่ง',
  ZERO_COMPLAINT: 'บริการ',
  FULL_VERIFICATION: 'ยืนยันตัวตน',
  SIGNUP_YEAR: 'ครบรอบ',
}

/** parse criteria.type อย่างปลอดภัย — criteria เป็น unknown ใน BadgeProgress */
function getCategoryLabel(criteria: unknown): string | null {
  const type = (criteria as { type?: string } | null)?.type
  if (!type) return null
  return CRITERIA_CATEGORY_LABEL[type] ?? null
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BadgesPage() {
  // auth narrowing — layout ทำ redirect แล้ว; type-narrow เหมือน reviews/page.tsx
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string } } | null)?.user
  if (!user) return null

  let items: BadgeProgress[] = []
  try {
    items = await getBadgeProgress(user.id, 'SELLER')
  } catch {
    items = []
  }

  // ทำไม earned = filter(earned) แล้ว locked sort desc by progressRatio (ใกล้ถึงก่อน):
  // ผู้ขายควรเห็น badge ที่ใกล้ได้รับก่อน เพื่อ motivate ให้ทำต่อ
  const earned = items.filter((i) => i.earned)
  const locked = items
    .filter((i) => !i.earned)
    .sort((a, b) => b.progressRatio - a.progressRatio)

  return (
    <>
      <PageBreadcrumb title="ความสำเร็จ" trail={[{ label: 'Analytics' }]} />

      <div className="container-fluid space-y-8">

        {/* ── Section: ได้รับแล้ว ─────────────────────────────────────────── */}
        <section>
          {/* header row — count pill + divider line (จาก products-grid page header pattern) */}
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-bold text-default-800 shrink-0">ได้รับแล้ว</h2>
            <span className="bg-default-800 text-white text-xs font-bold rounded-full px-2.5 py-0.5 shrink-0">
              {earned.length}
            </span>
            <div className="flex-1 h-px bg-default-200" />
          </div>

          {earned.length === 0 ? (
            <p className="text-center text-default-400 py-8">
              ยังไม่มีรางวัลที่ได้รับ — เริ่มขายเพื่อสะสมรางวัลแรก
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
              {earned.map((item) => (
                <EarnedCard key={item.badge.id} item={item} />
              ))}
            </div>
          )}
        </section>

        {/* ── Section: ยังล็อกอยู่ ────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-bold text-default-800 shrink-0">ยังล็อกอยู่</h2>
            <span className="bg-default-800 text-white text-xs font-bold rounded-full px-2.5 py-0.5 shrink-0">
              {locked.length}
            </span>
            <div className="flex-1 h-px bg-default-200" />
          </div>

          {locked.length === 0 ? (
            <p className="text-center text-default-400 py-8">
              คุณได้รับรางวัลครบทุกรายการแล้ว
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
              {locked.map((item) => (
                <LockedCard key={item.badge.id} item={item} />
              ))}
            </div>
          )}
        </section>

      </div>
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * EarnedCard — badge card สำหรับ badge ที่ได้รับแล้ว
 * shell: Paces card (ProductCard theme) + hover-lift
 * content: art 110px + category label + name + "ได้รับแล้ว"
 */
function EarnedCard({ item }: { item: BadgeProgress }) {
  const categoryLabel = getCategoryLabel(item.badge.criteria)

  return (
    <div className="card p-3 text-center rounded-2xl border border-default-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all">
      {/* art wrapper — 110px ตาม spec */}
      <div className="size-[72px] mx-auto mb-2 relative">
        <BadgeImage
          nameEN={item.badge.nameEN}
          imageUrl={item.badge.imageUrl}
          sizeClass="size-[72px]"
        />
      </div>

      {/* category label — omit ทั้งบรรทัดถ้า map ไม่เจอ (spec: ถ้า map ไม่เจอ → omit) */}
      {categoryLabel && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-default-400 mb-1">
          {categoryLabel}
        </p>
      )}

      <h3 className="text-[13px] font-bold text-default-800 mb-1 leading-snug">
        {item.badge.name}
      </h3>
      <p className="text-xs text-default-500">ได้รับแล้ว</p>
    </div>
  )
}

/**
 * LockedCard — badge card สำหรับ badge ที่ยังไม่ได้รับ
 * shell: bg-default-50, ไม่มี hover-lift (spec ระบุชัด)
 * grayscale + opacity-70 บน BadgeImage + lock overlay icon
 * progress bar: spec สี warning ≥70%, primary <70%
 */
function LockedCard({ item }: { item: BadgeProgress }) {
  const categoryLabel = getCategoryLabel(item.badge.criteria)
  const pct = Math.round(item.progressRatio * 100)
  // ทำไม threshold 0.7: spec กำหนด progressRatio>=0.7 → bg-warning else bg-primary
  const barColor = item.progressRatio >= 0.7 ? 'bg-warning' : 'bg-primary'

  return (
    <div className="card bg-default-50 p-3 text-center rounded-2xl border border-default-200 shadow-sm">
      {/* art wrapper — grayscale บอกสถานะ locked (section header + progress สื่อครบแล้ว
          เอา lock-circle overlay ออก: ไอคอนไม่ขึ้น = วงกลมเปล่าดูเป็นบั๊ก + รก) */}
      <div className="size-[72px] mx-auto mb-2">
        <BadgeImage
          nameEN={item.badge.nameEN}
          imageUrl={item.badge.imageUrl}
          sizeClass="size-[72px]"
          className="grayscale opacity-60"
        />
      </div>

      {/* category label — omit ถ้า map ไม่เจอ */}
      {categoryLabel && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-default-400 mb-1">
          {categoryLabel}
        </p>
      )}

      <h3 className="text-[13px] font-bold text-default-500 mb-1 leading-snug">
        {item.badge.name}
      </h3>

      {/* progress block — dashed divider + track + label (progressLabel แสดงครั้งเดียวใต้ bar) */}
      <div className="border-t border-dashed border-default-200 mt-3 pt-3">
        {/* track — Paces canonical bar (Examples section, progress/page.tsx) แต่ h-1.5 ตาม spec */}
        <div
          className="bg-default-200 h-1.5 w-full rounded-full overflow-hidden mb-1.5"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs font-bold text-default-600 text-center tabular-nums">
          {item.progressLabel ?? 'ยังไม่เริ่ม'}
        </p>
      </div>
    </div>
  )
}
