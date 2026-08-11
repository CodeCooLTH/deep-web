'use client'

/**
 * ReviewList — รายการรีวิวใต้สรุปคะแนน (แท็บรีวิวของหน้าร้านสาธารณะ)
 *
 * ขยาย 2026-08-11 ตามที่ user สั่ง ("แสดงลูกค้าพร้อม mask ข้อมูลทุกอย่าง, มีเลขออเดอร์,
 * และ review ที่ใส่รูปได้ เหมือน shopee") — เดิมมีแค่ดาว/วันที่/ข้อความ
 *
 * 🛑 ชื่อผู้รีวิวที่เข้ามาถูก **mask มาแล้วจากฝั่งเซิร์ฟเวอร์** (`maskedReviewerName`)
 * component นี้ไม่เคยเห็นค่าดิบ และ **ห้ามเพิ่ม prop ที่รับค่าดิบมา mask ที่นี่** — ค่าที่ข้าม
 * RSC boundary จะถูก serialize ลง flight payload ให้ใครก็อ่านได้จาก view-source
 * (บทเรียนจริง 2026-06-06 — memory feedback_rsc_pii_neutralize_at_source)
 *
 * 🛑 รีวิวทุกใบผูกกับออเดอร์จริงเสมอโดยโครงสร้าง (`Review.orderId @unique` + FK) จึงแสดง
 * เลขออเดอร์ได้โดยไม่ต้องมีด่านตรวจเพิ่ม — เลขนี้คือสิ่งที่ทำให้รีวิวต่างจากคอมเมนต์ทั่วไป
 * บนหน้าที่คนใช้ตัดสินใจโอนเงิน
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile
 *   (stacked divider list) — ตัด Card wrapper ออกเพราะอยู่ใน tab panel ที่มีกรอบอยู่แล้ว
 */
import { useState } from 'react'

import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { formatDateTH } from '@/lib/format-date'
import { SALES_CHANNEL_LOGO } from '@/lib/sales-channel-logo'
import ResponsiveSheet from './ResponsiveSheet'

export type ReviewListItem = {
  id: string
  rating: number
  comment: string | null
  createdAtIso: string
  /** mask มาแล้วจากเซิร์ฟเวอร์ — ไม่ใช่ชื่อจริง (ดูหมายเหตุหัวไฟล์) */
  reviewerName: string
  /** เลขออเดอร์ที่รีวิวนี้ผูกอยู่ */
  orderNo: string
  /** URL รูปแนบ (≤4 ใบ ตาม BR-BOE-19) — แปลงเป็น URL เต็มมาแล้ว */
  images: string[]
  /** ช่องทางที่ซื้อขายกันจริง — resolveOrderSource() มาแล้วจากเซิร์ฟเวอร์ (รูป+badge มาจากแหล่งเดียวกัน) */
  source?: { logoUrl: string | null; channel: string | null }
  /** คำตอบของร้าน — 1 คำตอบต่อ 1 รีวิว */
  shopReply?: string | null
  shopRepliedAtIso?: string | null
}

export default function ReviewList({ items }: { items: ReviewListItem[] }) {
  /* รูปที่กดขยาย — เก็บทั้ง URL ไม่ใช่ index เพราะรายการหลายใบใช้ state ก้อนเดียวกัน
     ถ้าเก็บ index จะกดรูปใบที่ 2 ของรีวิว A แล้วไปเปิดรูปใบที่ 2 ของรีวิว B */
  const [zoomed, setZoomed] = useState<string | null>(null)

  if (items.length === 0) return null

  return (
    <div className='flex flex-col'>
      {items.map((r) => (
        <div key={r.id} className='plb-4 border-be last:border-be-0'>
          {/* ── หัวรีวิว: ชื่อ (mask) + ดาว + วันที่ ── */}
          <div className='flex items-start justify-between gap-3 mbe-1'>
            <div className='min-is-0'>
              <Typography variant='body2' className='font-semibold' color='text.primary'>
                {r.reviewerName}
              </Typography>
              <span className='flex gap-0.5 text-warning mbs-0.5'>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Icon
                    key={i}
                    icon={i <= r.rating ? 'tabler:star-filled' : 'tabler:star'}
                    width={13}
                    className={i <= r.rating ? '' : 'opacity-35'}
                  />
                ))}
              </span>
            </div>
            <Typography variant='caption' color='text.disabled' className='shrink-0'>
              {formatDateTH(r.createdAtIso)}
            </Typography>
          </div>

          {/* ── ข้อความรีวิว = พระเอกของการ์ด ──
              user 2026-08-11 "เน้นข้อความรีวิวครับ" — ขึ้นก่อนบรรทัดเลขออเดอร์ และใหญ่กว่า
              ทุกอย่างในการ์ด (15px สีหลัก) ส่วนเลขออเดอร์/ช่องทางเป็นหลักฐานประกอบที่อยู่ชั้นรอง
              เดิมเลขออเดอร์อยู่ก่อนข้อความ ทำให้สายตาเจอรหัสยาว ๆ ก่อนเจอสิ่งที่ลูกค้าพูดจริง */}
          {r.comment && (
            <Typography sx={{ fontSize: '15px', lineHeight: 1.55 }} color='text.primary' className='mbe-2'>
              {r.comment}
            </Typography>
          )}

          {/* ── หลักฐานว่ารีวิวนี้มาจากการซื้อจริง: ช่องทาง + เลขออเดอร์ ──
              ไม่ใช่ลิงก์ เพราะหน้าออเดอร์เป็นของผู้ซื้อคนนั้น คนอื่นเปิดไม่ได้อยู่แล้ว

              🛑 รูปเพจกับ badge แพลตฟอร์มมาจาก `resolveOrderSource` ตัวเดียวกับหน้า /orders
              ห้ามผสมแหล่ง — `salesChannel` ร้านแก้เองทีหลังได้ ส่วน `shopChannel` คือข้อเท็จจริง
              ตอนสร้างออเดอร์ ผสมกันจะได้ "รูป LINE คู่ badge Facebook" ที่คนดูไม่เชื่ออะไรเลยทั้งคู่ */}
          <div className='flex items-center gap-1.5'>
            {r.source?.logoUrl ? (
              <span className='relative is-[18px] bs-[18px] shrink-0'>
                {/* eslint-disable-next-line @next/next/no-img-element -- รูปเพจจากแพลตฟอร์มภายนอก */}
                <img src={r.source.logoUrl} alt='' className='is-full bs-full rounded-full object-cover' />
                {r.source.channel && SALES_CHANNEL_LOGO[r.source.channel] && (
                  // eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ใน public/
                  <img
                    src={SALES_CHANNEL_LOGO[r.source.channel]}
                    alt=''
                    className='absolute -bottom-0.5 -inline-end-0.5 is-[10px] bs-[10px] rounded-full'
                  />
                )}
              </span>
            ) : r.source?.channel && SALES_CHANNEL_LOGO[r.source.channel] ? (
              // eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ใน public/
              <img src={SALES_CHANNEL_LOGO[r.source.channel]} alt='' className='is-[14px] bs-[14px] shrink-0' />
            ) : null}
            <Typography variant='caption' color='text.disabled' className='tabular-nums'>
              {`คำสั่งซื้อ ${r.orderNo}`}
            </Typography>
          </div>

          {/* ── รูปแนบ (Shopee-style) ── */}
          {r.images.length > 0 && (
            <div className='flex gap-1.5 flex-wrap mbe-1'>
              {r.images.map((src) => (
                <button
                  key={src}
                  type='button'
                  onClick={() => setZoomed(src)}
                  aria-label='ดูรูปในรีวิวขนาดเต็ม'
                  className='is-[72px] bs-[72px] rounded-lg overflow-hidden border-0 p-0 cursor-pointer bg-[var(--mui-palette-action-hover)] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)]'
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก storage หลากโดเมน */}
                  <img src={src} alt='' className='is-full bs-full object-cover' loading='lazy' />
                </button>
              ))}
            </div>
          )}

          {/* ── คำตอบของร้าน ──
              เยื้องเข้าและมีพื้นอ่อน เพื่อให้อ่านออกว่าเป็นคนละเสียงกับผู้รีวิว
              ไม่ใช่ข้อความต่อท้ายของคนเดียวกัน */}
          {r.shopReply && (
            <div className='mbs-2 pli-3 plb-2 rounded-lg bg-[var(--mui-palette-action-hover)]'>
              <div className='flex items-center gap-1.5 mbe-0.5'>
                <Icon icon='tabler:message-reply' width={13} className='text-[var(--mui-palette-text-secondary)]' />
                <Typography variant='caption' color='text.secondary' className='font-semibold'>
                  ร้านตอบกลับ
                </Typography>
                {r.shopRepliedAtIso && (
                  <Typography variant='caption' color='text.disabled'>
                    {formatDateTH(r.shopRepliedAtIso)}
                  </Typography>
                )}
              </div>
              <Typography variant='body2' color='text.primary'>
                {r.shopReply}
              </Typography>
            </div>
          )}
        </div>
      ))}

      {/* ดูรูปเต็ม — ใช้ ResponsiveSheet ตัวเดียวกับแผงอื่นในหน้านี้ (มือถือ = ชีตล่าง, เดสก์ท็อป = โมดัลกลาง) */}
      <ResponsiveSheet
        open={zoomed !== null}
        onClose={() => setZoomed(null)}
        ariaLabel='รูปในรีวิวขนาดเต็ม'
      >
        {zoomed && (
          // eslint-disable-next-line @next/next/no-img-element -- รูปจาก storage หลากโดเมน
          <img src={zoomed} alt='' className='is-full block' style={{ maxBlockSize: '80dvh', objectFit: 'contain' }} />
        )}
      </ResponsiveSheet>
    </div>
  )
}
