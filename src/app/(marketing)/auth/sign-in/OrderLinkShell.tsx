'use client'

/**
 * OrderLinkShell — เชลล์หน้าลิงก์คำสั่งซื้อ (ทิศทาง "หน้าร้าน" ที่ user เลือก 2026-07-25)
 *
 * ทำไมต้องมีเชลล์แยก: ผู้ซื้อกดลิงก์มาจากแชทภายนอกโดยไม่รู้จัก Deep มาก่อน หน้าที่เป็นการ์ด
 * ฟอร์มลอย ๆ บนพื้นเทาทำให้ดูเหมือนหน้าหลอกลวง จึงเปิดด้วยภาพร้านเต็มความกว้างพร้อมหลักฐาน
 * (ระดับการยืนยัน สถิติ ช่องทางที่เชื่อมไว้ รีวิวจริง) ก่อนจะขอให้ล็อกอิน
 *
 * รับ children เป็นเนื้อหาส่วนล่างของ sheet (ปุ่มเลือกช่องทาง / ฟอร์ม) เพื่อให้ SignInCard
 * ถือ handler ทั้งหมดไว้ที่เดิม ไม่ต้อง duplicate logic การ login
 *
 * `compact`: ขั้นที่เป็นฟอร์มยุบ hero ลงเหลือแถบบาง คืนพื้นที่ให้ช่องกรอกแต่ยังคงบริบทว่า
 * กำลังทำรายการกับร้านไหน
 *
 * ไม่มี cover ในฐานข้อมูล (ร้านยังไม่อัปโหลด) → ใช้ logo ขยายเบลอเป็นพื้นหลังแทน ไม่ปล่อยว่าง
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/auth/AuthIllustrationWrapper.tsx
 *   (โครง flex-center เต็มจอ) + @core/components/mui/Avatar.tsx (fallback initials)
 */
import { useState, type ReactNode } from 'react'

import Typography from '@mui/material/Typography'

import { formatDateTH } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import { getTierGradient } from '@/lib/trust-tier'

export type OrderLinkShopContext = {
  publicToken: string
  totalAmount: number
  createdAtIso: string
  shopName: string
  shopUsername: string
  logo: string | null
  coverImage: string | null
  shopCreatedAtIso: string
  /** ใช้เลือกไล่สีปกเมื่อร้านไม่มี cover จริง — service คืนค่านี้มาตั้งแต่แรกแต่ type เดิมไม่มี
   *  ช่องรับ ค่าจึงตกหายที่ขอบนี้มาตลอด (พบตอน ux review 2026-08-08) */
  trustScore: number
  maxVerifyLevel: number
  completedOrders: number | null
  completionRate: number | null
  avgRating: number | null
  reviewCount: number
  channels: { provider: string; name: string; avatarUrl: string | null }[]
  latestReview: { rating: number; comment: string; createdAtIso: string } | null
}

/** ป้ายบอก "ระดับ" ที่ยืนยันถึง ไม่ใช่คำว่ายืนยันแล้วลอย ๆ — ร้านที่ทำแค่ OTP ไม่ควรได้ป้ายเดียวกับ
 *  ร้านที่จดทะเบียนธุรกิจ (L1 = เบอร์ OTP, L2 = เอกสาร, L3 = จดทะเบียนธุรกิจ) */
function verifyBadge(level: number): { label: string; tone: 'gold' | 'green' } | null {
  if (level >= 3) return { label: 'จดทะเบียนธุรกิจแล้ว', tone: 'gold' }
  if (level === 2) return { label: 'ยืนยันเอกสารแล้ว', tone: 'green' }
  if (level === 1) return { label: 'ยืนยันเบอร์แล้ว', tone: 'green' }
  return null
}

function initials(name: string) {
  return name.trim().charAt(0) || '?'
}

function ShopImg({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  // eslint-disable-next-line @next/next/no-img-element -- URL ภายนอก/หลากโดเมน ใช้ img ตาม pattern
  // ShopAvatar เดิม (ChooseShopClient.tsx) ที่ fallback initials เมื่อโหลดรูปไม่ได้
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
}

export default function OrderLinkShell({
  ctx,
  compact = false,
  children,
}: {
  ctx: OrderLinkShopContext
  compact?: boolean
  children: ReactNode
}) {
  const badge = verifyBadge(ctx.maxVerifyLevel)
  const hasStats = ctx.completedOrders != null || ctx.avgRating != null

  return (
    <div className='flex min-bs-[100dvh] justify-center bg-[var(--mui-palette-background-paper)]'>
      <div className='is-full max-is-[480px] flex flex-col'>
        {/* ── HERO ─────────────────────────────────────────────── */}
        {/* ความสูง hero มาจากงบพื้นที่จริง ไม่ใช่ความสวยอย่างเดียว — เครื่องอ้างอิงคือ iPhone
            14 Pro Max (430x932) ซึ่งใน in-app browser ของ Messenger เหลือใช้จริงราว 712px
            หลังหักแถบบน-ล่างของแอป ทุกทางเข้าสู่ระบบต้องอยู่เหนือขอบนั้นโดยไม่ต้องเลื่อน
            240px คือค่าที่ยังให้ภาพร้านเด่นและ CTA ครบสามปุ่มยังอยู่เหนือ fold (วัดด้วย
            getBoundingClientRect จริง ไม่ใช่กะด้วยตา) */}
        {/* min-block-size ไม่ใช่ block-size ตายตัว และเนื้อหาอยู่ใน flow ปกติ (ไม่ absolute):
            ตอนใช้ความสูงตายตัวคู่กับ absolute วัดจริงแล้วบล็อกข้อมูลร้านสูง 249px ล้นกรอบ 240px
            ออกไปด้านบน -9px ซึ่งยังไม่เห็นรอยตัดเฉพาะกับชื่อร้านสั้น ๆ พอชื่อยาวขึ้นอีกบรรทัด
            จะโดน overflow-hidden เฉือนหัวทันที ให้กรอบโตตามเนื้อหาเองปลอดภัยกว่าเดาตัวเลข */}
        <div
          className={`relative overflow-hidden flex flex-col justify-end ${
            compact ? 'min-bs-[132px]' : 'min-bs-[240px]'
          }`}
        >
          {/* ไม่มี cover จริง → ใช้ไล่สีตามระดับความน่าเชื่อถือ ไม่ใช่โลโก้ที่ถูกเบลอ
              เดิมเป็น `logo` + `scale-125 blur-2xl saturate-150` ซึ่งดัน "สีอะไรก็ได้ที่ร้าน
              อัปโหลดมา" ให้อิ่มขึ้นอีก 50% โดยไม่มีการควบคุมเฉด — โลโก้โทนแดงจึงกลายเป็น
              พื้นหลังสีเลือดที่อ่านเป็นคำเตือน บนจอที่ทั้งจอมีไว้สร้างความเชื่อใจก่อนโอนเงิน
              getTierGradient คือ SSOT ที่อีก 3 หน้าใช้เป็น fallback cover อยู่แล้ว
              (/u/[username], /b/[slug], public-profile builder) — ที่นี่เป็นที่เดียวที่แตกแถว */}
          {ctx.coverImage ? (
            <ShopImg
              src={ctx.coverImage}
              alt=''
              className='absolute inset-0 is-full bs-full object-cover'
            />
          ) : (
            <div className='absolute inset-0' style={{ background: getTierGradient(ctx.trustScore) }} />
          )}
          <div
            className='absolute inset-0'
            style={{
              background:
                'linear-gradient(180deg, rgb(15 12 22 / 0.12) 0%, rgb(15 12 22 / 0.5) 52%, rgb(15 12 22 / 0.88) 100%)',
            }}
          />
          {/* pbe-11 (44px) ไม่ใช่ p-5 รอบด้าน: sheet ด้านล่างถูกดึงขึ้นทับ hero 24px (-mbs-6)
              ถ้าเว้นล่างเท่าด้านอื่น บรรทัดสถิติจะโดนแผ่นขาวกินครึ่งตัวอักษร (เจอตอน QA จริง) */}
          {/* relative (อยู่ใน flow) ไม่ใช่ absolute — เพื่อให้กรอบ hero ถูกดันสูงตามเนื้อหาจริง
              pbe-11 (44px) เผื่อ sheet ที่ถูกดึงขึ้นทับ 24px ไม่ให้กินบรรทัดสถิติ */}
          <div className='relative pli-5 pbs-5 pbe-11 text-white'>
            {!compact && (
              <div className='relative is-[62px] bs-[62px] rounded-2xl overflow-hidden border-[3px] border-white/90 flex items-center justify-center bg-primary text-white text-2xl font-extrabold mbe-3'>
                <ShopImg src={ctx.logo} alt={ctx.shopName} className='is-full bs-full object-cover' />
                {!ctx.logo && initials(ctx.shopName)}
              </div>
            )}
            <Typography
              component='h1'
              className={`font-extrabold text-white ${compact ? 'text-lg' : 'text-2xl'}`}
              sx={{ letterSpacing: '-0.025em', lineHeight: 1.2, textShadow: '0 1px 12px rgb(0 0 0 / 0.45)' }}
            >
              {ctx.shopName}
            </Typography>
            <div className='text-[12.5px] opacity-85 mbs-1'>
              {compact
                ? `฿${ctx.totalAmount.toLocaleString('th-TH')}`
                : `@${ctx.shopUsername} · เปิดร้านตั้งแต่ ${formatDateTH(ctx.shopCreatedAtIso)}`}
            </div>

            {!compact && hasStats && (
              <div className='flex gap-5 mbs-3 text-[11.5px]'>
                {ctx.completedOrders != null && (
                  <div>
                    <div className='text-lg font-extrabold tabular-nums'>{ctx.completedOrders}</div>
                    ออเดอร์สำเร็จ
                  </div>
                )}
                {ctx.avgRating != null && (
                  <div>
                    <div className='text-lg font-extrabold tabular-nums'>{ctx.avgRating}</div>
                    จาก {ctx.reviewCount} รีวิว
                  </div>
                )}
                {/* จงใจไม่แสดง "อัตราสำเร็จ" บนจอนี้ (feature 00039 FR-OSM-11) — ต่างจากหน้า
                    โปรไฟล์ร้านที่ยังแสดง เหตุผล: จอนี้เข้าถึงผ่าน in-app browser ของแอปแชท
                    เหลือพื้นที่แนวตั้งจริงราว 712px และผู้อ่านยังไม่รู้จักแพลตฟอร์มเลย จึงตรวจสอบ
                    ตัวเลขไม่ได้อยู่ดี — ตัวเลขที่ตรวจสอบไม่ได้ไม่ช่วยสร้างความเชื่อใจ แต่กินที่ CTA
                    (ผลสำรวจ 14 แพลตฟอร์ม: ไม่มีมาร์เก็ตเพลสเจ้าใดโชว์ %นี้ต่อผู้ซื้อเลย —
                     docs/research/2026-08-08-seller-trust-metrics-benchmark.md)
                    ctx.completionRate ยังถูกส่งมาอยู่ เพราะหน้าอื่นที่ใช้ type เดียวกันยังใช้ */}
              </div>
            )}
          </div>
        </div>

        {/* ── SHEET ────────────────────────────────────────────── */}
        {/* เดิมมีขีดจับ (drag handle) อยู่กลางบนของแผ่นนี้ — ถอดออกแล้ว เพราะแผ่นนี้ลากไม่ได้จริง
            และไม่มีอะไรอยู่ใต้มันให้เผย เป็น affordance ที่สัญญาสิ่งที่ทำไม่ได้ บนจอที่ผู้ใช้กำลัง
            ตัดสินว่าหน้านี้ของจริงหรือของปลอม */}
        <div className='relative -mbs-6 rounded-t-[22px] bg-[var(--mui-palette-background-paper)] p-5 pbe-6 flex-1'>
          {!compact && (
            <>
              {badge && (
                <div className='flex gap-1.5 flex-wrap mbe-3'>
                  <span
                    className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-lg ${
                      badge.tone === 'gold'
                        ? 'bg-warning/15 text-warning'
                        : 'bg-success/15 text-success'
                    }`}
                  >
                    {badge.label}
                  </span>
                </div>
              )}

              {/* ช่องทางที่ร้านเชื่อมไว้ — ผู้ซื้อเพิ่งคุยกับเพจนี้อยู่ในแชทเมื่อครู่
                  ไม่มีช่องทางไหนเชื่อมไว้เลย → ซ่อนทั้งบล็อก ไม่แสดงว่าว่าง */}
              {ctx.channels.length > 0 && (
                <div className='flex flex-col gap-1.5 mbe-3 pbe-3 border-be'>
                  {ctx.channels.map(ch => (
                    <div key={`${ch.provider}-${ch.name}`} className='flex items-center gap-2.5 min-is-0'>
                      <span className='is-[26px] bs-[26px] rounded-lg shrink-0 overflow-hidden flex items-center justify-center bg-primary/10 text-primary text-xs font-bold'>
                        <ShopImg src={ch.avatarUrl} alt='' className='is-full bs-full object-cover' />
                        {!ch.avatarUrl && (ch.provider === 'INSTAGRAM' ? 'IG' : 'f')}
                      </span>
                      <span className='min-is-0'>
                        <span className='block text-[13px] font-semibold truncate'>{ch.name}</span>
                        {/* text.secondary ไม่ใช่ text.disabled — ink ที่ 0.4 ได้คอนทราสต์ ~2.3:1
                            ตก AA (4.5:1) ส่วน 0.7 ได้ ~5.2:1 ผ่าน. นี่คือ "ชนิดของช่องทาง"
                            ซึ่งเป็นข้อมูลจริง ไม่ใช่สถานะปิดใช้งาน จึงไม่ควรอยู่ชั้น disabled
                            (แก้ความเข้ม ไม่แตะเฉด ตาม docs/conventions/contrast-fix-keeps-hue.md) */}
                        <Typography component='span' variant='caption' color='text.secondary' className='block text-[10.5px]'>
                          {ch.provider === 'INSTAGRAM' ? 'Instagram' : 'Facebook Page'}
                        </Typography>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* รีวิวจริงหนึ่งอัน — ข้อความจากคนซื้อจริงน่าเชื่อกว่าค่าเฉลี่ยลอย ๆ
                  ไม่มีรีวิวที่เขียนข้อความ → service คืน null → ซ่อนบล็อก ไม่แต่งคำชมเอง */}
              {ctx.latestReview && (
                <div className='rounded-xl bg-[var(--mui-palette-action-hover)] p-3 mbe-3'>
                  <div className='flex items-center gap-2 mbe-1'>
                    {/* carve-out ของ HR12: typographic dingbat สีเดียว (★) ไม่ใช่ emoji — ตรงกับ
                        รายการยกเว้นใน docs/conventions/no-emoji-use-icons.md */}
                    <span className='text-warning text-xs tracking-widest'>
                      {'★'.repeat(ctx.latestReview.rating)}
                    </span>
                    <span className='text-[10px] font-bold text-success bg-success/15 px-1.5 py-0.5 rounded'>
                      ซื้อจริง
                    </span>
                  </div>
                  <Typography variant='body2' color='text.secondary'>
                    {ctx.latestReview.comment}
                  </Typography>
                </div>
              )}

              <div className='flex justify-between items-baseline'>
                <Typography variant='body2' color='text.secondary'>
                  ยอดที่ต้องชำระ
                </Typography>
                {/* 32px = ขั้น "metric" ที่ DESIGN.md ประกาศไว้สำหรับตัวเลขที่ทำหน้าที่เป็นภาพ
                    (เดิม 29px ไม่มีอยู่ในบันไดใดเลย ทั้งของ Vuexy และของ DESIGN.md) */}
                <span className='text-[32px] font-extrabold tabular-nums' style={{ letterSpacing: '-0.01em' }}>
                  {`฿${ctx.totalAmount.toLocaleString('th-TH')}`}
                </span>
              </div>
              {/* เลขคำสั่งซื้อ + วันที่ = หลักฐานว่าลิงก์นี้ตรงกับใบที่ร้านคุยไว้ในแชท เป็นสิ่งที่
                  ผู้ซื้อต้องเอาไปเทียบจริง จึงต้องอ่านออก — เดิมเป็นตัวอักษรที่จางที่สุดในจอ */}
              <Typography variant='caption' color='text.secondary' className='block mbe-3 tabular-nums'>
                {`${formatOrderNo(ctx.publicToken, ctx.createdAtIso)} · ${formatDateTH(ctx.createdAtIso)}`}
              </Typography>
            </>
          )}

          {children}
        </div>
      </div>
    </div>
  )
}
