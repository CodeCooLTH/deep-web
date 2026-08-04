/**
 * CompactHero — hero header สำหรับ Seller Command Center v10 (compact, full-bleed)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/UserCard.tsx
 * ปุ่ม pattern: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx
 *
 * layout: 2 แถวบนพื้นหลัง SVG ลำแสง xenon โทน Paces น้ำเงิน
 *   Row 1:  avatar+trust ring + ชื่อร้าน + bell
 *   Row 1b: สถิติ (ออเดอร์/รีวิว/ดาว) + ชิปแพ็กเกจ — อยู่นอกปุ่มสลับบัญชี
 *   Row 2:  wallet + ปุ่มเติมเงิน + divider + ShopLinkButtons
 *
 * 2026-08-04: แถวแพ็กเกจเต็มความกว้าง (Row 3 เดิม) ถูกตัดออกตามคำสั่ง user แล้วย่อเป็นชิปใน Row 1b
 * — hero เตี้ยลง ~69px; logic สถานะ+copy ยังอิง `_shared/ShopPackageSidenavCard.tsx` เหมือนเดิม
 * ชิปยังเป็นทางเข้า /business ทางเดียวบนมือถือ (การ์ด sidenav ซ่อนที่ <1024px) จึงห้ามให้มันหาย
 *
 * S-1 (mobile account switcher): avatar-block + name-block ครอบด้วย AccountSwitcherLauncher
 * (client, อ่าน session เอง) — เปิด bottom sheet สลับบัญชีเมื่อมี business membership;
 * bell กับบรรทัดสถิติอยู่นอก launcher (ไม่ใช่ trigger สลับบัญชี)
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
  /** ความกว้าง/สูงของวง trust ring (HR7 carve-out เดิมของไฟล์นี้ — Paces ไม่มี token progress ring)
   *  ประกาศเป็นค่าเดียวเพราะบรรทัดสถิติที่อยู่นอกปุ่มสลับบัญชีต้องเยื้องตามความกว้างนี้เป๊ะ */
  const AVATAR_SIZE = 58
  const initial = shopName.trim().charAt(0).toUpperCase() || 'S'
  // clamp trustScore 0–100 เพื่อป้องกัน ring ล้นวง
  const score = Math.min(100, Math.max(0, trustScore))

  // ---- SVG Trust Ring คำนวณ ----
  // circumference = 2π × r = 2π × 26 ≈ 163.36
  const CIRCUMFERENCE = 163.36
  // dashoffset = circumference × (1 - score/100) → ยิ่งสูงยิ่งเต็มวง
  const dashOffset = CIRCUMFERENCE * (1 - score / 100)

  /**
   * ---- ชิปแพ็กเกจ (เดิมเป็น "Row 3" แถบเต็มความกว้างล่างสุดของ hero) ----
   *
   * user สั่งย้าย 2026-08-04: "เอา tab package ไปไว้ตรงอื่น ... แต่ไม่มี ตรงด้านล่าง" แล้วตามด้วย
   * "ไว้ข้างล่าง ชื่อ ธนภัทร อะไหล่มอเตอร์ไซค์ เป็น label [Business] ไรงี้"
   *
   * แถวเดิมมีของ 4 ชิ้น (ไอคอน+ชื่อ+badge "ใช้งานอยู่"+ลูกศร) กระจายเต็มความกว้าง 350px ทั้งที่
   * ตัวหนังสือรวมกันไม่ถึง 20 ตัวอักษร ช่องว่างตรงกลางจึงเป็น "รู" ไม่ใช่ระยะหายใจ — และกล่อง
   * border-s-3 เป็นภาษาของ callout/คำเตือน ซึ่งขัดกับสถานะปกติที่เป็นเรื่องดี
   * ตัดทั้งแถว + เส้นคั่น = hero เตี้ยลง ~69px
   *
   * badge "ใช้งานอยู่" ถูกตัดถาวร — ถ้าไม่ได้ใช้งานอยู่ก็จะไม่เห็นชื่อแพ็กเกจตั้งแต่แรก มันจึงไม่เคย
   * บอกอะไรเพิ่ม และเป็นตัวที่ดันให้แถวยืดเต็มความกว้าง
   */
  const isPackageLocked = packageStatus === 'LOCKED_RENEWAL_FAILED'
  const packageConfig = packageTier ? BUSINESS_PACKAGE_TIER_CONFIG[packageTier] : null
  // Free = pseudo tier (ไม่มี row ใน BUSINESS_PACKAGE_TIER_CONFIG) — NOT_SUBSCRIBED เท่านั้นที่ไม่มี config
  const packageTierLabel = packageConfig?.label ?? 'Free'
  const packageAriaLabel = `แพ็กเกจร้านค้า ${packageTierLabel}${isPackageLocked ? ' ต่ออายุไม่สำเร็จ' : ''} ไปที่หน้าแพ็กเกจ`
  const packageIcon = isPackageLocked ? 'tabler:alert-triangle' : 'tabler:crown'
  const packageChipLabel = isPackageLocked ? 'ต่ออายุไม่สำเร็จ' : packageTierLabel
  /* ไม่ใช้เขียวแม้ ACTIVE — เขียวสงวนให้ trust verified (Verified-Means-Green Rule)
     ปกติ = outline ขาวโปร่ง (ไม่แย่งความเด่นจากชื่อร้านที่อยู่บรรทัดบน)
     LOCKED = แดงทึบ สงวนน้ำหนักภาพไว้ให้สถานะที่ต้องสะดุดตาจริงเท่านั้น */
  const packageChipClasses = isPackageLocked
    ? 'badge bg-danger text-white'
    : 'badge border border-white/40 text-white/90'

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
          <div className="relative flex-shrink-0" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
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

          {/* ชื่อร้าน — บรรทัดสถิติถูกย้ายออกไปนอกปุ่มแล้ว (ดูบล็อกถัดไป) */}
          <div className="flex-1 min-w-0">
            <p className="text-md font-semibold truncate leading-tight text-white">{shopName}</p>
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

        {/*
         * Row 1b: สถิติ + ชิปแพ็กเกจ — อยู่ "นอก" AccountSwitcherLauncher โดยตั้งใจ
         *
         * เดิมบรรทัดนี้อยู่ในปุ่มสลับบัญชี ซึ่งเป็น <button> ก้อนเดียวครอบ avatar+ชื่อ+สถิติ
         * การเอาชิปที่เป็น <Link> ไปวางข้างในจึงทำไม่ได้ (nested interactive element ผิด HTML
         * และแตะชิปแล้ว event จะ bubble ไปเปิดชีตสลับบัญชีแทนที่จะไป /business)
         * ⇒ ย่อปุ่มให้ครอบแค่ avatar+ชื่อ แล้วยกบรรทัดนี้ออกมาเป็นพี่น้อง
         *
         * spacer ใช้ค่าเดียวกับความกว้าง avatar (AVATAR_SIZE) + gap-3 ของ flex แม่ = เยื้องตรงกับ
         * ชื่อร้านบรรทัดบนพอดี โดยไม่ต้องคิดตัวเลข margin ใหม่ (ถ้าวันหลังเปลี่ยนขนาด avatar
         * บรรทัดนี้ขยับตามเอง — ไม่มีเลขซ้ำสองที่ให้ลืมแก้)
         */}
        <div className="flex items-center gap-3 mt-1">
          <div className="shrink-0" style={{ width: AVATAR_SIZE }} aria-hidden="true" />
          <div className="flex items-center gap-1.5 min-w-0 flex-1 text-white/80 text-2xs">
            {/* กลุ่มสถิติ — ให้กลุ่มนี้โดนตัดก่อนชิปเสมอบนจอแคบ เพราะชิปคือทางเข้า /business
                ทางเดียวบนมือถือ (การ์ดแพ็กเกจฝั่ง sidenav ถูกซ่อนต่ำกว่า 1024px) หายไม่ได้ */}
            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden whitespace-nowrap">
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

            {/* ชิปแพ็กเกจ — ไม่ใช่ OWNER เห็นข้อมูลเหมือนกันแต่กดไม่ได้ (จัดการแพ็กเกจเป็นสิทธิ์
                ระดับบัญชีเจ้าของ) จึง render เป็น <span> ไม่ใช่ <Link> */}
            {packageCanManage ? (
              <Link
                href="/business"
                aria-label={packageAriaLabel}
                className={`${packageChipClasses} shrink-0 inline-flex items-center gap-1 text-2xs`}
              >
                <Icon icon={packageIcon} className="text-2xs" aria-hidden="true" />
                {packageChipLabel}
              </Link>
            ) : (
              <span className={`${packageChipClasses} shrink-0 inline-flex items-center gap-1 text-2xs`}>
                <Icon icon={packageIcon} className="text-2xs" aria-hidden="true" />
                {packageChipLabel}
              </span>
            )}
          </div>
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

        {/* Row 3 (แถบแพ็กเกจเต็มความกว้าง + เส้นคั่น) ถูกตัดออกทั้งหมด 2026-08-04 —
            ย้ายไปเป็นชิปท้ายบรรทัดสถิติใน Row 1b แล้ว (ดูคอมเมนต์ที่นั่น) hero เตี้ยลง ~69px */}
      </div>
    </div>
  )
}
