'use client'

/**
 * ProductLightbox — เนื้อในของ lightbox สำหรับ "สินค้า" (เปลือกคือ `ProfileLightbox`)
 *
 * แผงขวาตัดจากภาพ IG ที่ user ส่งมา 6 อย่าง เพราะ **ไม่มีของจริงรองรับ** ไม่ใช่เพราะทำไม่ทัน:
 *   Follow (ปุ่มติดตามในระบบเรายัง disabled "เร็ว ๆ นี้" อยู่แล้ว) · เมนู ⋯ · รายการคอมเมนต์
 *   (`Review` ผูกกับ `Order` แบบ 1:1 ไม่ได้ผูกกับสินค้า จึงไม่มีคอมเมนต์รายสินค้าให้แสดง) ·
 *   แชร์ · บันทึก · ช่องพิมพ์คอมเมนต์
 * เอา element ที่ไม่มีข้อมูลจริงมาวางบนหน้าที่ทั้งหน้ามีไว้พิสูจน์ความน่าเชื่อถือ = ทำสิ่งที่
 * ตรงข้ามกับหน้าที่ของมันเอง
 *
 * 🛑 **CTA "สอบถามสินค้านี้" ไม่ใช่ของแถม** — ก่อนหน้านี้ *ทั้งไทล์* คือปุ่มทักแชท พอเปลี่ยน
 * ให้ไทล์เปิด lightbox แทน ทางเข้าเดิมหายทันที ปุ่มนี้คือทางเข้าที่ย้ายมา ไม่ใช่ปุ่มใหม่
 * (คลาสเดียวกับ `docs/conventions/seller-action-placement.md` §5.1)
 *
 * Base: src/views/pages/user-profile/profile/index.tsx (ProductCard — ราคา/ยอดขาย/ปุ่มถูกใจ/handleAskClick)
 *   + src/app/(paces)/seller/(dashboard)/reviews/components/ReviewImageGallery.tsx (จุดบอกตำแหน่งรูป)
 */
import { useState } from 'react'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { toFileUrl } from '@/lib/file-url'

import ProfileLightbox from './ProfileLightbox'
import ProductLikeButton from './ProductLikeButton'

export type LightboxProduct = {
  id: string
  name: string
  price: string
  images: string[]
  soldCount: number
  shortDescription?: string | null
  pinned: boolean
}

/**
 * แถบรูปย่อยของสินค้าใบเดียว
 *
 * 🛑 **ไม่ยึดปุ่มลูกศรซ้ำ** — ‹ › (ทั้งเมาส์และคีย์บอร์ด) แปลว่า "ข้ามไปสินค้าใบถัดไป" อย่างเดียว
 * ถ้าให้มันสลับความหมายตามว่าสินค้าใบนี้มีกี่รูป ผู้ใช้จะกดแล้วไม่รู้ว่าจะได้อะไร
 * รูปย่อยจึงใช้กลไกคนละตัว: แตะโซนซ้าย/ขวาของตัวรูป (ข้างละ 40% เว้นกลาง 20% ไว้ให้ดูรูปเฉย ๆ)
 * + จุดบอกตำแหน่งที่เป็น `<button>` จริง (Tab ไปแล้ว Enter ได้)
 *
 * 🛑 carousel ไม่แตะ URL และไม่เข้าประวัติ — เปลือกไม่รู้จักคำว่า "รูปย่อย" เลย
 * (ถ้าเข้าประวัติ ผู้ใช้ที่ดูรูปที่ 4 แล้วกด back จะต้องกด 4 ครั้งกว่าจะปิด lightbox)
 */
/* 🛑 ผู้เรียกต้องส่ง `key={product.id}` — การกลับไปรูปแรกตอนเปลี่ยนสินค้าทำด้วยการ remount
   ไม่ใช่ `useEffect(() => setI(0), [images])` ที่เขียนไว้รอบแรก · setState ใน effect ทำให้เกิด
   render ซ้อน (eslint `react-hooks/set-state-in-effect` จับได้) และมีหนึ่งเฟรมที่ index ยังชี้
   รูปของสินค้าใบก่อน ⇒ ใบถัดไปที่มีรูปน้อยกว่าจะแวบเป็นจอว่างก่อนเด้งกลับ */
function ProductMedia({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0)

  const many = images.length > 1
  const src = toFileUrl(images[i] ?? null)

  const go = (dir: -1 | 1) => setI((c) => Math.min(images.length - 1, Math.max(0, c + dir)))

  return (
    <Box sx={{ position: 'relative', inlineSize: '100%', blockSize: '100%', display: 'flex' }}>
      <Box
        sx={{
          position: 'relative',
          inlineSize: '100%',
          // มือถือ: ล็อกสัดส่วน 3/4 เท่าไทล์ในกริด ผู้ใช้จะได้ไม่รู้สึกว่ารูป "เปลี่ยนทรง" ตอนกด
          // เดสก์ท็อป: ปล่อยให้สูงเท่ากล่อง แล้วให้ object-contain จัดการ
          aspectRatio: { xs: '3/4', md: 'auto' },
          minBlockSize: { md: 420 },
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- รูปสินค้ามาจากหลายโดเมนที่ next/image config ไม่ครอบ
          <img
            src={src}
            alt={`${name} รูปที่ ${i + 1}`}
            /* object-contain ไม่ใช่ cover — จุดทั้งหมดของ lightbox คือ "ดูของเต็ม ๆ"
               ไทล์ในกริดครอปอยู่แล้ว (3:4 + cover) ถ้าที่นี่ครอปอีกก็ไม่มีเหตุผลให้เปิด */
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              color: 'rgb(255 255 255 / .45)',
            }}
          >
            <Icon icon='tabler-photo' fontSize={44} />
          </Box>
        )}

        {/* โซนแตะซ้าย/ขวา — มีเฉพาะเมื่อมีรูปมากกว่าใบเดียว
            สินค้ารูปเดียวไม่มีทั้งโซนแตะ ไม่มีจุด และไม่มีแม้ cursor:pointer (ไม่หลอกว่ากดได้) */}
        {many && (
          <>
            <Box
              component='button'
              type='button'
              onClick={() => go(-1)}
              disabled={i === 0}
              aria-label='รูปก่อนหน้า'
              sx={{
                position: 'absolute',
                insetBlock: 0,
                insetInlineStart: 0,
                inlineSize: '40%',
                border: 0,
                background: 'transparent',
                cursor: i === 0 ? 'default' : 'pointer',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'common.white', outlineOffset: -4 },
              }}
            />
            <Box
              component='button'
              type='button'
              onClick={() => go(1)}
              disabled={i === images.length - 1}
              aria-label='รูปถัดไป'
              sx={{
                position: 'absolute',
                insetBlock: 0,
                insetInlineEnd: 0,
                inlineSize: '40%',
                border: 0,
                background: 'transparent',
                cursor: i === images.length - 1 ? 'default' : 'pointer',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'common.white', outlineOffset: -4 },
              }}
            />
          </>
        )}
      </Box>

      {many && (
        <Box
          sx={{
            position: 'absolute',
            insetBlockEnd: 10,
            insetInline: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          {images.map((img, n) => (
            <Box
              key={img}
              component='button'
              type='button'
              onClick={() => setI(n)}
              aria-label={`ดูรูปที่ ${n + 1}`}
              aria-current={n === i}
              sx={{
                position: 'relative',
                inlineSize: 7,
                blockSize: 7,
                p: 0,
                border: 0,
                borderRadius: '999px',
                cursor: 'pointer',
                bgcolor: n === i ? 'common.white' : 'rgb(255 255 255 / .42)',
                // พื้นที่แตะ 44px โดยไม่ขยายจุดที่ตาเห็น (แพตเทิร์นเดียวกับปุ่มถูกใจบนไทล์)
                '&::after': { content: '""', position: 'absolute', inset: '-18px' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'common.white', outlineOffset: 3 },
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

export default function ProductLightbox({
  products,
  index,
  onIndexChange,
  onClose,
  shopId,
  isOwnShop,
  shopName,
  shopAvatar,
  soldLabel,
  soldUnit,
  likeOf,
  onLikeChange,
}: {
  products: LightboxProduct[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
  shopId: string | null
  isOwnShop?: boolean
  shopName: string
  shopAvatar: string | null
  soldLabel: string
  soldUnit: string
  /** สถานะถูกใจถือไว้ที่ผู้เรียก — ไทล์กับแผงต้องอ่านจากที่เดียวกัน ไม่งั้นปิดกลับมาเลขไม่ตรง */
  likeOf: (productId: string) => { liked: boolean; count: number }
  onLikeChange: (productId: string, next: { liked: boolean; count: number }) => void
}) {
  const router = useRouter()
  const { status: sessionStatus } = useSession()

  const product = products[index]
  if (!product) return null

  const price = parseFloat(product.price)
  const priceLabel = `฿${
    isNaN(price) ? product.price : price.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }`

  // ทางเข้าเดิมของไทล์ ย้ายมาเป็นปุ่มในแผง — ตรรกะยกมาทั้งก้อนจาก ProductCard.handleAskClick
  const canAsk = Boolean(shopId) && !isOwnShop
  const handleAsk = () => {
    if (!shopId) return
    const target = `/messages/${shopId}?productId=${product.id}`
    if (sessionStatus !== 'authenticated') {
      router.push(`/auth/sign-in?callbackUrl=${encodeURIComponent(target)}`)
      return
    }
    router.push(target)
  }

  const like = likeOf(product.id)

  return (
    <ProfileLightbox
      open
      onClose={onClose}
      onPrev={index > 0 ? () => onIndexChange(index - 1) : undefined}
      onNext={index < products.length - 1 ? () => onIndexChange(index + 1) : undefined}
      index={index + 1}
      total={products.length}
      ariaLabel={product.name}
      mediaSlot={<ProductMedia key={product.id} images={product.images} name={product.name} />}
      panelSlot={
        <Box sx={{ display: 'flex', flexDirection: 'column', blockSize: '100%' }}>
          {/* ── ร้าน ── ไม่ใช่ลิงก์: ผู้ใช้อยู่บนหน้าร้านนั้นอยู่แล้ว ลิงก์กลับมาที่เดิมคือลิงก์หลอก */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box
              sx={{
                inlineSize: 32,
                blockSize: 32,
                borderRadius: '50%',
                overflow: 'hidden',
                flex: 'none',
                bgcolor: 'action.hover',
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.8125rem',
                fontWeight: 800,
                color: 'text.disabled',
              }}
            >
              {shopAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shopAvatar} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                shopName.slice(0, 1)
              )}
            </Box>
            <Typography variant='body2' sx={{ fontWeight: 700, minInlineSize: 0 }} noWrap>
              {shopName}
            </Typography>
            {product.pinned && (
              <Box
                component='span'
                sx={{
                  ml: 'auto',
                  flex: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  borderRadius: '999px',
                  px: '8px',
                  py: '2px',
                }}
              >
                <Icon icon='tabler-pin-filled' fontSize={12} />
                ปักหมุด
              </Box>
            )}
          </Box>

          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minBlockSize: 0 }}>
            <Typography variant='h5' sx={{ fontWeight: 700 }}>
              {product.name}
            </Typography>

            {product.shortDescription && (
              <Typography variant='body2' color='text.secondary'>
                {product.shortDescription}
              </Typography>
            )}

            {/* ราคาเด่นที่สุดในแผง — 22px/800 คือขั้น **Metric** ของ ramp (DESIGN.md §Metric)
                ไม่ใช่ขั้นข้อความ เพราะเป็นตัวเลขที่ทำหน้าที่เป็นภาพ ไม่ใช่ประโยค */}
            <Typography
              component='p'
              sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums', mt: 0.5 }}
            >
              {priceLabel}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5, minBlockSize: 34 }}>
              {/* ปุ่มถูกใจตัวเดียวกับบนไทล์ แต่สถานะถือไว้ที่ผู้เรียก — กดในแผงแล้วปิดกลับมา
                  ไทล์ต้องขึ้นเลขใหม่ทันที ไม่ใช่ค้างเลขเก่าจนกว่าจะรีโหลดหน้า */}
              <ProductLikeButton
                productId={product.id}
                liked={like.liked}
                count={like.count}
                onChange={(next) => onLikeChange(product.id, next)}
                variant='inline'
              />
              {product.soldCount > 0 && (
                <Typography variant='body2' color='text.secondary' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  <Icon icon='tabler-shopping-bag-check' fontSize={15} />
                  {`${soldLabel} ${product.soldCount.toLocaleString('th-TH')} ${soldUnit}`}
                </Typography>
              )}
            </Box>
          </Box>

          {/* CTA ติดขอบล่างของแผง — บนมือถือแผงอยู่ใต้รูปซึ่งอาจต้องเลื่อน ปุ่มจึง sticky
              ไม่ใช่ fixed: มันเป็นของ "แผง" ไม่ใช่ของจอ (จอมีปุ่มปิดกับลูกศรเป็น chrome อยู่แล้ว) */}
          {canAsk && (
            <Box
              sx={{
                position: 'sticky',
                insetBlockEnd: 0,
                p: 2,
                bgcolor: 'background.paper',
                borderTop: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Button fullWidth variant='contained' startIcon={<Icon icon='tabler-message-circle' fontSize={18} />} onClick={handleAsk}>
                สอบถามสินค้านี้
              </Button>
            </Box>
          )}
        </Box>
      }
    />
  )
}
