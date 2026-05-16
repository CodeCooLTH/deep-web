/**
 * Badge Process page — seller's own badges (earned + in-progress)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * card shell (card/card-header/card-body) มาจาก StatisticCard; icon circle (bg-primary/15 text-primary
 * rounded-full) ก็มาจากที่เดิม. progress bar markup มาจาก
 * theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx — Examples section.
 *
 * Adapted: ขยายเป็น full-page grid จาก AchievementLevel widget; ใส่ progressLabel
 * Thai + progressRatio bar ต่อแต่ละ badge card; icon map ใช้แนวทางเดียวกับ
 * AchievementLevel.tsx (LUCIDE_FOR_BADGE map + fallback).
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว (redirect ถ้าไม่มี session/user)
 * ดังนั้น page-level ต้องแค่ `if (!user) return null` เหมือน reviews/page.tsx lines 25–28.
 * ไม่เพิ่ม isShop gate เพราะ layout auto-creates shop + redirect จัดการทั้งหมด (security must-fix #4).
 *
 * ทำไม audience='SELLER': getBadgeProgress resolves SELLER → ['SELLER','ANY'] ซึ่งตรงกับ
 * badge ที่ seller ควรเห็น (badge audience ANY รวมถึงทั้งสองฝั่ง).
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBadgeProgress } from '@/services/badge.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import type { Metadata } from 'next'
import type { BadgeProgress } from '@/types/badge'
import { BadgeImage } from './BadgeImage'

export const metadata: Metadata = { title: 'ความสำเร็จของร้านค้า' }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BadgesPage() {
  // auth narrowing — layout ทำ redirect แล้ว; ที่นี่แค่ type-narrow (ดู reviews/page.tsx lines 25–28)
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string } } | null)?.user
  if (!user) return null

  let items: BadgeProgress[] = []
  try {
    items = await getBadgeProgress(user.id, 'SELLER')
  } catch {
    items = []
  }

  const earned = items.filter((i) => i.earned)
  // in-progress = ยังไม่ได้รับ; เรียงจาก progressRatio มากไปน้อย (ใกล้สำเร็จก่อน)
  const inProgress = items
    .filter((i) => !i.earned)
    .sort((a, b) => b.progressRatio - a.progressRatio)

  return (
    <>
      <PageBreadcrumb title="ความสำเร็จ" trail={[{ label: 'Analytics' }]} />

      <div className="container-fluid space-y-6">

        {/* ── Earned section ────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h4 className="card-title">รางวัลที่ได้รับแล้ว</h4>
            <span className="text-default-400 text-xs">
              {earned.length} / {items.length} รางวัล
            </span>
          </div>
          <div className="card-body">
            {earned.length === 0 ? (
              <p className="text-default-400 text-sm text-center py-6">
                ยังไม่มีรางวัลที่ได้รับ — เริ่มขายเพื่อสะสมรางวัลแรก
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {earned.map((item) => (
                  <EarnedCard key={item.badge.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── In-progress section ────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h4 className="card-title">รางวัลที่กำลังดำเนินการ</h4>
          </div>
          <div className="card-body">
            {inProgress.length === 0 ? (
              <p className="text-default-400 text-sm text-center py-6">
                คุณได้รับรางวัลครบทุกรายการแล้ว
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {inProgress.map((item) => (
                  <InProgressRow key={item.badge.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * EarnedCard — card ของ badge ที่ได้รับแล้ว
 * card shell + icon circle: มาจาก StatisticCard (card/card-body + bg-primary/15 rounded-full)
 * ขนาด circle: size-24 (≥96px) ตาม T3B spec สำหรับ earned badge; ใช้ BadgeImage client island
 */
function EarnedCard({ item }: { item: BadgeProgress }) {
  return (
    <div className="card h-full" title={item.badge.name}>
      <div className="card-body flex flex-col items-center text-center gap-3 py-5">
        {/* icon circle — size-24 (≥96px) per T3B earned spec; ถ้ามี imageUrl แสดงรูป ถ้าไม่มีใช้ lucide icon */}
        <div className="size-24 bg-primary/15 text-primary rounded-full flex items-center justify-center overflow-hidden">
          <BadgeImage
            nameEN={item.badge.nameEN}
            imageUrl={item.badge.imageUrl}
            sizeClass="size-12"
            className="text-primary"
          />
        </div>
        <div>
          <p className="text-sm font-medium text-default-800 leading-snug">{item.badge.name}</p>
          <p className="text-xs text-default-400 mt-0.5">{item.badge.nameEN}</p>
        </div>
        <span className="text-xs text-success font-medium">ได้รับแล้ว</span>
      </div>
    </div>
  )
}

/**
 * InProgressRow — แถว badge ที่ยังไม่ได้รับ พร้อม Paces Tailwind progress bar
 * progress bar markup: theme/paces/.../ui/progress/page.tsx Examples section
 * outer: bg-default-100 flex h-4 w-full overflow-hidden rounded
 * inner: bg-primary + width inline style
 */
function InProgressRow({ item }: { item: BadgeProgress }) {
  const pct = Math.round(item.progressRatio * 100)

  return (
    <div className="flex items-start gap-4">
      {/* icon circle — grayscale เพราะยังไม่ได้รับ (pattern unearned จาก AchievementLevel); ใช้ BadgeImage */}
      <div className="size-10 bg-default-100 text-default-400 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
        <BadgeImage
          nameEN={item.badge.nameEN}
          imageUrl={item.badge.imageUrl}
          sizeClass="size-5"
          className="text-default-400"
        />
      </div>

      <div className="flex-1 min-w-0">
        {/* badge name + progress label */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-sm font-medium text-default-800 truncate">{item.badge.name}</p>
          <span className="text-xs text-default-400 shrink-0 tabular-nums">{pct}%</span>
        </div>

        {/* Paces canonical progress bar (Examples section, progress/page.tsx) */}
        <div
          className="bg-default-100 flex h-4 w-full overflow-hidden rounded"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="bg-primary flex flex-col justify-center overflow-hidden text-center whitespace-nowrap transition duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Thai progress label (progressLabel จาก service) */}
        {item.progressLabel && (
          <p className="text-xs text-default-400 mt-1">{item.progressLabel}</p>
        )}
      </div>
    </div>
  )
}
