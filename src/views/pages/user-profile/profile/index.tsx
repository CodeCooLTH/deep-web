'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Next/Auth Imports — S-19 (extension #1 Chat Product Context Card) login-gate ปุ่ม "สอบถามสินค้านี้"
// pattern: src/views/pages/user-profile/UserProfileHeader.tsx handleChatClick (AuctionBidPanel.tsx:114-121)
import { useState } from 'react'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

// ไล่เงาของไทล์ใช้ค่าเดียวกับกริดคลิป — สองที่นี้ทำหน้าที่เดียวกัน (ให้ตัวหนังสือขาวบนรูปอ่านออก)
// แต่เคยตั้งค่าต่างกันเล็กน้อยโดยไม่มีเหตุผล (ux gate 2026-08-09)
import { TILE_SCRIM } from '../v2/ShopVideos'

// อ้าง TierChipColor จาก SSOT ของระบบ tier โดยตรง (เดิมอ้างผ่าน TrustScoreCardData ซึ่งเป็นการ
// อ้อมผ่าน component ที่ถูกลบไปพร้อมโปรไฟล์ชุดเดิม — ชี้ที่ต้นทางตรง ๆ ตรงกว่าและไม่ผูกกับ UI)
import type { TierChipColor } from '@/lib/trust-tier'
import { toFileUrl } from '@/lib/file-url'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/index.tsx
// Redesign (2026-07-04, hybrid FB Page × Threads spec) — เนื้อหา left/right column เดิม
// Desktop layout redesign (IG-style + trust data): ยุบ ProfileLeftContent ทิ้งทั้งหมด — เนื้อหากระจายไปที่
// ProfileStatsBar/BadgePillRow (ใต้ identity bar) + TrustDetailSection (full-bleed band ใต้ product grid) แทน
// ProfileRightContent เหลือแค่ product grid (การ์ดชื่อเสียงข้ามแพลตฟอร์มเดิมไม่กลับมา — ถูกลบทิ้งโดยตั้งใจ 2026-07-22
// impeccable critique P0: ตัวเลข hardcode ของ Shopee/Lazada/TikTok)
// ProductCard คงเดิม (Base: theme .../apps/academy/my-courses/Courses.tsx bordered-card pattern)

// ── Type: สินค้าที่ serialize จาก RSC boundary (Decimal → string) ──
export type SerializedProduct = {
  id: string
  name: string
  /** Decimal serialize แล้วเป็น string ทศนิยม 2 (e.g. "120.00") */
  price: string
  /** images[0] ?? null */
  imageUrl: string | null
  /** จำนวนคำสั่งซื้อที่ยืนยันแล้ว (CONFIRMED) — 0 = ยังไม่มี ซึ่งจะไม่แสดงเลข ไม่ใช่แสดง 0 */
  soldCount: number
  /** `Product.shortDescription` (≤200 ตัวอักษร) — ฟิลด์ที่ฝั่งผู้ขายเขียนกำกับไว้เองว่าเป็น teaser
   *  สำหรับการ์ดสินค้าโดยเฉพาะ ไม่ใช่ `description` ที่ยาวไม่จำกัดและไม่มีหน้าให้กดดูต่อ */
  shortDescription?: string | null
}

export type ProfileTabData = {
  achievements: {
    id: string
    name: string
    nameEN: string
    icon: string
    /** URL รูป badge; null = ใช้ emoji fallback */
    imageUrl?: string | null
  }[]
  /** FR-9.5: true เมื่อบัญชี buyer-only (ไม่มีร้าน) — ซ่อน products + platforms ทั้งชุด */
  openShopEmptyState?: boolean
  // Phase 3 (feature 00013 Pin Products, TFR-PIN-06/07): แทน products เดี่ยว + splitPinnedProducts (interim)
  // ด้วยข้อมูลปักหมุดจริงจาก pin.service — pinnedProducts มาจาก getPinnedProducts, otherProducts มาจาก
  // getProductsByShop({excludePinned:true})
  pinnedProducts: SerializedProduct[]
  otherProducts: SerializedProduct[]
  /** feature 00017 — ร้าน LODGING ใช้ grid เดียวกันแต่เนื้อหาเป็นห้องพัก
   *  optional + default 'PRODUCT' เพื่อไม่กระทบผู้เรียกเดิม (/u/[username]) */
  itemKind?: 'PRODUCT' | 'ROOM'
  totalBadgeCount: number
  // ── About section (ย้ายมาจาก identity เดิมตาม redesign) ──
  bio?: string | null
  location?: string | null
  /** "มิ.ย. 2568" — formatMonthYearTH() ผลลัพธ์ */
  memberSince: string
  // S-25 (extension #2 Response-rate metric): denormalized field จาก Shop (cron รายวัน S-24)
  chatResponseRate?: number | null
  chatMedianResponseSec?: number | null
  chatResponseSampleSize?: number | null
  // ── TrustScoreCard data ──
  trustScore: number
  tierLabel: string
  tierColor: TierChipColor
  nextTierLabel: string | null
  pointsToNext: number | null
  verifiedLevels: number[]
}

// ── ProductCard ──
// Base: theme/vuexy/typescript-version/full-version/src/views/apps/academy/my-courses/Courses.tsx
// (bordered card: <div className='border rounded bs-full'> → image top → content padded → action button ท้ายการ์ด)
// Adapted: แปลง Tailwind utility → MUI sx (ตาม convention ไฟล์นี้เดิม); image aspect 1/1 แทน full-width auto-height
// S-19 (extension #1 Chat Product Context Card): shopId/isOwnShop prop-drill จาก UserProfile → ProfileRightContent → ProductCard
// ตัด ★rating ต่อสินค้าออก (2026-07-04 fix): Product schema ไม่มี rating รายชิ้นจริง — โชว์ shop avgRating ซ้ำทุกใบ = เลขปลอมต่อชิ้น
// ขัด ethos เดียวกับที่ตัดผู้ติดตามทิ้ง แถวราคาจึงเหลือแค่ราคาอย่างเดียว
const ProductCard = ({
  product,
  pinned,
  shopId,
  isOwnShop,
  soldLabel,
  soldUnit,
}: {
  product: SerializedProduct
  pinned: boolean
  shopId: string | null
  isOwnShop?: boolean
  /** "ขายแล้ว" หรือ "เข้าพักแล้ว" — ร้านที่พักใช้กริดเดียวกันแต่คนละคำ */
  soldLabel: string
  soldUnit: string
}) => {
  const price = parseFloat(product.price)
  const priceLabel = `฿${isNaN(price) ? product.price : price.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

  // ค่ารูปที่เก็บใน DB มีสองแบบปนกัน — storage key กับ URL เต็ม ต้องแปลงก่อนใช้เสมอ
  // (แปลงในการ์ดเหมือนที่ PublicRoomList ทำกับรูปห้องพัก ไม่ใช่แปลงที่หน้า จะได้ไม่ต้องไล่แก้ทุกหน้าที่เรียก)
  const imageSrc = toFileUrl(product.imageUrl)

  const [imgFailed, setImgFailed] = useState(false)

  const router = useRouter()
  const { status: sessionStatus } = useSession()

  // FR-CTX-01/02/03: ปุ่ม "สอบถามสินค้านี้" — ซ่อนเมื่อ isOwnShop หรือไม่มีร้าน (shopId null)
  const showAskButton = Boolean(shopId) && !isOwnShop

  const handleAskClick = () => {
    if (!shopId) return
    const target = `/messages/${shopId}?productId=${product.id}`
    if (sessionStatus !== 'authenticated') {
      router.push(`/auth/sign-in?callbackUrl=${encodeURIComponent(target)}`)
      return
    }
    router.push(target)
  }

  // ทั้งไทล์เป็นปุ่มเดียว ไม่ซ้อนปุ่มข้างใน — overlay ตอน hover เป็นแค่ภาพบอกว่ากดแล้วได้อะไร
  // (ปุ่มซ้อนปุ่มทำให้ keyboard/screen reader เจอสองเป้าหมายที่ทำงานเหมือนกัน และ HTML ไม่ให้ทำ)
  const clickable = showAskButton

  return (
    // 🛑 ไม่มี aria-label แล้ว (เดิมมี) — ชื่อ/ราคา/ยอดขาย/คำอธิบาย ตอนนี้เป็น text node ที่มองเห็นจริง
    // ในปุ่มทั้งหมด การใส่ aria-label ทับจะ **บัง** ข้อความเหล่านั้นจาก screen reader ตามสเปก ARIA
    // (คนตาบอดจะไม่ได้ยินคำอธิบายสินค้าเลย ทั้งที่คนตาดีอ่านได้) ปล่อยให้ accessible name คำนวณ
    // จากเนื้อหาจริง แล้วเติมแค่ "สิ่งที่จะเกิดขึ้นเมื่อกด" เป็น sr-only ท้ายปุ่มแทน
    // `title` ก็ถอดด้วย เพราะชื่อสินค้าไม่ได้ซ่อนอยู่แล้ว
    <Box
      component={clickable ? 'button' : 'div'}
      type={clickable ? 'button' : undefined}
      onClick={clickable ? handleAskClick : undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        inlineSize: '100%',
        overflow: 'hidden',
        // ไม่มีขอบ/มุมโค้งแล้ว — ผัง IG เป็นฟีดรูปที่ไทล์ชิดกัน ขอบการ์ดทำให้กลายเป็นแคตตาล็อก
        border: 0,
        padding: 0,
        margin: 0,
        textAlign: 'start',
        // <button> ไม่สืบทอด font จาก body (UA stylesheet ตั้ง Arial ให้ form control ทุกตัว)
        fontFamily: 'inherit',
        bgcolor: 'background.paper',
        cursor: clickable ? 'pointer' : 'default',
        '&:hover .askOverlay': { opacity: 1 },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
      }}
    >
      {/* โซนรูป — ของที่ลอยทับ (ป้ายปักหมุด/ราคา/ยอดขาย/overlay ตอน hover) ต้องอยู่ในกล่องนี้เท่านั้น
          ถ้าปล่อยให้ overlay ครอบทั้งปุ่มเหมือนเดิม มันจะทับชื่อ+คำอธิบายที่เพิ่งเพิ่มเข้ามาตอน hover
          = ปิดบังสิ่งที่เพิ่งทำให้อ่านง่ายขึ้นพอดี */}
      {/* 3:4 เท่าไทล์คลิปในแท็บปักหมุด — วัดจากไทล์จริงที่ user แคปมาจาก IG (233×310 ≈ 0.75)
          ⚠️ ผลข้างเคียงที่รู้ตัว: object-cover จะครอบหัว-ท้ายรูปสินค้าทิ้ง สินค้าที่ถ่ายเป็น
          กล่อง/แนวนอนจะเสียหนักกว่ารูปแนวตั้ง — แลกกับความสม่ำเสมอของสองแท็บตามที่สั่ง */}
      <Box sx={{ position: 'relative', aspectRatio: '3/4', inlineSize: '100%', overflow: 'hidden', bgcolor: 'background.default' }}>
      {imageSrc && !imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt=''
          loading='lazy'
          decoding='async'
          // จุดเดียวในหน้านี้ที่เคยไม่มี onError เลย ทั้งที่อีก 3 จุด (ปกร้าน/อวตาร/ไทล์คลิป) มีครบ —
          // รูปที่เก็บใน DB มีอยู่จริงแต่โหลดไม่ขึ้น (ไฟล์หาย/สิทธิ์เปลี่ยน) จะได้ไอคอนรูปแตกของ
          // เบราว์เซอร์ดิบ ๆ ซึ่งเป็นสิ่งเดียวในหน้าที่อ่านว่า "เว็บพัง" ไม่ใช่ "ร้านไม่มีรูป"
          onError={() => setImgFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        // ไม่ต้องตีเส้นในตัวเองแล้ว (เดิมมี inset ring) — การ์ดมีขอบล้อมรอบอยู่แล้ว ไทล์ที่ไม่มีรูป
        // จึงอ่านเป็น "สินค้าที่ยังไม่ใส่รูป" ไม่ใช่ "แผ่นเทาผืนเดียวที่แยกไม่ออกว่ามีกี่ชิ้น"
        // ซึ่งเป็นปัญหาเฉพาะของกริดชิดขอบแบบเดิม
        <Box
          sx={{
            inlineSize: '100%',
            blockSize: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#808390',
          }}
        >
          <Icon icon='tabler-photo' fontSize={30} />
        </Box>
      )}

      {/* ไล่เงาล่าง — ให้ราคาสีขาวอ่านออกไม่ว่ารูปสินค้าจะสว่างแค่ไหน
          ใช้ค่าเดียวกับไทล์คลิปจริง ๆ แล้ว (เดิมเขียนว่า "แบบเดียวกับไทล์คลิป" แต่ค่าต่างกันจริง:
          .26/30%/55% ที่นี่ กับ .28/32%/52% ที่โน่น) */}
      <Box sx={{ position: 'absolute', inset: 0, background: TILE_SCRIM, pointerEvents: 'none' }} />

      {pinned && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            insetInlineStart: 8,
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            fontSize: '10px',
            fontWeight: 700,
            borderRadius: '999px',
            px: '8px',
            py: '3px',
          }}
        >
          <Icon icon='tabler-pin-filled' fontSize={11} />
          ปักหมุด
        </Box>
      )}

      {/* ราคา + ยอดขายลอยบนรูป — สองอย่างที่ผู้ซื้อต้องเห็นก่อนตัดสินใจกด ชื่อสินค้าอยู่ใน title/aria-label
          ยอดขายนับเฉพาะออเดอร์ที่ผู้ซื้อยืนยันรับของแล้ว (ดู getConfirmedOrderCountByProduct)
          ยังไม่มียอด = ไม่แสดงอะไรเลย ไม่ใช่แสดง 0 — กติกาเดียวกับตัวเลขอื่นทั้งหน้า เพราะ
          "ขายแล้ว 0" อ่านแล้วแย่กว่าไม่บอก ทั้งที่สินค้าเพิ่งลงก็เป็น 0 เหมือนกัน */}
      <Box
        sx={{
          position: 'absolute',
          insetBlockEnd: 0,
          insetInlineStart: 0,
          insetInlineEnd: 0,
          p: '8px 10px',
          color: 'white',
          textAlign: 'start',
          pointerEvents: 'none',
        }}
      >
        {/* ชื่อ + คำอธิบาย ย้ายขึ้นมาทับบนรูป (user 2026-08-10) — อยู่เหนือราคาเพราะ
            "นี่คืออะไร" ต้องอ่านก่อน "เท่าไหร่"
            อ่านออกได้เพราะมีสกริมไล่เงาด้านล่างรองอยู่ (TILE_SCRIM) ตัวเดียวกับไทล์คลิป */}
        <Box
          component='span'
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: '13px',
            fontWeight: 600,
            lineHeight: 1.3,
          }}
        >
          {product.name}
        </Box>
        {product.shortDescription && (
          <Box
            component='span'
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              fontSize: '11px',
              opacity: 0.85,
              mt: '1px',
            }}
          >
            {product.shortDescription}
          </Box>
        )}
        <Box component='span' sx={{ display: 'block', fontSize: '15px', fontWeight: 800, mt: '2px' }}>
          {priceLabel}
        </Box>
        {product.soldCount > 0 && (
          <Box
            component='span'
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              mt: '1px',
              fontSize: '11px',
              fontWeight: 600,
              opacity: 0.92,
            }}
          >
            <Icon icon='tabler-shopping-bag-check' fontSize={12} />
            {`${soldLabel} ${product.soldCount.toLocaleString('th-TH')} ${soldUnit}`}
          </Box>
        )}
      </Box>

      {/* โผล่ตอน hover เท่านั้น (user ขอ 2026-07-26) — จำกัดด้วย hover:hover เพราะบนจอสัมผัส
          สถานะ hover จะค้างหลังแตะ กลายเป็นแผ่นดำทับรูปที่ปิดไม่ได้ */}
      {clickable && (
        <Box
          className='askOverlay'
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgb(0 0 0/.42)',
            opacity: 0,
            transition: 'opacity .16s ease',
            pointerEvents: 'none',
            '@media (hover: hover)': { display: 'flex' },
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              bgcolor: 'white',
              color: '#2F2B3D',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '999px',
              px: '14px',
              py: '7px',
            }}
          >
            <Icon icon='tabler-message-circle' fontSize={14} />
            สอบถามสินค้านี้
          </Box>
        </Box>
      )}
      </Box>

      {/* ข้อความทั้งหมดย้ายขึ้นไปทับบนรูปแล้ว (user 2026-08-10 สั่งให้เหมือนแท็บปักหมุด)
          เหลือแค่ป้ายบอก screen reader ว่ากดแล้วเกิดอะไร — ข้อมูลสินค้าอ่านจาก text บนรูปได้อยู่แล้ว */}
      {clickable && (
        <Box component='span' className='sr-only'>
          สอบถามสินค้านี้
        </Box>
      )}
    </Box>
  )
}

// ── ProfileRightContent — Pinned products + All products (product grid เท่านั้น) ──
// ทำไม: แยกออกมาเพื่อให้ index.tsx เรียกใช้ได้ตรง ๆ
// Desktop layout redesign: การ์ดชื่อเสียงข้ามแพลตฟอร์มเดิม ไม่กลับมา (ถูกลบทิ้งโดยตั้งใจ)
// (ProfileLeftContent เดิม/medal-frame achievements ก็ยุบทิ้งไปพร้อมกัน — ดู ProfileStatsBar/BadgePillRow/TrustDetailSection)
// S-19 (extension #1 Chat Product Context Card): shopId/isOwnShop รับแยกจาก data (มาจาก ProfileHeaderData
// ไม่ใช่ ProfileTabData) prop-drill ต่อไปให้ ProductCard ตาม UX spec data-plumbing
export const ProfileRightContent = ({
  data,
  shopId,
  isOwnShop,
}: {
  data: Pick<ProfileTabData, 'pinnedProducts' | 'otherProducts' | 'openShopEmptyState' | 'itemKind'>
  shopId?: string | null
  isOwnShop?: boolean
}) => {
  const { pinnedProducts, otherProducts, openShopEmptyState, itemKind = 'PRODUCT' } = data
  const hasAnyProduct = pinnedProducts.length > 0 || otherProducts.length > 0
  // ร้านบ้านพักใช้ grid เดียวกับสินค้า (ความสม่ำเสมอของหน้าสำคัญกว่าการมี layout เฉพาะ)
  // เปลี่ยนเฉพาะถ้อยคำให้ตรงกับสิ่งที่ผู้ใช้เห็นจริง
  const isRoom = itemKind === 'ROOM'
  // 🛑 `soldUnit` เคยเป็น "คำสั่งซื้อ" ขณะที่หัวหน้าร้านเรียกของอย่างเดียวกันว่า "ออเดอร์"
  // (`STAT_LABELS.general.orders` ใน ProfileHero) — คำต่างกันสองคำบนหน้าเดียวสำหรับของสิ่งเดียวกัน
  // ไม่มี tsc/detector ตัวไหนจับได้เพราะเป็นสตริงที่ถูกทั้งคู่
  const L = isRoom
    ? { empty: 'ร้านนี้ยังไม่มีห้องพัก', emptyHint: 'ทักแชทสอบถามร้านได้เลย', pinned: 'ห้องพักแนะนำ', all: 'ห้องพักทั้งหมด', sold: 'เข้าพักแล้ว', soldUnit: 'ครั้ง' }
    : { empty: 'ร้านนี้ยังไม่มีสินค้า', emptyHint: 'ทักแชทสอบถามร้านได้เลย', pinned: 'สินค้าปักหมุด', all: 'สินค้าทั้งหมด', sold: 'ขายแล้ว', soldUnit: 'ออเดอร์' }

  if (openShopEmptyState) return null

  return (
    <>
      {!hasAnyProduct ? (
        <Box id='pinned-products' sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', py: '48px', textAlign: 'center' }}>
          <Icon icon='tabler-photo-off' style={{ fontSize: 48, color: '#808390' }} />
          <Box>
            {/* 🛑 เดิมเขียนว่า "ติดตามร้านนี้ไว้ก่อนนะ" — ชวนให้ทำสิ่งที่ **หน้านี้ทำไม่ได้**
                ปุ่มติดตามมีอยู่เฉพาะใน UserProfileHeader.tsx (และยัง disabled "เร็ว ๆ นี้") ซึ่ง
                หน้าโปรไฟล์สาธารณะไม่ได้ใช้เลย → คนอ่านจะมองหาปุ่มที่ไม่มีอยู่จริง
                เปลี่ยนเป็นทางที่มีจริงบนหน้านี้: ปุ่ม "แชทกับร้าน" ใน ProfileHero */}
            <Typography sx={{ color: '#808390', fontSize: '15px' }}>{L.empty}</Typography>
            <Typography sx={{ color: '#808390', fontSize: '13px', mt: '4px' }}>{L.emptyHint}</Typography>
          </Box>
        </Box>
      ) : (
        <>
          {/* ── สินค้าปักหมุด (Phase 3: pinnedProducts จริงจาก getPinnedProducts — ซ่อนทั้งโซนเมื่อว่าง TFR-PIN-07) ── */}
          {pinnedProducts.length > 0 && (
            <Box id='pinned-products' sx={{ pt: '18px', pb: '16px' }}>
              <Typography
                component='h3'
                sx={{ m: 0, mb: '10px', fontSize: '13px', fontWeight: 600, color: '#2F2B3D' }}
              >
                {L.pinned}
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  // ผังเดียวกับแท็บปักหมุด (user 2026-07-26 "เน้นรูป เหมือน IG") — ชิดกันไม่มีช่องว่าง
                  //
                  // เพิ่มขั้น sm (600px) 2026-08-09: เดิมกระโดด 3 → 5 ที่ 900px ทีเดียว ช่วง
                  // 600–899px (แท็บเล็ตแนวตั้ง/มือถือแนวนอน) จึงได้ไทล์กว้างเกือบ 200px แถวละ 3 ใบ
                  // ขณะที่กริดคลิปในหน้าเดียวกันเปลี่ยนคนละจังหวะ — สองแผงที่ตั้งใจให้เป็นผังเดียวกัน
                  // แต่ไม่เคยตรงกันจริงสักช่วง (คอมเมนต์ทั้งสองไฟล์เขียนว่า "ผังเดียวกัน" มาตลอด)
                  //
                  // -20px = หัก pli-5 ของ tab panel ให้ชนขอบคอนเทนเนอร์ (ค่าเดียวกับ -mli-5 ที่
                  // กริดคลิปใช้) panel padding คงที่ทุก breakpoint จึงไม่ต้องไล่ตาม breakpoint
                  // ผัง Instagram: 3 คอลัมน์ทุกจอ ช่องไฟ 4px (user ชี้ ref instagram.com/sanook.com
                  // 2026-08-10 "อยากให้ style ของการแสดงผลเป็นแบบ IG · ขนาดเอาตาม ig เลยก็ได้")
                  // เดิม 2/3/4 + gap 16px + การ์ดมีขอบ อ่านเป็น "แคตตาล็อกการ์ด" ไม่ใช่ฟีดรูป
                  // 3 คอลัมน์เฉพาะมือถือ — เดสก์ท็อป 960px หาร 3 ได้ไทล์ 317px ซึ่งใหญ่เกินไป
                  // (ปัญหาเดียวกับกริดคลิป user ทัก 2026-08-10 "grid ใหญ่ไปป่าว")
                  gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', md: 'repeat(5, 1fr)' },
                  gap: '4px',
                }}
              >
                {pinnedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    pinned
                    shopId={shopId ?? null}
                    isOwnShop={isOwnShop}
                    soldLabel={L.sold}
                    soldUnit={L.soldUnit}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* ── สินค้าทั้งหมด (Phase 3: otherProducts = getProductsByShop excludePinned — ซ่อนเมื่อว่าง) ── */}
          {otherProducts.length > 0 && (
            <Box id='all-products' sx={{ pb: '16px' }}>
              <Typography
                component='h3'
                sx={{ m: 0, mb: '10px', fontSize: '13px', fontWeight: 600, color: '#2F2B3D' }}
              >
                {L.all}
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  // ผังเดียวกับแท็บปักหมุด (user 2026-07-26 "เน้นรูป เหมือน IG") — ชิดกันไม่มีช่องว่าง
                  //
                  // เพิ่มขั้น sm (600px) 2026-08-09: เดิมกระโดด 3 → 5 ที่ 900px ทีเดียว ช่วง
                  // 600–899px (แท็บเล็ตแนวตั้ง/มือถือแนวนอน) จึงได้ไทล์กว้างเกือบ 200px แถวละ 3 ใบ
                  // ขณะที่กริดคลิปในหน้าเดียวกันเปลี่ยนคนละจังหวะ — สองแผงที่ตั้งใจให้เป็นผังเดียวกัน
                  // แต่ไม่เคยตรงกันจริงสักช่วง (คอมเมนต์ทั้งสองไฟล์เขียนว่า "ผังเดียวกัน" มาตลอด)
                  //
                  // -20px = หัก pli-5 ของ tab panel ให้ชนขอบคอนเทนเนอร์ (ค่าเดียวกับ -mli-5 ที่
                  // กริดคลิปใช้) panel padding คงที่ทุก breakpoint จึงไม่ต้องไล่ตาม breakpoint
                  // ผัง Instagram: 3 คอลัมน์ทุกจอ ช่องไฟ 4px (user ชี้ ref instagram.com/sanook.com
                  // 2026-08-10 "อยากให้ style ของการแสดงผลเป็นแบบ IG · ขนาดเอาตาม ig เลยก็ได้")
                  // เดิม 2/3/4 + gap 16px + การ์ดมีขอบ อ่านเป็น "แคตตาล็อกการ์ด" ไม่ใช่ฟีดรูป
                  // 3 คอลัมน์เฉพาะมือถือ — เดสก์ท็อป 960px หาร 3 ได้ไทล์ 317px ซึ่งใหญ่เกินไป
                  // (ปัญหาเดียวกับกริดคลิป user ทัก 2026-08-10 "grid ใหญ่ไปป่าว")
                  gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', md: 'repeat(5, 1fr)' },
                  gap: '4px',
                }}
              >
                {otherProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    pinned={false}
                    shopId={shopId ?? null}
                    isOwnShop={isOwnShop}
                    soldLabel={L.sold}
                    soldUnit={L.soldUnit}
                  />
                ))}
              </Box>
            </Box>
          )}
        </>
      )}
    </>
  )
}

export default ProfileRightContent
