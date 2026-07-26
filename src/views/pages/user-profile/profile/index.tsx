'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Next/Auth Imports — S-19 (extension #1 Chat Product Context Card) login-gate ปุ่ม "สอบถามสินค้านี้"
// pattern: src/views/pages/user-profile/UserProfileHeader.tsx handleChatClick (AuctionBidPanel.tsx:114-121)
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

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
}: {
  product: SerializedProduct
  pinned: boolean
  shopId: string | null
  isOwnShop?: boolean
}) => {
  const price = parseFloat(product.price)
  const priceLabel = `฿${isNaN(price) ? product.price : price.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

  // ค่ารูปที่เก็บใน DB มีสองแบบปนกัน — storage key กับ URL เต็ม ต้องแปลงก่อนใช้เสมอ
  // (แปลงในการ์ดเหมือนที่ PublicRoomList ทำกับรูปห้องพัก ไม่ใช่แปลงที่หน้า จะได้ไม่ต้องไล่แก้ทุกหน้าที่เรียก)
  const imageSrc = toFileUrl(product.imageUrl)

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
    <Box
      component={clickable ? 'button' : 'div'}
      type={clickable ? 'button' : undefined}
      onClick={clickable ? handleAskClick : undefined}
      aria-label={clickable ? `สอบถาม ${product.name} ราคา ${priceLabel}` : product.name}
      title={product.name}
      sx={{
        position: 'relative',
        aspectRatio: '1/1',
        display: 'block',
        inlineSize: '100%',
        overflow: 'hidden',
        border: 0,
        padding: 0,
        margin: 0,
        // <button> ไม่สืบทอด font จาก body (UA stylesheet ตั้ง Arial ให้ form control ทุกตัว)
        fontFamily: 'inherit',
        bgcolor: 'background.default',
        cursor: clickable ? 'pointer' : 'default',
        '&:hover .askOverlay': { opacity: 1 },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '-2px' },
      }}
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt=''
          loading='lazy'
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        // กริดชิดกันแบบ IG ใช้ได้เพราะทุกช่องเป็นรูปที่ขอบตัดกันเอง — สินค้าที่ไม่มีรูปเป็นพื้นเรียบ
        // สีเดียว วางติดกันหลายช่องแล้วกลายเป็นแผ่นเทาผืนเดียว แยกไม่ออกว่ามีกี่ชิ้น จึงตีเส้นในตัว
        // เฉพาะช่องที่ไม่มีรูป (ช่องที่มีรูปไม่ต้อง เดี๋ยวจะเป็นตารางกรอบซึ่งขัดกับที่ตั้งใจ)
        <Box
          sx={{
            inlineSize: '100%',
            blockSize: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#808390',
            boxShadow: 'inset 0 0 0 1px rgb(47 43 61 / .12)',
          }}
        >
          <Icon icon='tabler-photo' fontSize={30} />
        </Box>
      )}

      {/* ไล่เงาล่าง — ให้ราคาสีขาวอ่านออกไม่ว่ารูปสินค้าจะสว่างแค่ไหน (แบบเดียวกับไทล์คลิป) */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg,rgb(0 0 0/.26) 0%,transparent 30%,transparent 55%,rgb(0 0 0/.72) 100%)',
          pointerEvents: 'none',
        }}
      />

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

      {/* ราคาลอยบนรูป — ข้อมูลเดียวที่ผู้ซื้อต้องเห็นก่อนตัดสินใจกด ชื่อสินค้าอยู่ใน title/aria-label */}
      <Box
        sx={{
          position: 'absolute',
          insetBlockEnd: 0,
          insetInlineStart: 0,
          insetInlineEnd: 0,
          p: '8px 10px',
          color: 'white',
          fontSize: '14px',
          fontWeight: 800,
          textAlign: 'start',
          pointerEvents: 'none',
        }}
      >
        {priceLabel}
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
              fontSize: '12.5px',
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
  const L = isRoom
    ? { empty: 'ร้านนี้ยังไม่มีห้องพัก', pinned: 'ห้องพักแนะนำ', all: 'ห้องพักทั้งหมด' }
    : { empty: 'ร้านนี้ยังไม่มีสินค้า', pinned: 'สินค้าปักหมุด', all: 'สินค้าทั้งหมด' }

  if (openShopEmptyState) return null

  return (
    <>
      {!hasAnyProduct ? (
        <Box id='pinned-products' sx={{ px: { xs: '20px', md: '24px' }, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', py: '48px', textAlign: 'center' }}>
          <Icon icon='tabler-photo-off' style={{ fontSize: 48, color: '#808390' }} />
          <Box>
            <Typography sx={{ color: '#808390', fontSize: '14px' }}>{L.empty}</Typography>
            <Typography sx={{ color: '#808390', fontSize: '12px', mt: '4px' }}>ติดตามร้านนี้ไว้ก่อนนะ</Typography>
          </Box>
        </Box>
      ) : (
        <>
          {/* ── สินค้าปักหมุด (Phase 3: pinnedProducts จริงจาก getPinnedProducts — ซ่อนทั้งโซนเมื่อว่าง TFR-PIN-07) ── */}
          {pinnedProducts.length > 0 && (
            <Box id='pinned-products' sx={{ px: { xs: '20px', md: '24px' }, pt: '18px', pb: '16px' }}>
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
                  // มือถือ 3 ต่อแถว เดสก์ท็อป 5 ต่อแถว; ดึงออกนอก padding ให้ชนขอบคอนเทนเนอร์จริง
                  gridTemplateColumns: { xs: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' },
                  gap: 0,
                  mx: { xs: '-20px', md: '-24px' },
                }}
              >
                {pinnedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    pinned
                    shopId={shopId ?? null}
                    isOwnShop={isOwnShop}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* ── สินค้าทั้งหมด (Phase 3: otherProducts = getProductsByShop excludePinned — ซ่อนเมื่อว่าง) ── */}
          {otherProducts.length > 0 && (
            <Box id='all-products' sx={{ px: { xs: '20px', md: '24px' }, pb: '16px' }}>
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
                  // มือถือ 3 ต่อแถว เดสก์ท็อป 5 ต่อแถว; ดึงออกนอก padding ให้ชนขอบคอนเทนเนอร์จริง
                  gridTemplateColumns: { xs: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' },
                  gap: 0,
                  mx: { xs: '-20px', md: '-24px' },
                }}
              >
                {otherProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    pinned={false}
                    shopId={shopId ?? null}
                    isOwnShop={isOwnShop}
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
