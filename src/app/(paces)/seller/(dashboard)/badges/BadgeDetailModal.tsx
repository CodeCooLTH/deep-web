'use client'

/**
 * BadgeDetailModal — rich modal รายละเอียด badge (Design Spec T8d)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 *   — card shell (card-header / card-body / card-footer) + ✕ button + backdrop pattern
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/components/IssueDetailModal.tsx
 *   — progress bar markup (h-1.5 rounded track + fill) + badge/chip pattern ใน body
 *
 * Controlled ด้วย React state (ไม่ใช้ HSOverlay API) — selectedBadge state อยู่ที่ BadgeGrid.tsx
 * A11y: role="dialog" aria-modal="true" aria-labelledby="badge-modal-title"; Esc keydown listener
 *
 * ทำไม useEffect fetch สด: rarity + estimate ไม่ cache — ข้อมูลเปลี่ยนบ่อย กัน stale display
 * (Controller decision #8)
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon as IconifyIcon } from '@iconify/react'
import Icon from '@/components/wrappers/Icon'
import type { BadgeProgress } from '@/types/badge'
import type { BadgeRarity, RarityTier, BadgePaceEstimate } from '@/services/badge.service'
import { BadgeImage } from './BadgeImage'
import { getCategoryLabel } from './_constants/badge-labels'

// ─── Rarity helpers ───────────────────────────────────────────────────────────

/** แปล tier เป็น label ไทย ตาม Controller decision #2 */
function rarityLabel(tier: RarityTier): string {
  switch (tier) {
    case 'COMMON': return 'ทั่วไป'
    case 'UNCOMMON': return 'ไม่ทั่วไป'
    case 'RARE': return 'หายาก'
    case 'LEGENDARY': return 'หายากมาก'
  }
}

// ─── Subtitle template ────────────────────────────────────────────────────────

/** สร้าง subtitle ตาม criteria.type — แทรก % จริงถ้ามี (Controller decision #1) */
function buildSubtitle(criteria: unknown, rarityData: BadgeRarity | null): string {
  const c = criteria as Record<string, unknown> | null | undefined
  const type = typeof c?.type === 'string' ? c.type : ''
  const num = (key: string): number => {
    const v = c?.[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }

  // suffix % จากข้อมูล rarity ถ้ามี (shopCount >= 20)
  const rarityPct =
    rarityData && rarityData.shopCount >= 20
      ? ` — ${rarityData.pct.toFixed(1)}% ของร้านค้าได้รับ`
      : ''

  switch (type) {
    case 'FIRST_ORDER': return `รางวัลสำหรับออเดอร์แรกของร้านค้า${rarityPct}`
    case 'ORDER_COUNT': return `สะสมครบ ${num('count')} ออเดอร์สำเร็จ${rarityPct}`
    case 'PERFECT_RATING': return `รักษาคะแนนรีวิว 5 ดาว อย่างน้อย ${num('minReviews')} ครั้ง${rarityPct}`
    case 'HIGH_RATING': return `รักษาคะแนนรีวิวเฉลี่ย ≥${num('minRating')} ดาว${rarityPct}`
    case 'ZERO_COMPLAINT': return `ปิด ${num('minOrders')} ออเดอร์โดยไม่มีการยกเลิก${rarityPct}`
    case 'VETERAN': return `เปิดร้านต่อเนื่องครบ ${num('minDays')} วัน${rarityPct}`
    case 'FAST_SHIPPING': return `จัดส่งเฉลี่ยภายใน ${num('maxHours')} ชั่วโมง${rarityPct}`
    case 'FULL_VERIFICATION': return `ยืนยันตัวตนครบทุกระดับ (L1 + L2 + L3)${rarityPct}`
    case 'UNIQUE_REVIEWERS': return `ได้รับรีวิวจากลูกค้าไม่ซ้ำกัน ${num('count')} ราย${rarityPct}`
    case 'SIGNUP_YEAR': {
      const year = num('year')
      // SIGNUP_YEAR ไม่แทรก rarityPct (Controller #5)
      return `รางวัลพิเศษสำหรับสมาชิกปี ${year}`
    }
    default: return 'รางวัลพิเศษจากระบบ Deep'
  }
}

// ─── How-to tips ──────────────────────────────────────────────────────────────

type TipLine = { icon: string; text: string }

/** tips วิธีปลดล็อก badge ตาม criteria.type; คืน null สำหรับ non-countable / SIGNUP_YEAR */
function buildTips(criteria: unknown): TipLine[] | null {
  const c = criteria as Record<string, unknown> | null | undefined
  const type = typeof c?.type === 'string' ? c.type : ''
  const num = (key: string): number => {
    const v = c?.[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }

  switch (type) {
    case 'FIRST_ORDER':
      return [
        { icon: 'tabler-plus', text: 'สร้างออเดอร์ใหม่ผ่านเมนู "ออเดอร์"' },
        { icon: 'tabler-share', text: 'แชร์ลิงก์ยืนยันให้ลูกค้าผ่านช่องทางที่สะดวก' },
        { icon: 'tabler-check', text: 'รอลูกค้ายืนยัน OTP เพื่อปิดออเดอร์แรก' },
      ]
    case 'ORDER_COUNT':
      return [
        { icon: 'tabler-clipboard-list', text: `สะสมออเดอร์สำเร็จให้ครบ ${num('count')} ออเดอร์` },
        { icon: 'tabler-share', text: 'แชร์ลิงก์ยืนยันให้ลูกค้าทุกครั้ง' },
        { icon: 'tabler-repeat', text: 'สร้างออเดอร์ต่อเนื่องเพื่อรักษาอัตราเติบโต' },
      ]
    case 'ZERO_COMPLAINT':
      return [
        { icon: 'tabler-message-check', text: 'ตอบสนองลูกค้าก่อนยกเลิก' },
        { icon: 'tabler-refresh-alert', text: 'เสนอแก้ไขแทนการยกเลิก' },
        { icon: 'tabler-shield', text: `ปิดออเดอร์ครบ ${num('minOrders')} ครั้งโดยไม่มีการยกเลิกจากฝั่งร้าน` },
      ]
    case 'UNIQUE_REVIEWERS':
      return [
        { icon: 'tabler-star', text: 'ให้บริการดีเพื่อกระตุ้นให้ลูกค้าเขียนรีวิว' },
        { icon: 'tabler-users', text: `สะสมรีวิวจากลูกค้าใหม่ ${num('count')} ราย` },
        { icon: 'tabler-message-star', text: 'ตอบรีวิวเพื่อสร้างความสัมพันธ์ที่ดี' },
      ]
    case 'FULL_VERIFICATION':
      return [
        { icon: 'tabler-id', text: 'ยืนยัน OTP มือถือ (L1) — เสร็จแล้ว' },
        { icon: 'tabler-file-description', text: 'อัปโหลดเอกสารตัวตน (L2)' },
        { icon: 'tabler-building-store', text: 'ยืนยันการจดทะเบียนธุรกิจ (L3)' },
      ]
    // non-countable types ที่ไม่มี how-tips ที่ meaningful
    case 'VETERAN':
    case 'HIGH_RATING':
    case 'PERFECT_RATING':
    case 'FAST_SHIPPING':
    case 'SIGNUP_YEAR':
    default:
      return null
  }
}

// ─── CTA config ───────────────────────────────────────────────────────────────

type CtaConfig = { label: string; path: string } | null

/** CTA ตาม criteria.type; null = ไม่แสดง CTA */
function buildCta(criteria: unknown, earned: boolean): CtaConfig {
  if (earned) return null
  const c = criteria as Record<string, unknown> | null | undefined
  const type = typeof c?.type === 'string' ? c.type : ''
  switch (type) {
    case 'FIRST_ORDER':
    case 'ORDER_COUNT':
    case 'ZERO_COMPLAINT':
      return { label: 'จัดการออเดอร์', path: '/orders' }
    case 'FULL_VERIFICATION':
      return { label: 'ยืนยันตัวตน', path: '/verification' }
    case 'UNIQUE_REVIEWERS':
      return { label: 'ดูรีวิว', path: '/reviews' }
    // VETERAN/SIGNUP_YEAR/HIGH_RATING/PERFECT_RATING/FAST_SHIPPING ไม่มี CTA
    default:
      return null
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

type BadgeDetailModalProps = {
  badge: BadgeProgress | null
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BadgeDetailModal({ badge, onClose }: BadgeDetailModalProps) {
  const router = useRouter()
  const [rarity, setRarity] = useState<BadgeRarity | null>(null)
  const [rarityLoading, setRarityLoading] = useState(false)
  const [rarityError, setRarityError] = useState(false)
  const [estimate, setEstimate] = useState<BadgePaceEstimate | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)

  // fetch สดทุกครั้งที่เปิด modal (Controller decision #8 — ไม่ cache)
  useEffect(() => {
    if (!badge) {
      setRarity(null)
      setEstimate(null)
      return
    }

    // fetch rarity
    setRarityLoading(true)
    setRarityError(false)
    fetch(`/api/badges/${badge.badge.id}/rarity`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: BadgeRarity) => setRarity(data))
      .catch(() => setRarityError(true))
      .finally(() => setRarityLoading(false))

    // fetch estimate เฉพาะ badge ที่ยังไม่ได้รับ
    if (!badge.earned) {
      setEstimateLoading(true)
      setEstimate(null)
      fetch(`/api/badges/${badge.badge.id}/estimate`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data: BadgePaceEstimate) => setEstimate(data))
        .catch(() => setEstimate({ estimateDays: null, ratePerDay: null, reason: 'no_data' }))
        .finally(() => setEstimateLoading(false))
    }
  }, [badge])

  // Esc keydown listener
  useEffect(() => {
    if (!badge) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [badge, onClose])

  if (!badge) return null

  const categoryLabel = getCategoryLabel(badge.badge.criteria)
  const pct = Math.round(badge.progressRatio * 100)
  const barColor = badge.progressRatio >= 0.7 ? 'bg-warning' : 'bg-primary'
  const tips = buildTips(badge.badge.criteria)
  const cta = buildCta(badge.badge.criteria, badge.earned)

  // ทำไม shopCount<20 ซ่อน rarity pill: ตัวเลข <20 ร้านไม่มีนัยสำคัญทางสถิติ
  // กัน mislabel ทุก badge เป็น LEGENDARY (Controller decision #1)
  const showRarityPill = rarity !== null && !rarityError && rarity.shopCount >= 20

  // SIGNUP_YEAR: ดึง year จาก criteria
  const criteriaObj = badge.badge.criteria as Record<string, unknown> | null | undefined
  const criteriaType = typeof criteriaObj?.type === 'string' ? criteriaObj.type : ''
  const signupYear = criteriaType === 'SIGNUP_YEAR' && typeof criteriaObj?.year === 'number'
    ? criteriaObj.year
    : null

  // float animation keyframe (Controller decision #3 — subtle, translateY 6px, 4s)
  const floatKeyframes = `
    @keyframes badge-float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-6px); }
    }
  `

  return (
    <>
      {/* float animation style — inline ใน client component (ไม่แตะ tailwind.config) */}
      <style>{floatKeyframes}</style>

      {/* backdrop */}
      <div
        className="fixed inset-0 z-70 bg-black/60"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* dialog container */}
      <div className="fixed inset-0 z-80 flex items-center justify-center p-3 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="badge-modal-title"
          className="w-full max-w-3xl max-h-[92vh] flex flex-col card pointer-events-auto overflow-hidden"
        >
          {/* ── Header (จาก AddCategoryModal pattern) ──────────────────────── */}
          <div className="card-header p-5 shrink-0">
            <h3 id="badge-modal-title" className="font-medium text-sm">
              รายละเอียดรางวัล
            </h3>
            <button type="button" aria-label="ปิด" onClick={onClose}>
              <Icon icon="x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          {/* ── Body — 2-col grid (จาก IssueDetailModal layout pattern) ─────── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] h-full">

              {/* ── ซ้าย: badge side ─────────────────────────────────────────── */}
              <div
                className="flex flex-col items-center justify-center gap-4 p-8 border-b border-default-200 md:border-b-0 md:border-e md:border-default-200 relative overflow-hidden"
                style={{
                  // amber/violet gradient + dotted bg (decorative — inline style ตาม Controller decision #6)
                  background: 'radial-gradient(ellipse at 60% 30%, rgba(139,92,246,0.12) 0%, rgba(245,158,11,0.08) 60%, transparent 100%)',
                  backgroundSize: '400px 400px, auto',
                }}
              >
                {/* dotted overlay — decorative */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-[0.07] pointer-events-none"
                  style={{
                    backgroundImage: 'radial-gradient(circle, #6366f1 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                  }}
                />

                {/* badge image with float animation */}
                <div
                  style={{ animation: 'badge-float 4s ease-in-out infinite' }}
                  className="relative z-10"
                >
                  {/* md: 200px, mobile: 140px */}
                  <div className="size-[140px] md:size-[200px]">
                    <BadgeImage
                      nameEN={badge.badge.nameEN}
                      imageUrl={badge.badge.imageUrl}
                      sizeClass="size-[140px] md:size-[200px]"
                      className={badge.earned ? '' : 'grayscale opacity-60'}
                    />
                  </div>
                </div>

                {/* rarity pill — skeleton ระหว่าง load, ซ่อนถ้า shopCount<20 หรือ error */}
                <div className="relative z-10 h-7 flex items-center">
                  {rarityLoading ? (
                    <div className="h-6 w-20 rounded-full bg-default-200 animate-pulse" />
                  ) : showRarityPill && rarity ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white"
                      style={{
                        background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                      }}
                    >
                      <IconifyIcon icon="tabler-diamond" className="text-sm" />
                      {rarityLabel(rarity.tier)}
                    </span>
                  ) : null}
                </div>

                {/* id tag — mono style */}
                <p className="relative z-10 font-mono text-[10px] text-default-400 tracking-widest">
                  id: {badge.badge.nameEN}
                </p>
              </div>

              {/* ── ขวา: detail side ─────────────────────────────────────────── */}
              <div className="overflow-y-auto p-6 space-y-5">

                {/* category tag */}
                {categoryLabel && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-default-400">
                    {categoryLabel}
                  </p>
                )}

                {/* badge name */}
                <h2 className="text-xl font-bold text-default-800 leading-snug -mt-3">
                  {badge.badge.name}
                </h2>

                {/* subtitle */}
                <p className="text-sm text-default-500 -mt-3">
                  {buildSubtitle(badge.badge.criteria, rarity)}
                </p>

                {/* ── earned status chip ────────────────────────────────────── */}
                {badge.earned && (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-success/10 text-success">
                    <IconifyIcon icon="tabler-check" />
                    ได้รับแล้ว
                  </span>
                )}

                {/* ── progress card (amber gradient, ซ่อนถ้า earned) ────────── */}
                {!badge.earned && criteriaType !== 'SIGNUP_YEAR' && (
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{
                      // amber gradient card (Controller decision #6 — inline style)
                      background: 'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(251,191,36,0.06) 100%)',
                      border: '1px solid rgba(245,158,11,0.2)',
                    }}
                  >
                    <p className="text-xs font-bold text-default-700 uppercase tracking-wide">
                      ความคืบหน้า
                    </p>

                    {/* raw label + % ใหญ่ */}
                    <div className="flex items-end justify-between">
                      <span className="text-sm text-default-600">
                        {badge.progressLabel ?? 'ยังไม่เริ่ม'}
                      </span>
                      <span className="text-2xl font-black tabular-nums text-default-800">
                        {pct}%
                      </span>
                    </div>

                    {/* progress bar (IssueDetailModal pattern: h-1.5 rounded track + fill) */}
                    <div
                      className="h-1.5 w-full rounded-full bg-default-200 overflow-hidden"
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

                    {/* estimate line */}
                    {estimateLoading ? (
                      <div className="h-4 w-40 rounded bg-default-200 animate-pulse" />
                    ) : estimate && estimate.reason !== 'non_countable' ? (
                      <p className="text-xs text-default-500">
                        {estimate.reason === 'estimated' && estimate.estimateDays !== null
                          ? `ประมาณ ${estimate.estimateDays} วันถึงจะได้รับ (อัตรา ${estimate.ratePerDay?.toFixed(1)}/วัน)`
                          : 'เริ่มทำวันนี้เพื่อปลดล็อก'}
                      </p>
                    ) : null}
                  </div>
                )}

                {/* SIGNUP_YEAR: ซ่อน progress bar, แสดงข้อความแทน (Controller #5) */}
                {!badge.earned && criteriaType === 'SIGNUP_YEAR' && signupYear !== null && (
                  <div className="rounded-xl p-4 bg-default-50 border border-default-200">
                    <p className="text-sm text-default-600">
                      รางวัลพิเศษสำหรับสมาชิกปี {signupYear}
                    </p>
                  </div>
                )}

                {/* ── how-section tips (ซ่อนถ้า earned / SIGNUP_YEAR) ─────────── */}
                {!badge.earned && criteriaType !== 'SIGNUP_YEAR' && tips && tips.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-default-700 uppercase tracking-wide">
                      วิธีปลดล็อก
                    </p>
                    <ul className="space-y-2">
                      {tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-default-600">
                          <IconifyIcon
                            icon={tip.icon}
                            className="mt-0.5 shrink-0 text-primary text-base"
                          />
                          {tip.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ── reward box (Controller #9 — ผลจริงเท่านั้น) ────────────── */}
                <div
                  className={`rounded-xl p-4 flex items-start gap-3 ${
                    badge.earned
                      ? 'bg-success/10 border border-success/20'
                      : 'bg-default-50 border border-default-200'
                  }`}
                >
                  <IconifyIcon
                    icon="tabler-shield-check"
                    className={`text-2xl shrink-0 mt-0.5 ${badge.earned ? 'text-success' : 'text-default-400'}`}
                  />
                  <div>
                    <p className={`text-sm font-bold ${badge.earned ? 'text-success' : 'text-default-700'}`}>
                      {badge.earned ? 'รางวัลที่ได้รับ' : 'รางวัลที่จะได้รับ'}
                    </p>
                    <p className="text-xs text-default-500 mt-0.5">
                      {badge.earned
                        ? 'badge นี้ปรากฏบนโปรไฟล์สาธารณะของคุณ และ Trust Score เพิ่มขึ้น 10%'
                        : 'ปลดล็อกแล้ว badge จะปรากฏบนโปรไฟล์สาธารณะ และ Trust Score เพิ่มขึ้น 10%'}
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* ── Footer (จาก AddCategoryModal pattern) ──────────────────────── */}
          <div className="border-t border-default-200 flex items-center justify-end gap-x-2 p-4 shrink-0">
            <button
              type="button"
              className="btn bg-default-200 hover:text-primary"
              onClick={onClose}
            >
              ปิด
            </button>
            {cta && (
              /* CTA: useRouter pattern (Controller decision #7 — ไม่ใช้ component={Link}) */
              <button
                type="button"
                className="btn bg-primary text-white hover:bg-primary-hover"
                onClick={() => {
                  onClose()
                  router.push(cta.path)
                }}
              >
                {cta.label}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
