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

export type OrderLinkShopContext = {
  publicToken: string
  totalAmount: number
  createdAtIso: string
  shopName: string
  shopUsername: string
  logo: string | null
  coverImage: string | null
  shopCreatedAtIso: string
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
  const bg = ctx.coverImage ?? ctx.logo

  return (
    <div className='flex min-bs-[100dvh] justify-center bg-[var(--mui-palette-background-paper)]'>
      <div className='is-full max-is-[480px] flex flex-col'>
        {/* ── HERO ─────────────────────────────────────────────── */}
        <div className={`relative overflow-hidden ${compact ? 'bs-[132px]' : 'bs-[268px]'}`}>
          {bg ? (
            <ShopImg
              src={bg}
              alt=''
              className={`absolute inset-0 is-full bs-full object-cover ${
                // ไม่มี cover จริง → ใช้ logo ขยายเบลอ ให้ได้พื้นหลังที่ยังเป็นสีของร้านเอง
                ctx.coverImage ? '' : 'scale-125 blur-2xl saturate-150'
              }`}
            />
          ) : (
            <div className='absolute inset-0 bg-primary' />
          )}
          <div
            className='absolute inset-0'
            style={{
              background:
                'linear-gradient(180deg, rgb(15 12 22 / 0.12) 0%, rgb(15 12 22 / 0.5) 52%, rgb(15 12 22 / 0.88) 100%)',
            }}
          />
          <div className='absolute bottom-0 inline-start-0 inline-end-0 p-5 text-white'>
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
                {ctx.completionRate != null && (
                  <div>
                    <div className='text-lg font-extrabold tabular-nums'>{ctx.completionRate}%</div>
                    อัตราสำเร็จ
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── SHEET ────────────────────────────────────────────── */}
        <div className='relative -mbs-6 rounded-t-[22px] bg-[var(--mui-palette-background-paper)] p-5 pbe-6 flex-1'>
          <div className='is-[38px] bs-1 rounded bg-[var(--mui-palette-divider)] mli-auto mbe-4' />

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
                <div className='flex flex-col gap-2 mbe-4 pbe-4 border-be'>
                  {ctx.channels.map(ch => (
                    <div key={`${ch.provider}-${ch.name}`} className='flex items-center gap-2.5 min-is-0'>
                      <span className='is-[26px] bs-[26px] rounded-lg shrink-0 overflow-hidden flex items-center justify-center bg-primary/10 text-primary text-xs font-bold'>
                        <ShopImg src={ch.avatarUrl} alt='' className='is-full bs-full object-cover' />
                        {!ch.avatarUrl && (ch.provider === 'INSTAGRAM' ? 'IG' : 'f')}
                      </span>
                      <span className='min-is-0'>
                        <span className='block text-[13px] font-semibold truncate'>{ch.name}</span>
                        <Typography component='span' variant='caption' color='text.disabled' className='block text-[10.5px]'>
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
                <div className='rounded-xl bg-[var(--mui-palette-action-hover)] p-3 mbe-4'>
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
                <Typography variant='body2' color='text.disabled'>
                  ยอดที่ต้องชำระ
                </Typography>
                <span className='text-[29px] font-extrabold tabular-nums' style={{ letterSpacing: '-0.03em' }}>
                  {`฿${ctx.totalAmount.toLocaleString('th-TH')}`}
                </span>
              </div>
              <Typography variant='caption' color='text.disabled' className='block mbe-4 tabular-nums'>
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
