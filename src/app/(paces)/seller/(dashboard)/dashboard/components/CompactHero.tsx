/**
 * CompactHero — hero header สำหรับ Seller Command Center v10 (compact, full-bleed)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/UserCard.tsx
 * ปุ่ม pattern: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx
 *
 * layout: 3 แถวบนพื้นหลัง SVG ลำแสง xenon โทน Paces น้ำเงิน
 *   Row 1: avatar+trust ring + ชื่อร้าน+stats + bell
 *   Row 2: wallet + ปุ่มเติมเงิน + divider + ShopLinkButtons
 *   Row 3: แถบแพ็กเกจร้านค้า (Business Package feat 00008) — มือถือไม่เห็นการ์ด
 *     sidenav (`.app-menu` ซ่อนที่ <1024px) จึงย้ายมาเป็นแถวบาง; logic สถานะ+copy
 *     คัดลอกมาจาก `_shared/ShopPackageSidenavCard.tsx` (ดู comment แต่ละ branch ด้านล่าง)
 *
 * S-1 (mobile account switcher): avatar-block + name-block ครอบด้วย AccountSwitcherLauncher
 * (client, อ่าน session เอง) — เปิด bottom sheet สลับบัญชีเมื่อมี business membership;
 * bell อยู่นอก launcher เหมือนเดิม (ไม่ใช่ trigger สลับบัญชี)
 */

import Link from 'next/link'
import { Icon } from '@iconify/react'
import ShopLinkButtons from './ShopLinkButtons'
import AccountSwitcherLauncher from './AccountSwitcherLauncher'
import {
  BUSINESS_PACKAGE_TIER_CONFIG,
  type BusinessPackageStatusApp,
  type BusinessPackageTier,
} from '@/lib/business-package'

export interface CompactHeroProps {
  shopName: string
  avatarUrl: string | null
  trustScore: number    // 0–100 → ring fill % + chip
  walletBalance: number
  shopSlug: string | null
  orderCount: number
  reviewCount: number
  avgRating: number     // 0–5
  notiCount?: number
  // Row 3 — แถบแพ็กเกจร้านค้า (ตั้งชื่อ packageStatus/packageTier ไม่ใช่ tier/tierLabel
  // เพื่อไม่ชนกับ tierName ที่แปลว่า trust tier ใน CommandCenterData — คนละเรื่องกัน)
  packageStatus: BusinessPackageStatusApp
  packageTier: BusinessPackageTier | null
  /** true = OWNER → ทั้งแถวเป็นลิงก์ไป /business; false = สมาชิกอื่น เห็นข้อมูลเหมือนกันแต่กดไม่ได้ */
  packageCanManage: boolean
}

export default function CompactHero({
  shopName,
  avatarUrl,
  trustScore,
  walletBalance,
  shopSlug,
  orderCount,
  reviewCount,
  avgRating,
  notiCount = 0,
  packageStatus,
  packageTier,
  packageCanManage,
}: CompactHeroProps) {
  const initial = shopName.trim().charAt(0).toUpperCase() || 'S'
  // clamp trustScore 0–100 เพื่อป้องกัน ring ล้นวง
  const score = Math.min(100, Math.max(0, trustScore))

  // ---- SVG Trust Ring คำนวณ ----
  // circumference = 2π × r = 2π × 26 ≈ 163.36
  const CIRCUMFERENCE = 163.36
  // dashoffset = circumference × (1 - score/100) → ยิ่งสูงยิ่งเต็มวง
  const dashOffset = CIRCUMFERENCE * (1 - score / 100)

  // ---- Row 3: แถบแพ็กเกจร้านค้า — logic สถานะ + copy คัดลอกจาก _shared/ShopPackageSidenavCard.tsx ----
  const isPackageLocked = packageStatus === 'LOCKED_RENEWAL_FAILED'
  const isPackageActive = packageStatus === 'ACTIVE'
  const packageConfig = packageTier ? BUSINESS_PACKAGE_TIER_CONFIG[packageTier] : null
  // Free = pseudo tier (ไม่มี row ใน BUSINESS_PACKAGE_TIER_CONFIG) — NOT_SUBSCRIBED เท่านั้นที่ไม่มี config
  const packageTierLabel = packageConfig?.label ?? 'Free'
  const packageAriaLabel = `แพ็กเกจร้านค้า ${packageTierLabel}${isPackageLocked ? ' ต่ออายุไม่สำเร็จ' : ''} ไปที่หน้าแพ็กเกจ`
  const packageIcon = isPackageLocked ? 'tabler:alert-triangle' : 'tabler:crown'
  const packageLabel = isPackageLocked
    ? 'ต่ออายุไม่สำเร็จ · แก้ไขเลย'
    : isPackageActive
      ? packageTierLabel
      : 'Free · อัพเกรดเพื่อเปิดธุรกิจเพิ่ม'
  // ไม่ใช้สีเขียวแม้ ACTIVE — เขียวสงวนไว้เฉพาะ trust verified (Verified-Means-Green Rule)
  const packageRowClasses = isPackageLocked
    ? 'border-danger bg-danger/90 text-white font-bold'
    : 'border-white/40 bg-white/10 ' + (isPackageActive ? 'text-white/95' : 'text-white/90')

  return (
    /* edge-to-edge ทำที่ CommandCenter wrapper (-mx-4 หักล้าง gutter 16px ทั้ง CC) — hero ไม่ต้อง -mx เอง */
    <div className="rounded-b-2xl overflow-hidden relative text-white flex-shrink-0">
      {/* ---- พื้นหลัง SVG ลำแสง xenon โทน Paces น้ำเงิน ---- */}
      {/*
       * HR7 arbitrary: SVG hero background + overlay
       * Paces ไม่มี image/gradient hero token; design ที่ user เลือก (premium feel)
       * คงโทน primary น้ำเงิน #236dc9 (ไม่ใช่ Vuexy mood ลอย) // HR7 carve-out
       */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 390 112"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* HR7 arbitrary: ไล่เฉดน้ำเงิน xenon — Paces ไม่มี gradient token */}
          <linearGradient id="ch-base" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2b7be0" /> {/* HR7 arbitrary */}
            <stop offset="1" stopColor="#163a72" /> {/* HR7 arbitrary */}
          </linearGradient>
          <radialGradient id="ch-glow" cx="0.86" cy="0.08" r="0.7">
            <stop offset="0" stopColor="#7fb4ff" stopOpacity=".55" /> {/* HR7 arbitrary */}
            <stop offset="1" stopColor="#7fb4ff" stopOpacity="0" /> {/* HR7 arbitrary */}
          </radialGradient>
        </defs>
        <rect width="390" height="112" fill="url(#ch-base)" />
        <rect width="390" height="112" fill="url(#ch-glow)" />
        {/* ลำแสง xenon เฉียง auto-xenon brand — HR7 arbitrary: #ffffff บน SVG (ไม่มี token) */}
        <g fill="#ffffff"> {/* HR7 arbitrary */}
          <polygon points="20,112 58,112 188,0 150,0" opacity=".10" />
          <polygon points="96,112 116,112 232,0 212,0" opacity=".07" />
          <polygon points="170,112 232,112 360,0 298,0" opacity=".12" />
          <polygon points="262,112 286,112 392,0 368,0" opacity=".06" />
        </g>
      </svg>

      {/*
       * HR7 arbitrary: overlay tint rgba(20,52,102,.30)
       * Paces ไม่มี hero-overlay token — ใช้เพื่อให้ตัวอักษรขาวอ่านชัด
       */}
      <div
        className="absolute inset-0"
        // eslint-disable-next-line react/forbid-dom-props
        style={{ background: 'rgba(20,52,102,0.30)' }}
        aria-hidden="true"
      />

      {/* ---- เนื้อหา hero ---- */}
      <div className="relative z-10 px-4 pt-3 pb-3">

        {/* Row 1: avatar + ชื่อร้าน+stats + bell */}
        <div className="flex items-center gap-3">
          <AccountSwitcherLauncher>

          {/* Avatar + Trust Ring + Score Chip */}
          {/*
           * HR7 arbitrary: SVG trust progress ring รอบ avatar
           * Paces ไม่มี token สำหรับ progress ring; ใช้ SVG circle stroke-dasharray
           * คำนวณจาก score% (circumference ≈ 163.36); ring ขาว, track โปร่ง
           */}
          <div className="relative flex-shrink-0" style={{ width: 58, height: 58 }}>
            {/* Ring SVG (rotate -90deg เพื่อให้ start ที่ 12 นาฬิกา) */}
            <svg
              viewBox="0 0 58 58"
              className="absolute inset-0 w-full h-full"
              style={{ transform: 'rotate(-90deg)' }}
              aria-hidden="true"
            >
              {/* track โปร่ง */}
              <circle
                cx="29"
                cy="29"
                r="26"
                fill="none"
                stroke="rgba(255,255,255,0.28)"
                strokeWidth="3.5"
              />
              {/* fill ตาม score% */}
              <circle
                cx="29"
                cy="29"
                r="26"
                fill="none"
                stroke="#ffffff" /* HR7 arbitrary: ring fill สีขาว — Paces ไม่มี token progress ring */
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
              />
            </svg>

            {/* Avatar image หรือ initials
                HR7 arbitrary: position/size 48×48 top:5 left:5 (inline) ให้พอดีกลาง trust ring 58px — Paces ไม่มี token วาง avatar ใน ring
                หมายเหตุ: ใช้ bg-white (ไม่ใช่ spec §12 bg-primary/15) — Controller decision: hero พื้นน้ำเงิน → bg-primary/15 จะจมมองไม่เห็น, วงขาวแมตช์ avatar slot + contrast ดีกว่า */}
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={shopName}
                className="absolute rounded-full object-cover"
                style={{ top: 5, left: 5, width: 48, height: 48 }}
              />
            ) : (
              <div
                className="absolute rounded-full bg-white text-primary flex items-center justify-center font-bold text-lg select-none"
                style={{ top: 5, left: 5, width: 48, height: 48 }}
                aria-label={shopName}
              >
                {initial}
              </div>
            )}

            {/* Score chip มุมล่าง avatar — HR7 arbitrary: bottom:-3 (badge-offset) + fontSize:9 (เล็กกว่า text-2xs) Paces ไม่มี token ขนาดนี้ */}
            <span className="absolute left-1/2 -translate-x-1/2 bg-white text-primary font-bold tabular-nums rounded-lg leading-none px-1.5 py-0.5" style={{ bottom: -3, fontSize: 9 }}>
              {score}
            </span>
          </div>

          {/* ชื่อร้าน + stats */}
          <div className="flex-1 min-w-0">
            <p className="text-md font-semibold truncate leading-tight text-white">{shopName}</p>
            <div className="flex items-center gap-1.5 mt-1 text-white/80 text-2xs whitespace-nowrap overflow-hidden">
              <span>
                <strong className="text-white font-bold">{orderCount.toLocaleString('th-TH')}</strong>{' '}
                คำสั่งซื้อ
              </span>
              <span className="opacity-50">·</span>
              <span>
                <strong className="text-white font-bold">{reviewCount.toLocaleString('th-TH')}</strong>{' '}
                รีวิว
              </span>
              <span className="opacity-50">·</span>
              <span className="inline-flex items-center gap-0.5">
                {/* Solar star icon สีทอง — HR7 arbitrary: #ffd24d (gold) Paces ไม่มี token สีทอง star (text-warning เป็นส้ม ไม่ตรง) */}
                <Icon icon="solar:star-bold-duotone" className="text-sm" style={{ color: '#ffd24d' /* HR7 arbitrary: gold */ }} />
                <strong className="text-white font-bold">{avgRating.toFixed(1)}</strong>
              </span>
            </div>
          </div>

          </AccountSwitcherLauncher>

          {/* Bell — ใช้ next/link ตรง (RSC ห้าม component={Link}) */}
          <Link
            href="/notifications"
            aria-label="การแจ้งเตือน"
            className="relative flex-shrink-0 text-white flex items-center justify-center"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <Icon icon="solar:bell-bold-duotone" className="text-2xl" />
            {notiCount > 0 && (
              <span
                className="absolute top-0 right-0 min-w-4 h-4 px-1 rounded-full bg-danger text-white font-bold flex items-center justify-center leading-none tabular-nums"
                /*
                 * HR7 arbitrary: box-shadow ring กัน badge จมพื้นหลัง
                 * Paces ไม่มี badge-ring token
                 */
                style={{ fontSize: 9.5, boxShadow: '0 0 0 2px rgba(20,52,102,0.60)' }}
              >
                {notiCount > 99 ? '99+' : notiCount}
              </span>
            )}
          </Link>
        </div>

        {/* Row 2: wallet balance + ปุ่มเติมเงิน + divider + ShopLinkButtons */}
        <div className="flex items-center gap-2.5 mt-3">
          {/* Wallet icon */}
          <Icon icon="solar:wallet-bold-duotone" className="text-lg text-white/95 flex-shrink-0" />

          {/* Wallet balance */}
          <span className="flex-1 text-sm font-bold text-white tabular-nums">
            ฿{walletBalance.toLocaleString('th-TH')}
          </span>

          {/*
           * ปุ่มเติมเงิน — white pill; ใช้ next/link ตรง (RSC ห้าม component={Link})
           * pattern จาก Paces buttons page: rounded-full bg-white text-primary btn-sm
           */}
          <Link
            href="/wallet"
            className="btn btn-sm bg-white text-primary rounded-full font-bold text-xs flex-shrink-0 inline-flex items-center gap-1"
          >
            <Icon icon="solar:add-circle-bold-duotone" className="text-base" />
            เติมเงิน
          </Link>

          {/* divider บาง */}
          <div
            className="flex-shrink-0"
            /*
             * HR7 arbitrary: divider เส้นบาง rgba สีขาว
             * Paces ไม่มี hero-divider token; ใช้ inline style เพื่อ opacity ตาม mockup
             */
            style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.28)' }}
            aria-hidden="true"
          />

          {/* Copy + Share ปุ่ม (client component) */}
          <ShopLinkButtons shopSlug={shopSlug} />
        </div>

        {/*
         * Row 3: แถบแพ็กเกจร้านค้า — sidenav card (_shared/ShopPackageSidenavCard.tsx) ถูกซ่อนบนมือถือ
         * (.app-menu display:none <1024px) จึงย้าย entry point มาไว้ตรงนี้แทน (ทั้งแถวเป็นลิงก์เดียว)
         * divider บาง — reuse ค่า rgba เดิมของ divider แนวตั้ง Row 2 (ไม่คิด opacity ใหม่)
         */}
        <div
          className="border-t mt-3 pt-3"
          style={{ borderColor: 'rgba(255,255,255,0.28)' }}
        >
          {/* ดูอย่างเดียว (ไม่ใช่ OWNER) → <div> ไม่ใช่ <Link> และไม่มีลูกศร — กันกดแล้วไปเจอ
              หน้าที่จัดการอะไรไม่ได้ (Business Package สมัครระดับบัญชีเจ้าของ) */}
          {(() => {
            const rowInner = (
              <>
                <Icon icon={packageIcon} className="text-base shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0 truncate text-2xs font-semibold">{packageLabel}</span>
                {isPackageActive && (
                  <span className="badge bg-white/20 text-white text-2xs shrink-0">ใช้งานอยู่</span>
                )}
                {packageCanManage && (
                  <span className="shrink-0 text-2xs" aria-hidden="true">&rarr;</span>
                )}
              </>
            )
            // tap target ≥44px: py-2.5 ให้แถวดูบาง + minHeight:44 (inline) ชดเชยเนื้อหาเตี้ย
            // — pattern เดียวกับปุ่มกระดิ่ง Row 1 (style minWidth/minHeight:44)
            const rowClass = `flex items-center gap-2 rounded-md border-s-3 px-2.5 py-2.5 ${packageCanManage ? 'transition-colors' : ''} ${packageRowClasses}`
            return packageCanManage ? (
              <Link href="/business" aria-label={packageAriaLabel} className={rowClass} style={{ minHeight: 44 }}>
                {rowInner}
              </Link>
            ) : (
              <div className={rowClass} style={{ minHeight: 44 }}>
                {rowInner}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
