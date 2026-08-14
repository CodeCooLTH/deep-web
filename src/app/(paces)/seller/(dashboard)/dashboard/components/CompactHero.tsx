/**
 * CompactHero — hero header สำหรับ Seller Command Center v10 (compact, full-bleed)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/UserCard.tsx
 * ปุ่ม pattern: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx
 *
 * layout: 2 แถวบนพื้นหลัง SVG ลำแสง xenon โทน Paces น้ำเงิน
 *   Row 1: avatar+trust ring + [ชื่อร้าน / สถิติ+ชิปแพ็กเกจ] + bell
 *   Row 2: wallet + ปุ่มเติมเงิน + divider + ShopLinkButtons
 *
 * 2026-08-04: แถวแพ็กเกจเต็มความกว้าง (Row 3 เดิม) ถูกตัดออกตามคำสั่ง user ย่อเป็นชิปท้ายบรรทัด
 * สถิติแทน — hero เตี้ยลง ~69px; logic สถานะ+copy ยังอิง `_shared/ShopPackageSidenavCard.tsx`
 *
 * สำคัญ: ชื่อร้าน/สถิติ/ชิป ต้องอยู่ในคอลัมน์เดียวกันเสมอ ไม่งั้นชื่อจะลอยกลางวง avatar 58px แล้วสถิติ
 * ตกไปอยู่ใต้วงกลายเป็นคนละก้อน (ลองแยกมาแล้วรอบหนึ่ง user บอกว่า "เพี้ยน" — ถูกต้อง)
 * ⇒ ชิปอยู่ใน <button> ของ AccountSwitcherLauncher จึงเป็น <Link> ไม่ได้ (nested interactive)
 *   เป็นป้ายอย่างเดียว; ทางเข้าหน้าแพ็กเกจบนมือถือ = เมนู "แพ็กเกจของฉัน" ใน sidebar
 *
 * S-1 (mobile account switcher): avatar-block + name-block ครอบด้วย AccountSwitcherLauncher
 * (client, อ่าน session เอง) — เปิด bottom sheet สลับบัญชีเมื่อมี business membership;
 * bell อยู่นอก launcher (ไม่ใช่ trigger สลับบัญชี)
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
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'

export interface CompactHeroProps {
  shopName: string
  avatarUrl: string | null
  trustScore: number    // 0–100 → ring fill % + chip
  walletBalance: number
  shopSlug: string | null
  orderCount: number
  /**
   * ชื่อของสิ่งที่ orderCount นับ ผันตาม vertical (ORDER_VOCAB.noun) — default = ชุด ONLINE_SALES
   *
   * ใช้ noun เต็มไม่ใช่ nounShort ทั้งที่ช่องแคบ: คำอยู่ **หลังตัวเลข** ("1 บริการ") ซึ่งอ่านเป็น
   * "บริการ 1 อย่าง" ไม่ใช่ "งาน 1 ใบ" — กลุ่มสถิตินี้มี truncate รองรับคำยาวอยู่แล้ว
   */
  orderNoun?: string
  reviewCount: number
  avgRating: number     // 0–5
  notiCount?: number
  // Row 3 — แถบแพ็กเกจร้านค้า (ตั้งชื่อ packageStatus/packageTier ไม่ใช่ tier/tierLabel
  // เพื่อไม่ชนกับ tierName ที่แปลว่า trust tier ใน CommandCenterData — คนละเรื่องกัน)
  packageStatus: BusinessPackageStatusApp
  packageTier: BusinessPackageTier | null
  /**
   * เปิดจากในแอป iOS → ซ่อนปุ่มเติมเงิน (App Store Guideline 3.1.1 — rejection 2026-08-04)
   *
   * 🛑 ซ่อนแค่ "ปุ่ม" — ตัวเลขยอดคงเหลือยังแสดงตามปกติ (user เคาะ 2026-08-10) เพราะเป็น
   * สถานะบัญชี ไม่ใช่ช่องทางจ่าย และผู้ขายต้องเห็นเพื่อรู้ว่าเครดิตส่ง SMS ใกล้หมดหรือยัง
   */
  hidePayments?: boolean
  /* หมายเหตุ: prop `packageCanManage` ถูกถอดออก 2026-08-04 — ชิปแพ็กเกจกลายเป็นป้ายอย่างเดียว
     (อยู่ในปุ่มสลับบัญชี จึงเป็นลิงก์ไม่ได้) สิทธิ์กด "จัดการ" จึงไม่มีความหมายที่นี่อีก
     ทางเข้าหน้าแพ็กเกจบนมือถือ = เมนู "แพ็กเกจของฉัน" ใน sidebar */
}

export default function CompactHero({
  shopName,
  avatarUrl,
  trustScore,
  walletBalance,
  shopSlug,
  orderCount,
  orderNoun,
  reviewCount,
  avgRating,
  notiCount = 0,
  packageStatus,
  packageTier,
  hidePayments = false,
}: CompactHeroProps) {
  const t = useT()
  // คำนามผันตามประเภทร้าน — ผู้เรียกส่งคำที่แปลแล้วมา; ไม่ส่ง = ถอยไปคำของร้านขายออนไลน์
  const noun = orderNoun || t.vocab.orderNoun.ONLINE_SALES
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
  const packageAriaLabel = fmt(t.dashboard.heroPackageAria, {
    tier: packageTierLabel,
    state: isPackageLocked ? ` ${t.dashboard.heroPackageLocked}` : '',
  })
  const packageIcon = isPackageLocked ? 'tabler:alert-triangle' : 'tabler:crown'
  const packageChipLabel = isPackageLocked ? t.dashboard.heroPackageLocked : packageTierLabel
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

          {/*
           * ชื่อร้าน + สถิติ + ชิป — ต้องอยู่ในคอลัมน์เดียวกันเสมอ เพื่อให้ทั้งก้อนจัดกึ่งกลาง
           * เทียบกับวง avatar 58px
           * (รอบแรกผมยกบรรทัดสถิติออกไปเป็นแถวใหม่ใต้ avatar เพื่อเลี่ยงปัญหาปุ่มซ้อนปุ่ม ผลคือ
           *  ชื่อร้านลอยกลางวง avatar แล้วสถิติไปอยู่ใต้วงอีกที กลายเป็นคนละก้อน — user เห็นแล้วบอกว่า
           *  "เพี้ยน" 2026-08-04 ถูกต้อง)
           *
           * ⇒ ชิปกลับเข้ามาอยู่ในปุ่มสลับบัญชี จึงเป็น <Link> ไม่ได้ (nested interactive) — เป็น
           *   ป้ายอย่างเดียว ตรงกับที่ user สั่งว่า "เป็น label [Business] ไรงี้"
           *   ทางเข้าหน้าแพ็กเกจบนมือถือย้ายไปใช้เมนู "แพ็กเกจของฉัน" ที่มีอยู่แล้วใน sidebar
           */}
          <div className="flex-1 min-w-0">
            {/* ชื่อร้านต้องเด่นที่สุดในแถบนี้ — text-lg/bold ให้ห่างจากตัวเลขสถิติที่อยู่ใต้มันชัดเจน
                (เดิม text-md/semibold ซึ่งน้ำหนักใกล้เคียงตัวเลขสถิติที่เป็น bold จนแยกไม่ออกว่าอะไรสำคัญกว่า) */}
            <p className="text-lg font-bold truncate leading-tight text-white">{shopName}</p>

            <div className="flex items-center gap-1.5 mt-1 text-white/80 text-2xs">
              {/* กลุ่มสถิติยอมให้ถูกตัดก่อนชิปบนจอแคบ — ชิปบอกระดับแพ็กเกจซึ่งหายไม่ได้ */}
              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden whitespace-nowrap">
                <span>
                  <strong className="text-white font-semibold">{orderCount.toLocaleString('th-TH')}</strong>{' '}
                  {noun}
                </span>
                <span className="opacity-50">·</span>
                <span>
                  <strong className="text-white font-semibold">{reviewCount.toLocaleString('th-TH')}</strong>{' '}
                  {t.dashboard.heroReviews}
                </span>
                <span className="opacity-50">·</span>
                <span className="inline-flex items-center gap-0.5">
                  {/* Solar star icon สีทอง — HR7 arbitrary: #ffd24d (gold) Paces ไม่มี token สีทอง star (text-warning เป็นส้ม ไม่ตรง) */}
                  <Icon icon="solar:star-bold-duotone" className="text-sm" style={{ color: '#ffd24d' /* HR7 arbitrary: gold */ }} />
                  <strong className="text-white font-semibold">{avgRating.toFixed(1)}</strong>
                </span>
              </div>

              <span
                className={`${packageChipClasses} shrink-0 inline-flex items-center gap-1 text-2xs`}
                aria-label={packageAriaLabel}
              >
                <Icon icon={packageIcon} className="text-2xs" aria-hidden="true" />
                {packageChipLabel}
              </span>
            </div>
          </div>

          </AccountSwitcherLauncher>

          {/* Bell — ใช้ next/link ตรง (RSC ห้าม component={Link}) */}
          <Link
            href="/notifications"
            aria-label={t.dashboard.heroNotifications}
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
           *
           * 🛑 ไม่ render เลยในแอป iOS — ห้ามแทนด้วยปุ่ม disabled หรือข้อความบอกให้ไปเติมที่เว็บ
           * Apple ถือว่าการชี้ทางไปจ่ายเงินข้างนอกผิดข้อเดียวกับการมีช่องทางจ่ายในแอป
           */}
          {!hidePayments && (
            <Link
              href="/wallet"
              className="btn btn-sm bg-white text-primary rounded-full font-bold text-xs flex-shrink-0 inline-flex items-center gap-1"
            >
              <Icon icon="solar:add-circle-bold-duotone" className="text-base" />
              {t.dashboard.heroTopUp}
            </Link>
          )}

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
