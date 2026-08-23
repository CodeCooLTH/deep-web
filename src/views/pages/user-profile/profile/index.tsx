'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

import ProductLikeButton from '../v2/ProductLikeButton'
import ProductLightbox from '../v2/ProductLightbox'
import { useLightboxDeepLink } from '../v2/useLightboxDeepLink'

// Next/Auth Imports — S-19 (extension #1 Chat Product Context Card) login-gate ปุ่ม "สอบถามสินค้านี้"
// pattern: src/views/pages/user-profile/UserProfileHeader.tsx handleChatClick (AuctionBidPanel.tsx:114-121)
import { useEffect, useState } from 'react'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

// ไล่เงาของไทล์ใช้ค่าเดียวกับกริดคลิป — สองที่นี้ทำหน้าที่เดียวกัน (ให้ตัวหนังสือขาวบนรูปอ่านออก)
// แต่เคยตั้งค่าต่างกันเล็กน้อยโดยไม่มีเหตุผล (ux gate 2026-08-09)

// อ้าง TierChipColor จาก SSOT ของระบบ tier โดยตรง (เดิมอ้างผ่าน TrustScoreCardData ซึ่งเป็นการ
// อ้อมผ่าน component ที่ถูกลบไปพร้อมโปรไฟล์ชุดเดิม — ชี้ที่ต้นทางตรง ๆ ตรงกว่าและไม่ผูกกับ UI)
import type { TierChipColor } from '@/lib/trust-tier'
import {
  PROFILE_SORT_CHIPS,
  nextSortMode,
  sortProfileProducts,
  type ProfileSortMode,
} from '@/lib/profile-sort'
import { profileSoldLine } from '@/lib/shop-stat-vocab'

import { toFileUrl } from '@/lib/file-url'

/**
 * ป้ายบนชิปเรียงลำดับ (feature 00053) — คำเดียวสั้น ๆ เพราะแถบนี้อยู่เหนือกริดบนมือถือด้วย
 * "ขายดี" ใช้ยอดที่ยืนยันแล้ว (getConfirmedOrderCountByProduct) ไม่ใช่เกณฑ์หลังร้านที่นับ
 * ทุกสถานะยกเว้นยกเลิก — หน้าสาธารณะต้องเข้มกว่าเสมอ (ร้านปั่นยอดโชว์ผู้ซื้อได้)
 */
const SORT_CHIP_LABEL: Record<(typeof PROFILE_SORT_CHIPS)[number], string> = {
  BEST_SELLING: 'ขายดี',
  POPULAR: 'ยอดนิยม',
}


// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/index.tsx
// Redesign (2026-07-04, hybrid FB Page × Threads spec) — เนื้อหา left/right column เดิม
// Desktop layout redesign (IG-style + trust data): ยุบ ProfileLeftContent ทิ้งทั้งหมด — เนื้อหากระจายไปที่
// ProfileStatsBar/BadgePillRow (ใต้ identity bar) + TrustDetailSection (full-bleed band ใต้ product grid) แทน
// ProfileRightContent เหลือแค่ product grid (การ์ดชื่อเสียงข้ามแพลตฟอร์มเดิมไม่กลับมา — ถูกลบทิ้งโดยตั้งใจ 2026-07-22
// impeccable critique P0: ตัวเลข hardcode ของ Shopee/Lazada/TikTok)
// ProductCard คงเดิม (Base: theme .../apps/academy/my-courses/Courses.tsx bordered-card pattern)

/**
 * เพดานจำนวนรูปที่ส่งข้าม RSC boundary ต่อสินค้าหนึ่งชิ้น
 *
 * 🛑 อยู่ที่นี่ที่เดียว เพราะทั้ง `/u/[username]` และ `/b/[slug]` ต้อง cap เท่ากัน — สองหน้านี้มี
 * ประวัติเดินแยกกันทีละนิดจนต่างกันจริงมาแล้ว (เหตุผลที่ `ShopProfile` ถูกสร้างขึ้นตั้งแต่แรก)
 *
 * ทำไมต้อง cap: `Product.images` **ไม่มี `maxLength` ใน `validations.ts` เลย** (ต่างจาก
 * `Room.images` และรูปรีวิวที่ cap 4) ⇒ payload ของกริดบวมตามจำนวนรูปของทุกสินค้ารวมกัน
 * ทั้งที่ผู้ชมเปิดดูเต็ม ๆ ทีละใบ · เพดานตอน **อัปโหลด** เป็น business rule ที่ยังไม่ตัดสิน
 * (ต้องผ่าน safepay-product) อันนี้เป็นเพดานฝั่งแสดงผลล้วน
 */
export const MAX_PRODUCT_LIGHTBOX_IMAGES = 10

// ── Type: สินค้าที่ serialize จาก RSC boundary (Decimal → string) ──
export type SerializedProduct = {
  id: string
  name: string
  /** Decimal serialize แล้วเป็น string ทศนิยม 2 (e.g. "120.00") */
  price: string
  /** images[0] ?? null — คง field นี้ไว้และ derive จาก `images` เสมอ ไม่ให้สองค่าเดินแยกกัน */
  imageUrl: string | null
  /**
   * รูปทั้งหมดของสินค้า (สูงสุด 10 ใบ) — ใช้เป็น carousel ใน lightbox
   *
   * 🛑 **cap ที่ 10 ตอน serialize** เพราะ `Product.images` ไม่มี `maxLength` ใน `validations.ts`
   * เลย (ต่างจาก `Room.images` และรูปรีวิวที่ cap 4) ⇒ ถ้าไม่ตัด payload ของกริดจะบวมตาม
   * จำนวนรูปของ **ทุกสินค้ารวมกัน** ทั้งที่ผู้ชมเปิดดูเต็ม ๆ ทีละใบ
   * เลือก cap แทน lazy-fetch เพราะ lazy ต้องมี endpoint + skeleton + prefetch กันกระพริบตอนกด ‹ › รัว
   */
  images: string[]
  /** จำนวนคำสั่งซื้อที่ยืนยันแล้ว (CONFIRMED) — 0 = ยังไม่มี ซึ่งจะไม่แสดงเลข ไม่ใช่แสดง 0 */
  soldCount: number
  /** ยอดถูกใจ (CR 2026-08-11) — 0 = ไม่แสดงตัวเลข แสดงแค่ปุ่ม (BR-LIKE-06) */
  likeCount?: number
  /** อุปกรณ์นี้เคยกดถูกใจไว้ไหม — ใช้ให้หัวใจขึ้นทึบตั้งแต่ render แรก */
  likedByMe?: boolean
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
  soldLine,
  showPrices,
  onOpen,
  like,
  onLikeChange,
}: {
  product: SerializedProduct
  pinned: boolean
  shopId: string | null
  isOwnShop?: boolean
  /**
   * ประโยคยอดสะสมทั้งบรรทัด ("ขายแล้ว 12 ชิ้น" / "ใช้บริการแล้ว 3 ครั้ง" / "เข้าพักแล้ว 8 ครั้ง")
   * — รับมาเป็นประโยคสำเร็จ ไม่ใช่ verb+unit ให้ต่อเอง เพราะลักษณนามผูกกับกริยาไม่ตายตัว
   * (feature 00053 · SSOT = `profileSoldLine` ใน src/lib/shop-stat-vocab.ts)
   */
  soldLine: (formattedCount: string) => string
  /** feature 00053 — ร้านนี้เปิดให้แสดงราคาบนหน้าร้านไหม */
  showPrices: boolean
  /** เปิด lightbox — `undefined` = ห้องพัก ซึ่งยังใช้พฤติกรรมเดิม (ไทล์ทั้งใบ = ปุ่มทักแชท) */
  onOpen?: () => void
  like: { liked: boolean; count: number }
  onLikeChange: (next: { liked: boolean; count: number }) => void
}) => {
  const price = parseFloat(product.price)
  const priceLabel = `฿${isNaN(price) ? product.price : price.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  // feature 00053 — ร้านที่ปิดสวิตช์ราคาไม่พิมพ์บรรทัดนี้เลย และ **ไม่มีข้อความใดมาแทน**
  // (ผู้ใช้เคาะ 2026-08-23) บรรทัดยอดสะสมด้านล่างยังอยู่เสมอ ไม่ผูกกับสวิตช์นี้
  const showSold = product.soldCount > 0

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

  /**
   * ทั้งไทล์เป็นปุ่มเดียว ไม่ซ้อนปุ่มข้างใน — overlay ตอน hover เป็นแค่ภาพบอกว่ากดแล้วได้อะไร
   * (ปุ่มซ้อนปุ่มทำให้ keyboard/screen reader เจอสองเป้าหมายที่ทำงานเหมือนกัน และ HTML ไม่ให้ทำ)
   *
   * 🛑 **สินค้า = เปิด lightbox · ห้องพัก = ทักแชทเหมือนเดิม** ห้องพักไม่เข้ารอบ lightbox เพราะ
   * มันไม่มีของที่แผงขวาต้องใช้เลย (`shortDescription`/ยอดถูกใจไม่มีในโมเดลห้องพัก) และมีหน้า
   * ของตัวเองอยู่แล้วในแท็บ "ห้องพัก" — เปิด lightbox ให้ก็ได้แผงเปล่า
   *
   * 🛑 ทางเข้า "ทักแชท" ที่เคยเป็นไทล์ทั้งใบ **ไม่ได้หายไป** มันย้ายไปเป็น CTA ในแผงของ lightbox
   * (คลาสเดียวกับ `docs/conventions/seller-action-placement.md` §5.1 — เปลี่ยนสิ่งที่ปุ่มทำ
   *  แล้วไม่หาที่ใหม่ให้ของเดิม = ฟีเจอร์เดิมหายเงียบ)
   */
  const clickable = onOpen ? true : showAskButton
  const handleTileClick = onOpen ?? (showAskButton ? handleAskClick : undefined)

  return (
    // 🛑 ไม่มี aria-label แล้ว (เดิมมี) — ชื่อ/ราคา/ยอดขาย/คำอธิบาย ตอนนี้เป็น text node ที่มองเห็นจริง
    // ในปุ่มทั้งหมด การใส่ aria-label ทับจะ **บัง** ข้อความเหล่านั้นจาก screen reader ตามสเปก ARIA
    // (คนตาบอดจะไม่ได้ยินคำอธิบายสินค้าเลย ทั้งที่คนตาดีอ่านได้) ปล่อยให้ accessible name คำนวณ
    // จากเนื้อหาจริง แล้วเติมแค่ "สิ่งที่จะเกิดขึ้นเมื่อกด" เป็น sr-only ท้ายปุ่มแทน
    // `title` ก็ถอดด้วย เพราะชื่อสินค้าไม่ได้ซ่อนอยู่แล้ว
    <Box
      component={clickable ? 'button' : 'div'}
      type={clickable ? 'button' : undefined}
      onClick={handleTileClick}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        inlineSize: '100%',
        blockSize: '100%',
        overflow: 'hidden',
        /* เดิมเป็น `border: 0` เพื่อล้างขอบของ <button> ที่ UA ใส่มา — ตอนนี้การ์ดมีขอบจริง
           ตาม `.product` แล้ว จึงไม่ต้องล้าง (ประกาศ border ซ้ำสองครั้ง tsc จะแดง) */
        padding: 0,
        margin: 0,
        textAlign: 'start',
        // <button> ไม่สืบทอด font จาก body (UA stylesheet ตั้ง Arial ให้ form control ทุกตัว)
        fontFamily: 'inherit',
        bgcolor: 'background.paper',
        /* `.product { border:1px solid var(--line); border-radius:14px }` */
        border: '1px solid #ececf2',
        borderRadius: '14px',
        /* เงาเดียวกับการ์ดบริการ/ห้องพัก/คลิป — เดิมการ์ดสินค้าเป็นใบเดียวที่ไม่มีเงา
           ทำให้แท็บสินค้าดู "แบน" กว่าแท็บอื่นทั้งที่ขอบกับมุมมนเท่ากันแล้ว (user ทัก 2026-08-23) */
        boxShadow: '0 6px 18px rgba(30,27,56,.05)',
        cursor: clickable ? 'pointer' : 'default',
        '&:hover .askOverlay': { opacity: 1 },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
      }}
    >
      {/* โซนรูป — ของที่ลอยทับ (ป้ายปักหมุด/ราคา/ยอดขาย/overlay ตอน hover) ต้องอยู่ในกล่องนี้เท่านั้น
          ถ้าปล่อยให้ overlay ครอบทั้งปุ่มเหมือนเดิม มันจะทับชื่อ+คำอธิบายที่เพิ่งเพิ่มเข้ามาตอน hover
          = ปิดบังสิ่งที่เพิ่งทำให้อ่านง่ายขึ้นพอดี */}
      {/* 🛑 รูปสินค้าเป็น **แนวนอน 1.35:1** ไม่ใช่ 3:4 แนวตั้งของไทล์คลิปแล้ว (เปลี่ยน 2026-08-21
          ตอนยกโครงการ์ดมาจากไฟล์อ้างอิง) — คอมเมนต์เดิมตรงนี้ยังเขียนว่า "3:4 เท่าไทล์คลิป"
          ซึ่งขัดกับ `aspectRatio` ที่อยู่ใต้มันเองไม่กี่บรรทัด
          ⚠️ ผลข้างเคียงที่รู้ตัว: `object-cover` ยังครอปอยู่ — แต่กลับด้านกับของเดิม คือตอนนี้
          รูปที่ถ่ายมาเป็นแนวตั้งจะเสียหัว-ท้าย */}
      {/* 🛑 พื้นแผ่นรูปเป็น #191923 เท่ากับ `.service-image` ของการ์ดบริการ/ห้องพัก ไม่ใช่
          `background.default` — สองแท็บนี้อยู่หน้าเดียวกันและผู้ซื้อสลับดูได้ทันที เทาอ่อนบน
          การ์ดขาวอ่านเป็น "รูปยังโหลดไม่เสร็จ/พัง" ส่วนแผ่นทึบอ่านเป็น "ร้านยังไม่ใส่รูป"
          ซึ่งเป็นความหมายที่ต้องการ (user ทัก 2026-08-21 ว่าการ์ดสินค้าดูแปลกกว่าการ์ดบริการ) */}
      <Box sx={{ position: 'relative', aspectRatio: '1.35/1', inlineSize: '100%', overflow: 'hidden', bgcolor: '#191923' }}>
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
      {/* 🛑 ถอดฉากมืด (`TILE_SCRIM`) ออก — มันมีไว้ให้ตัวหนังสือขาวอ่านออกตอนที่ข้อความยังทับบนรูป
          พอย้ายข้อความลงกล่องขาวใต้รูปแล้ว มันเหลือแค่ทำให้รูปสินค้าหม่นลงโดยไม่ได้อะไรกลับมา */}

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

      {/* ── ปุ่มถูกใจ (CR 2026-08-11) ──
          มุมบนขวา — มุมบนซ้ายเป็นป้าย "ปักหมุด" อยู่แล้ว

          🛑 การ์ดทั้งใบเป็นลิงก์ไปหน้าสินค้า ปุ่มนี้จึงต้อง `preventDefault + stopPropagation`
          ไม่งั้นกดหัวใจแล้วเด้งออกจากหน้าไปด้วย

          optimistic: สลับสถานะทันทีแล้วค่อย sync กับ response — ปุ่ม gimmick ที่ต้องรอ
          round-trip ก่อนเห็นผลจะรู้สึกเหมือนกดไม่ติด แล้วคนจะกดรัว
          ถ้าคำขอล้ม ย้อนสถานะกลับ ไม่ปล่อยให้หัวใจค้างทึบทั้งที่ยังไม่ถูกบันทึก */}
      <ProductLikeButton
        productId={product.id}
        liked={like.liked}
        count={like.count}
        onChange={onLikeChange}
      />


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
            {/* 🛑 ป้าย overlay ต้องเปลี่ยนพร้อมกับสิ่งที่ปุ่มทำ **ในคอมมิตเดียวกัน** — ไทล์สินค้า
                เปิด lightbox แล้ว ถ้ายังเขียน "สอบถามสินค้านี้" + ไอคอนแชทอยู่ มันคือคำโกหก
                (ห้องพักยังทักแชทจริง จึงยังใช้คำเดิม) */}
            <Icon icon={onOpen ? 'tabler-zoom-in' : 'tabler-message-circle'} fontSize={14} />
            {onOpen ? 'ดูสินค้านี้' : 'สอบถามสินค้านี้'}
          </Box>
        </Box>
      )}
      </Box>

      {/* ── `.product-body` ของไฟล์อ้างอิง — ชื่อ/ราคา/ยอดขาย อยู่ในกล่องขาว "ใต้รูป" ──
          🛑 กลับมติ 2026-08-10 ที่เคยสั่งให้ข้อความทับบนรูป (แบบแท็บปักหมุด) — user เคาะใหม่
          2026-08-21 ว่าให้ยึด UI ตามไฟล์อ้างอิง (`ตอบ B`) ทั้งที่รู้ว่าเป็นการย้อนมติเดิม
          เหตุผลที่ย้ายลงมาดีกว่าในบริบทนี้: การ์ดอยู่ในคอลัมน์เนื้อหาที่กว้างขึ้นและรูปเป็นแนวนอน
          ข้อความทับรูปแนวนอนจะเหลือที่แค่แถบล่างบาง ๆ ซึ่งชื่อสินค้า 2 บรรทัดไม่พอ

          ยอดขายนับเฉพาะออเดอร์ที่ผู้ซื้อยืนยันรับของแล้ว (ดู getConfirmedOrderCountByProduct)
          ยอดขายนับเฉพาะออเดอร์ที่ผู้ซื้อยืนยันรับของแล้ว (ดู getConfirmedOrderCountByProduct)
          ยังไม่มียอด = ไม่แสดงอะไรเลย ไม่ใช่แสดง 0 — กติกาเดียวกับตัวเลขอื่นทั้งหน้า เพราะ
          "ขายแล้ว 0" อ่านแล้วแย่กว่าไม่บอก ทั้งที่สินค้าเพิ่งลงก็เป็น 0 เหมือนกัน */}
      <Box
        sx={{
          /* `.product-body { padding:11px }` */
          p: '11px',
          textAlign: 'start',
          /* ยืดเต็มส่วนที่เหลือของการ์ด เพื่อให้ราคาลงไปเกาะก้นด้วย `marginBlockStart:'auto'` */
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ชื่อ + คำอธิบาย อยู่ **เหนือราคา** เพราะ "นี่คืออะไร" ต้องอ่านก่อน "เท่าไหร่"
            (ลำดับนี้คงไว้จากของเดิม แม้ตำแหน่งจะย้ายจากบนรูปลงมาในกล่องขาวแล้ว) */}
        <Box
          component='span'
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: '12px',
            fontWeight: 800,
            lineHeight: 1.45,
            color: 'text.primary',
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
        {/* 🛑 ราคาเกาะก้นการ์ดด้วย `marginBlockStart:'auto'` แทนการจองความสูง 2 บรรทัดให้ชื่อ
            (`minBlockSize:'34px'` ที่ถอดออกไป) — วิธีจองที่ทำให้สินค้าชื่อสั้นเหลือบรรทัดว่าง
            ค้างใต้ชื่อเสมอ เห็นชัดที่สุดตอนมีสินค้าชิ้นเดียวซึ่งไม่มีใบอื่นให้เทียบความสูงเลย
            (user เจอเอง 2026-08-21 กับสินค้าชื่อ "0")
            วิธีนี้ได้ผลดีกว่าเดิมด้วยซ้ำ: กริดยืดการ์ดทุกใบเท่าใบที่สูงสุดอยู่แล้ว ราคาจึงตรงแถว
            กันทุกใบ **รวมถึงกรณีที่คำอธิบายยาวไม่เท่ากัน** ซึ่งการจองความสูงให้ชื่ออย่างเดียว
            เอาไม่อยู่ · `paddingBlockStart` กันชื่อกับราคาชนกันตอนการ์ดไม่ถูกยืด */}
        {showPrices && (
          <Box
            component='span'
            sx={{
              display: 'block',
              fontSize: '16px',
              fontWeight: 900,
              marginBlockStart: 'auto',
              paddingBlockStart: '5px',
              color: 'primary.main',
            }}
            className='tabular-nums'
          >
            {priceLabel}
          </Box>
        )}
        {showSold && (
          <Box
            component='span'
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              /* 🛑 `marginBlockStart:'auto'` ต้อง "ย้ายมาอยู่ที่บรรทัดนี้" เมื่อบรรทัดราคาไม่ถูก
                 render (feature 00053) — ตัวที่ดันเนื้อหาไปเกาะก้นการ์ดคือ **ลูกคนแรกที่มี auto**
                 ถ้าปล่อยให้เหลือแต่ `mt:'1px'` การ์ดที่ซ่อนราคาจะมีบรรทัดยอดสะสมลอยไปติดใต้ชื่อ
                 แล้วก้นการ์ดว่างเปล่า ⇒ ทั้งกริดฟันหลอเพราะการ์ดถูกยืดเท่าใบที่สูงสุดอยู่แล้ว
                 (เหตุผลเดียวกับคอมเมนต์ของบรรทัดราคาด้านบน แค่ย้ายเจ้าของ auto) */
              marginBlockStart: showPrices ? undefined : 'auto',
              paddingBlockStart: showPrices ? undefined : '5px',
              mt: showPrices ? '1px' : undefined,
              fontSize: '11px',
              fontWeight: 600,
              color: 'text.secondary',
            }}
          >
            <Icon icon='tabler-shopping-bag-check' fontSize={12} />
            {soldLine(product.soldCount.toLocaleString('th-TH'))}
          </Box>
        )}
      </Box>

      {/* ข้อความทั้งหมดย้ายขึ้นไปทับบนรูปแล้ว (user 2026-08-10 สั่งให้เหมือนแท็บปักหมุด)
          เหลือแค่ป้ายบอก screen reader ว่ากดแล้วเกิดอะไร — ข้อมูลสินค้าอ่านจาก text บนรูปได้อยู่แล้ว */}
      {clickable && (
        <Box component='span' className='sr-only'>
          {onOpen ? 'ดูสินค้านี้' : 'สอบถามสินค้านี้'}
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
  shopName = '',
  shopAvatar = null,
  initialProductId,
  onDeepLinkResolved,
  showPrices,
  isServiceQueue = false,
  truncated = false,
}: {
  data: Pick<ProfileTabData, 'pinnedProducts' | 'otherProducts' | 'openShopEmptyState' | 'itemKind'>
  shopId?: string | null
  isOwnShop?: boolean
  /** ชื่อ/รูปร้าน — โผล่หัวแผงของ lightbox เท่านั้น (กริดไม่ได้ใช้) */
  shopName?: string
  shopAvatar?: string | null
  /** id ของสินค้าที่ deep link สั่งให้เปิด (`?p=`) — ไม่มี/ไม่รู้จัก = ไม่เปิดอะไร */
  initialProductId?: string | null
  /** แจ้งผู้เรียกว่า id ที่ส่งมาใช้ได้จริงไหม — ใช้ไม่ได้ต้องถอดพารามิเตอร์ทิ้งเงียบ ๆ */
  onDeepLinkResolved?: (ok: boolean) => void
  /** feature 00053 — ร้านนี้เปิดให้แสดงราคาบนหน้าร้านไหม (บังคับส่ง ดูเหตุผลที่ ShopProfileData) */
  showPrices: boolean
  /** feature 00053 — ร้านคิวงาน: บรรทัดยอดสะสมอ่านว่า "ใช้บริการแล้ว N ครั้ง" */
  isServiceQueue?: boolean
  /** feature 00053 — ชุดที่ดึงมาชนเพดาน ⇒ ต้องมีป้ายบอกใต้กริดว่าแสดงบางส่วน */
  truncated?: boolean
}) => {
  const { pinnedProducts, otherProducts, openShopEmptyState, itemKind = 'PRODUCT' } = data
  const hasAnyProduct = pinnedProducts.length > 0 || otherProducts.length > 0

  /**
   * feature 00053 — โหมดเรียงของกริด "สินค้าทั้งหมด"
   *
   * 🛑 state อยู่ที่นี่ ไม่ผูกกับ URL โดยตั้งใจ — คอมเมนต์ใน ShopProfile.tsx เตือนไว้แล้วว่าถ้า
   * หน้า `/u`,`/b` เริ่มอ่าน `searchParams` ที่ server Next จะเปลี่ยน navigation เป็น server
   * refetch เต็มรูป **ทุกครั้งที่กด ‹ ›** ของ lightbox ⇒ จ่ายทั้งหน้าเพื่อชิปสองปุ่ม (SDS TD-005)
   * ผลที่ยอมรับ: การเรียงไม่ติดไปกับลิงก์ที่แชร์ และหายเมื่อรีเฟรช
   */
  const [sortMode, setSortMode] = useState<ProfileSortMode>('DEFAULT')

  /* กริด "สินค้าทั้งหมด" เรียงตามชิปที่ผู้ซื้อเลือก — ชุดปักหมุด **ไม่ถูกจัดเรียงใหม่เด็ดขาด**
     (FR-PPD-15: ลำดับปักหมุดคือ pinnedAt desc ซึ่งเป็นเจตนาของร้าน ไม่ใช่ค่าที่ผู้ชมจัดได้) */
  const sortedOtherProducts = sortProfileProducts(otherProducts, sortMode)

  /** ลำดับเดียวกับที่ตาเห็นบนหน้าจอ (กริดปักหมุดมาก่อน แล้วต่อด้วยกริดที่เหลือ) — ‹ › เดินตามนี้
   *
   *  🛑 ต้องเป็นชุด "หลังเรียง" เสมอ (feature 00053) — ถ้าใช้ลำดับดิบ ปุ่ม ‹ › ใน lightbox จะพาไป
   *  สินค้าที่ไม่ได้อยู่ถัดจากใบที่กด เมื่อผู้ชมเลือกชิปเรียงไว้ (ตำแหน่งบนจอกับ index ไม่ตรงกัน)
   *  — บั๊กที่เห็นได้เฉพาะตอน "กดชิปแล้วค่อยเปิดสินค้า" ซึ่งเป็นลำดับที่ไม่มีใครทำตอนไล่เทสทีละจุด */
  const allProducts = [...pinnedProducts, ...sortedOtherProducts]

  /* 🛑 ห้องพักไม่เข้ารอบ lightbox (ดูเหตุผลที่ ProductCard) */
  const lightboxEnabled = itemKind === 'PRODUCT'

  /**
   * สถานะถูกใจที่ผู้ใช้กดเองในรอบนี้ — เก็บเฉพาะ id ที่ถูกแตะ ไม่ snapshot ทั้งรายการ
   *
   * 🛑 ทำไมเป็น override map ไม่ใช่ initial state ทั้งก้อน: ถ้า snapshot ตอน mount แล้ว
   * `router.refresh()` พาค่าใหม่จาก server เข้ามา (เช่นคนอื่นกดถูกใจสินค้าเดียวกัน) กริดจะยัง
   * โชว์เลขเก่าค้างตลอดอายุหน้า · แบบนี้สินค้าที่ผู้ใช้ไม่ได้แตะจะเดินตาม props เสมอ
   *
   * ยกขึ้นมาที่นี่เพราะปุ่มถูกใจโผล่ **สองที่ต่อสินค้าหนึ่งชิ้น** (บนไทล์ + ในแผงของ lightbox)
   * ต่างคนต่างถือ state = กดในแผงแล้วปิดกลับมา ไทล์โชว์เลขเก่า
   */
  const [likeOverrides, setLikeOverrides] = useState<Record<string, { liked: boolean; count: number }>>({})
  const likeOf = (p: SerializedProduct) =>
    likeOverrides[p.id] ?? { liked: p.likedByMe ?? false, count: p.likeCount ?? 0 }
  const setLike = (id: string, next: { liked: boolean; count: number }) =>
    setLikeOverrides((m) => ({ ...m, [id]: next }))

  const writeParam = useLightboxDeepLink('p')

  /* lazy initializer ไม่ใช่ useEffect — useEffect จะมีหนึ่งเฟรมที่ lightbox ยังไม่เปิด
     ผู้ใช้ที่กดลิงก์มาจะเห็นกริดกระพริบก่อนแล้วโมดัลค่อยเด้งทับ */
  const [openIndex, setOpenIndex] = useState<number | null>(() => {
    if (!lightboxEnabled || !initialProductId) return null
    const i = allProducts.findIndex((p) => p.id === initialProductId)
    return i >= 0 ? i : null
  })

  useEffect(() => {
    if (!initialProductId) return
    onDeepLinkResolved?.(lightboxEnabled && allProducts.some((p) => p.id === initialProductId))
    // ตั้งใจให้รันครั้งเดียวตอน mount — deep link เป็นค่าตั้งต้น ไม่ใช่ค่าที่ sync ตลอดเวลา
    // (ผู้ใช้กด ‹ › ต่อไปเองแล้ว URL จะไม่ตรงกับ initialProductId อีก ซึ่งถูกต้อง)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openAt = (id: string) => {
    const i = allProducts.findIndex((p) => p.id === id)
    if (i < 0) return
    setOpenIndex(i)
    // push ตอนเปิดครั้งแรก → ปุ่ม back ปิด lightbox
    writeParam(id, 'push')
  }
  const moveTo = (i: number) => {
    setOpenIndex(i)
    // replace ตอนเลื่อนใบ → ไม่ว่าจะดูกี่ใบก็กด back ครั้งเดียวออก
    writeParam(allProducts[i].id, 'replace')
  }
  const closeLightbox = () => {
    setOpenIndex(null)
    writeParam(null, 'replace')
  }
  // ร้านบ้านพักใช้ grid เดียวกับสินค้า (ความสม่ำเสมอของหน้าสำคัญกว่าการมี layout เฉพาะ)
  // เปลี่ยนเฉพาะถ้อยคำให้ตรงกับสิ่งที่ผู้ใช้เห็นจริง
  const isRoom = itemKind === 'ROOM'
  // 🛑 `soldUnit` เคยเป็น "คำสั่งซื้อ" ขณะที่หัวหน้าร้านเรียกของอย่างเดียวกันว่า "ออเดอร์"
  // (`STAT_LABELS.general.orders` ใน ProfileHero) — คำต่างกันสองคำบนหน้าเดียวสำหรับของสิ่งเดียวกัน
  // ไม่มี tsc/detector ตัวไหนจับได้เพราะเป็นสตริงที่ถูกทั้งคู่
  const L = isRoom
    ? { empty: 'ร้านนี้ยังไม่มีห้องพัก', emptyHint: 'ทักแชทสอบถามร้านได้เลย', pinned: 'ห้องพักแนะนำ', all: 'ห้องพักทั้งหมด' }
    : { empty: 'ร้านนี้ยังไม่มีสินค้า', emptyHint: 'ทักแชทสอบถามร้านได้เลย', pinned: 'สินค้าปักหมุด', all: 'สินค้าทั้งหมด' }

  /* ประโยคยอดสะสม — มาจาก SSOT เดียว (Hard Rule 16) ไม่ต่อคำเองที่นี่
     ตัวตัดสินคือ "การ์ดใบนี้เป็นอะไร" (itemKind) ก่อน แล้วค่อยเป็นประเภทร้าน — ร้านบ้านพักมีทั้ง
     การ์ดห้องพักและการ์ดสินค้าอยู่บนหน้าเดียวกัน */
  const soldLine = (formattedCount: string) =>
    profileSoldLine({ itemKind: isRoom ? 'ROOM' : 'PRODUCT', isServiceQueue }, formattedCount)

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
          {/* ไม่มีหัวข้อ "สินค้าปักหมุด"/"สินค้าทั้งหมด" แล้ว (user 2026-08-10) — แท็บนี้ต้องอ่านเป็น
              ฟีดรูปต่อเนื่องเหมือนแท็บปักหมุด ไม่ใช่เอกสารที่แบ่ง section · ป้าย "ปักหมุด" บนไทล์
              ยังบอกอยู่แล้วว่าใบไหนถูกปักหมุด จึงไม่ได้เสียข้อมูลไปกับการตัดหัวข้อ
              pb เหลือ 4px เท่าช่องไฟกริด เพื่อให้สองชุดไหลต่อกันเป็นผืนเดียว */}
          {pinnedProducts.length > 0 && (
            <Box id='pinned-products' sx={{ pt: '12px', pb: '4px' }}>
              <Box
                sx={{
                  display: 'grid',
                  // 🛑 ไม่ใช่ผัง IG แบบ "ชิดกันไม่มีช่องว่าง" อีกแล้ว — gap 16px + การ์ดมีขอบ/มุมมน
                  //    (ยกให้เป็นภาษาเดียวกันทั้งแท็บสินค้าและแท็บปักหมุด 2026-08-21/23)
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
                  // ขนาดไทล์อ้างอิง Instagram ที่ user วัดมาเอง 2026-08-11: **242×322px, 6 ใบต่อแถว**
                  // ในคอนเทนเนอร์ ~1480px (เรา inspect เองได้ 304×405 = ใหญ่เกิน)

                  // - มือถือ 3 คอลัมน์ (ไม่แตะ user บอกว่าโอเคแล้ว)
                  // - md (900px+) 4 คอลัมน์ → ที่คอนเทนเนอร์ 960px ได้ไทล์ ~236px ใกล้ 242 ของ IG
                  // - xl (1536px+) 6 คอลัมน์ + ถ่างออกนอกคอนเทนเนอร์ 260px ต่อข้าง → กริดกว้าง 1480px
                  //   ได้ไทล์ ~242px เท่า IG พอดี

                  // 🛑 IG ถ่างเฉพาะ "กริด" ไม่ได้ถ่ายทั้งหน้า — หัวโปรไฟล์ของเขายังแคบกว่ากริดชัดเจน
                  // เราจึงถ่างที่กริดด้วย negative margin ไม่ใช่ขยาย max-is ของคอนเทนเนอร์
                  // (ขยายคอนเทนเนอร์จะลาก bio/แถบตัวเลข/แถวเพจ ไปกว้าง 1480 ด้วย ซึ่งอ่านยากและไม่เหมือน IG)

                  // ตัวเลข -260px ผูกกับ max-is-[960px] ของ ShopProfile.tsx: (1480-960)/2 = 260
                  // **ถ้าวันไหนเปลี่ยนความกว้างคอนเทนเนอร์ ต้องมาแก้ตัวเลขนี้ด้วย** ไม่งั้นกริดจะล้นจอ
                  /* 🛑 มือถือ 2 คอลัมน์ ไม่ใช่ 3 — เดิม 3 พอไหวตอนการ์ดเป็นรูป "ตั้ง" 3:4 ที่มีข้อความทับบนรูป
                     พอเปลี่ยนเป็นรูป "นอน" 1.35:1 + ข้อความอยู่ใต้รูป (โฉมใหม่ 2026-08-21) ที่จอ 360px
                     3 คอลัมน์เหลือการ์ดกว้าง 104px ⇒ ชื่อสินค้าตกบรรทัดทีละคำ · 2 คอลัมน์ได้ 162px */
                  gridTemplateColumns: {
                    xs: 'repeat(2, 1fr)',
                    sm: 'repeat(3, 1fr)',
                    /* 4 คอลัมน์รอถึง lg ไม่ใช่ md — ที่ md (900px) sidebar 255px+gap โผล่ขึ้นมาพอดี
                       คอลัมน์ขวาจึงเหลือ 591px: 4 คอลัมน์ = ใบละ 133px ขณะที่ 899px (ยังไม่มี sidebar)
                       ได้ใบละ 281px ⇒ หดครึ่งหนึ่งในพิกเซลเดียว · 3 คอลัมน์ที่ md ได้ 189px
                       ต่อเนื่องกับ 193px ที่ lg พอดี */
                    /* 🛑 ไม่มีขั้น `xl: 6 คอลัมน์` แล้ว — 6 คอลัมน์เคยสมเหตุสมผลเพราะกริดถูก negative
                       margin ถ่างออกเป็น 1327px (ได้ใบละ ~208px) พอถอด margin นั้นทิ้ง คอลัมน์ขวา
                       ตันที่ 807px ตามคอนเทนเนอร์ 1080px ⇒ 6 คอลัมน์เหลือใบละ 114px ซึ่งแคบกว่า
                       มือถือ 2 คอลัมน์ (168px) เสียอีก · 4 คอลัมน์ที่ 180px คือกว้างสุดที่ทำได้จริง */
                    lg: 'repeat(4, 1fr)',
                  },
                  /* gap 16px เท่า `.service-grid` ของการ์ดบริการ — การ์ดสินค้ามีขอบ+มุมมนแล้ว
                     gap 4px ของยุคไทล์ IG (ไร้ขอบ ชิดกันเป็นผืนเดียว) ทำให้ขอบสองใบเกือบชนกัน */
                  gap: '16px',
                  /* 🛑 **ไม่มี negative margin แล้ว** — `{ xs:'-20px', xl:'-260px' }` เป็นของยุคไทล์ IG
                     ที่จงใจถ่างกริดออกนอกคอนเทนเนอร์ พอเปลี่ยนเป็นการ์ดมีขอบตามไฟล์อ้างอิง
                     (2026-08-21) มันเหลือแต่ผลเสีย และทั้งสองค่าพังจริงทั้งคู่:
                       xs  : panel เว้น 12px แล้วถูกดึงกลับ 20 ⇒ การ์ดยื่นออกนอกจอ 8px
                       xl  : -260 ผูกกับ `max-is-[960px]` ตามที่คอมเมนต์เดิมเตือนไว้เอง
                             แต่คอนเทนเนอร์เป็น 1080px แล้ว ⇒ ที่จอ 1536px กริดล้นขอบขวา 32px
                     คอมเมนต์เดิมเขียนเงื่อนไขไว้ถูก ("ถ้าเปลี่ยนความกว้างคอนเทนเนอร์ ต้องมาแก้")
                     แต่ไม่มีอะไรบังคับให้ใครกลับมาแก้ตอนคอนเทนเนอร์เปลี่ยนจริง */
                }}
              >
                {pinnedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    pinned
                    shopId={shopId ?? null}
                    isOwnShop={isOwnShop}
                    soldLine={soldLine}
                    showPrices={showPrices}
                    onOpen={lightboxEnabled ? () => openAt(product.id) : undefined}
                    like={likeOf(product)}
                    onLikeChange={(next) => setLike(product.id, next)}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* ── สินค้าทั้งหมด (Phase 3: otherProducts = getProductsByShop excludePinned — ซ่อนเมื่อว่าง) ── */}
          {otherProducts.length > 0 && (
            <Box id='all-products' sx={{ pb: '16px' }} data-section='all-products'>
              {/* ชิปเรียงลำดับ (feature 00053 FR-PPD-13) — โผล่เฉพาะตอนมีอะไรให้เรียงจริง
                  มีของชิ้นเดียวแล้วยังโชว์ปุ่มเรียง = ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น (FR-PPD-17) */}
              {sortedOtherProducts.length > 1 && (
                <Box
                  role='group'
                  aria-label='เรียงลำดับสินค้า'
                  sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px', pt: '12px', pb: '10px' }}
                >
                  {PROFILE_SORT_CHIPS.map((chip) => {
                    const active = sortMode === chip
                    return (
                      <Box
                        key={chip}
                        component='button'
                        type='button'
                        /* aria-pressed ไม่ใช่ aria-selected — นี่คือปุ่มสลับสถานะ ไม่ใช่แท็บ
                           (`aria-selected` ต้องการ role ที่รองรับ เช่น tab/option ไม่งั้นถูกทิ้ง —
                           docs/conventions/aria-name-requires-supporting-role.md) */
                        aria-pressed={active}
                        onClick={() => setSortMode((m) => nextSortMode(m, chip))}
                        sx={{
                          /* ปุ่มสูง 36px + แตะได้เต็มความสูงแถว — ชิปนี้เล็กกว่า 44px ตามภาษาของ
                             ชิปกรองอื่นในหน้านี้ แต่กว้างพอ (≥72px) และมีระยะห่างรอบตัว 8px */
                          minBlockSize: '36px',
                          paddingInline: '14px',
                          borderRadius: '999px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          /* สถานะ "ถูกเลือก" ต้องต่างมากกว่าสี — คนตาบอดสีต้องแยกออกด้วย
                             (WCAG 1.4.1) จึงเปลี่ยนทั้งน้ำหนักตัวอักษร พื้น และเส้นขอบพร้อมกัน */
                          fontWeight: active ? 700 : 500,
                          /* 🛑 `primary.dark` ไม่ใช่ `primary.main` — #7367F0 บนพื้นชิป (primary 8%
                             เหนือขาว = #F3F2FD) วัดได้ 3.84:1 ซึ่งตก AA ของข้อความปกติ (ต้อง 4.5)
                             ส่วน #675DD8 ได้ 4.58:1 · เป็นการเปลี่ยน "ความเข้ม" ของสีเดิม ไม่ใช่
                             สลับเฉด ตาม docs/conventions/contrast-fix-keeps-hue.md
                             ตัวที่ไม่ถูกเลือกใช้ text.secondary (ink 70% = 5.28:1) ผ่านอยู่แล้ว */
                          color: active ? 'primary.dark' : 'text.secondary',
                          background: active ? 'var(--mui-palette-primary-lightOpacity)' : 'transparent',
                          border: '1px solid',
                          borderColor: active ? 'primary.main' : '#e3e3ea',
                          transition: 'background .15s, border-color .15s',
                        }}
                      >
                        {SORT_CHIP_LABEL[chip]}
                      </Box>
                    )
                  })}
                </Box>
              )}
              <Box
                sx={{
                  display: 'grid',
                  // 🛑 ไม่ใช่ผัง IG แบบ "ชิดกันไม่มีช่องว่าง" อีกแล้ว — gap 16px + การ์ดมีขอบ/มุมมน
                  //    (ยกให้เป็นภาษาเดียวกันทั้งแท็บสินค้าและแท็บปักหมุด 2026-08-21/23)
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
                  // ขนาดไทล์อ้างอิง Instagram ที่ user วัดมาเอง 2026-08-11: **242×322px, 6 ใบต่อแถว**
                  // ในคอนเทนเนอร์ ~1480px (เรา inspect เองได้ 304×405 = ใหญ่เกิน)

                  // - มือถือ 3 คอลัมน์ (ไม่แตะ user บอกว่าโอเคแล้ว)
                  // - md (900px+) 4 คอลัมน์ → ที่คอนเทนเนอร์ 960px ได้ไทล์ ~236px ใกล้ 242 ของ IG
                  // - xl (1536px+) 6 คอลัมน์ + ถ่างออกนอกคอนเทนเนอร์ 260px ต่อข้าง → กริดกว้าง 1480px
                  //   ได้ไทล์ ~242px เท่า IG พอดี

                  // 🛑 IG ถ่างเฉพาะ "กริด" ไม่ได้ถ่ายทั้งหน้า — หัวโปรไฟล์ของเขายังแคบกว่ากริดชัดเจน
                  // เราจึงถ่างที่กริดด้วย negative margin ไม่ใช่ขยาย max-is ของคอนเทนเนอร์
                  // (ขยายคอนเทนเนอร์จะลาก bio/แถบตัวเลข/แถวเพจ ไปกว้าง 1480 ด้วย ซึ่งอ่านยากและไม่เหมือน IG)

                  // ตัวเลข -260px ผูกกับ max-is-[960px] ของ ShopProfile.tsx: (1480-960)/2 = 260
                  // **ถ้าวันไหนเปลี่ยนความกว้างคอนเทนเนอร์ ต้องมาแก้ตัวเลขนี้ด้วย** ไม่งั้นกริดจะล้นจอ
                  /* 🛑 มือถือ 2 คอลัมน์ ไม่ใช่ 3 — เดิม 3 พอไหวตอนการ์ดเป็นรูป "ตั้ง" 3:4 ที่มีข้อความทับบนรูป
                     พอเปลี่ยนเป็นรูป "นอน" 1.35:1 + ข้อความอยู่ใต้รูป (โฉมใหม่ 2026-08-21) ที่จอ 360px
                     3 คอลัมน์เหลือการ์ดกว้าง 104px ⇒ ชื่อสินค้าตกบรรทัดทีละคำ · 2 คอลัมน์ได้ 162px */
                  gridTemplateColumns: {
                    xs: 'repeat(2, 1fr)',
                    sm: 'repeat(3, 1fr)',
                    /* 4 คอลัมน์รอถึง lg ไม่ใช่ md — ที่ md (900px) sidebar 255px+gap โผล่ขึ้นมาพอดี
                       คอลัมน์ขวาจึงเหลือ 591px: 4 คอลัมน์ = ใบละ 133px ขณะที่ 899px (ยังไม่มี sidebar)
                       ได้ใบละ 281px ⇒ หดครึ่งหนึ่งในพิกเซลเดียว · 3 คอลัมน์ที่ md ได้ 189px
                       ต่อเนื่องกับ 193px ที่ lg พอดี */
                    /* 🛑 ไม่มีขั้น `xl: 6 คอลัมน์` แล้ว — 6 คอลัมน์เคยสมเหตุสมผลเพราะกริดถูก negative
                       margin ถ่างออกเป็น 1327px (ได้ใบละ ~208px) พอถอด margin นั้นทิ้ง คอลัมน์ขวา
                       ตันที่ 807px ตามคอนเทนเนอร์ 1080px ⇒ 6 คอลัมน์เหลือใบละ 114px ซึ่งแคบกว่า
                       มือถือ 2 คอลัมน์ (168px) เสียอีก · 4 คอลัมน์ที่ 180px คือกว้างสุดที่ทำได้จริง */
                    lg: 'repeat(4, 1fr)',
                  },
                  /* gap 16px เท่า `.service-grid` ของการ์ดบริการ — การ์ดสินค้ามีขอบ+มุมมนแล้ว
                     gap 4px ของยุคไทล์ IG (ไร้ขอบ ชิดกันเป็นผืนเดียว) ทำให้ขอบสองใบเกือบชนกัน */
                  gap: '16px',
                  /* 🛑 **ไม่มี negative margin แล้ว** — `{ xs:'-20px', xl:'-260px' }` เป็นของยุคไทล์ IG
                     ที่จงใจถ่างกริดออกนอกคอนเทนเนอร์ พอเปลี่ยนเป็นการ์ดมีขอบตามไฟล์อ้างอิง
                     (2026-08-21) มันเหลือแต่ผลเสีย และทั้งสองค่าพังจริงทั้งคู่:
                       xs  : panel เว้น 12px แล้วถูกดึงกลับ 20 ⇒ การ์ดยื่นออกนอกจอ 8px
                       xl  : -260 ผูกกับ `max-is-[960px]` ตามที่คอมเมนต์เดิมเตือนไว้เอง
                             แต่คอนเทนเนอร์เป็น 1080px แล้ว ⇒ ที่จอ 1536px กริดล้นขอบขวา 32px
                     คอมเมนต์เดิมเขียนเงื่อนไขไว้ถูก ("ถ้าเปลี่ยนความกว้างคอนเทนเนอร์ ต้องมาแก้")
                     แต่ไม่มีอะไรบังคับให้ใครกลับมาแก้ตอนคอนเทนเนอร์เปลี่ยนจริง */
                }}
              >
                {sortedOtherProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    pinned={false}
                    shopId={shopId ?? null}
                    isOwnShop={isOwnShop}
                    soldLine={soldLine}
                    showPrices={showPrices}
                    onOpen={lightboxEnabled ? () => openAt(product.id) : undefined}
                    like={likeOf(product)}
                    onLikeChange={(next) => setLike(product.id, next)}
                  />
                ))}
              </Box>
              {/* 🛑 ชุดที่ดึงมาชนเพดานแล้ว ⇒ **ต้องบอก** ว่ายังมีของที่ไม่ได้แสดง
                  ตัวเลขบนชิป "ขายดี" คำนวณจากชุดนี้เท่านั้น ถ้าเงียบไว้ ผู้ซื้อจะอ่านว่าเป็น
                  ขายดีของทั้งร้าน (docs/conventions/partial-data-must-be-labeled-or-filled.md) */}
              {truncated && (
                <Typography sx={{ color: '#808390', fontSize: '12px', mt: '10px', textAlign: 'center' }}>
                  แสดง {sortedOtherProducts.length} รายการแรก — ร้านนี้อาจมีมากกว่านี้ ทักแชทสอบถามได้เลย
                </Typography>
              )}
            </Box>
          )}
        </>
      )}

      {openIndex != null && allProducts[openIndex] && (
        <ProductLightbox
          products={allProducts.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            // สินค้าเก่าที่ serialize ก่อนมี field นี้ → ตกไปใช้รูปเดียวจาก imageUrl
            // (ไม่ปล่อยเป็น [] ไม่งั้น lightbox เปิดมาเป็นจอว่างทั้งที่ไทล์มีรูป)
            images: p.images?.length ? p.images : p.imageUrl ? [p.imageUrl] : [],
            soldCount: p.soldCount,
            shortDescription: p.shortDescription,
            pinned: pinnedProducts.some((pp) => pp.id === p.id),
          }))}
          index={openIndex}
          onIndexChange={moveTo}
          onClose={closeLightbox}
          shopId={shopId ?? null}
          isOwnShop={isOwnShop}
          shopName={shopName}
          shopAvatar={shopAvatar}
          soldLine={soldLine}
          showPrices={showPrices}
          likeOf={(id) => {
            const p = allProducts.find((x) => x.id === id)
            return p ? likeOf(p) : { liked: false, count: 0 }
          }}
          onLikeChange={setLike}
        />
      )}
    </>
  )
}

export default ProfileRightContent
