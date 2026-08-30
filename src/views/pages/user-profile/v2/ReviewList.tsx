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

/** กางทีละกี่แถวสำหรับรีวิวที่ให้ดาวอย่างเดียว */
const RATING_ONLY_PAGE = 8

/** ดาวแถวเดียว — ใช้ทั้งการ์ดเต็มและแถวกระชับ จะได้ไม่มีสองสไตล์บนจอเดียว */
function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <span className='flex gap-0.5 text-warning shrink-0' aria-label={`${rating} จาก 5 ดาว`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon
          key={i}
          icon={i <= rating ? 'tabler:star-filled' : 'tabler:star'}
          width={size}
          className={i <= rating ? '' : 'opacity-35'}
        />
      ))}
    </span>
  )
}

/**
 * แถวกระชับของรีวิวที่ "ให้ดาวอย่างเดียว" — สูง ~52px เห็นได้ 8–10 อันต่อจอ
 *
 * 🛑 **ยังมีเลขออเดอร์อยู่** — user เคาะไว้เมื่อ 2026-08-21 ว่า "ไม่ลบแต่ทำให้สวยจัดตำแหน่งให้ดี"
 * มันคือสิ่งเดียวที่แยกรีวิวบน Deep ออกจากคอมเมนต์ทั่วไป (รีวิวปลอมทำไม่ได้เพราะต้องผูกออเดอร์จริง)
 * ⇒ ย้ายมาต่อท้ายบรรทัดเดียวกันแบบจาง ๆ แทนที่จะเป็นบรรทัดของตัวเองที่กินพื้นที่เท่าชื่อ
 */
function CompactReviewRow({ r }: { r: ReviewListItem }) {
  return (
    <div className='flex items-center gap-2.5 plb-2 border-be last:border-be-0'>
      {/* อวาตาร์ชุดเดียวกับการ์ดเต็ม แค่เล็กลง — ไม่เปลี่ยนเป็นสีสุ่มตามชื่อ เพราะสีที่ไม่ได้มาจาก
          ข้อมูลจริงคือการตกแต่งที่ปลอมตัวเป็นข้อมูล (และชื่อถูก mask มาแล้ว จะ derive อะไรก็ไม่จริง) */}
      <span
        aria-hidden
        className='is-7 bs-7 rounded-full shrink-0 flex items-center justify-center'
        style={{ background: 'linear-gradient(145deg,#dedce8,#c0bece)', color: '#5b586b' }}
      >
        <Icon icon='tabler:user-filled' width={13} />
      </span>
      <Typography className='text-[12px] font-bold shrink-0' color='text.primary'>
        {r.reviewerName}
      </Typography>
      <Stars rating={r.rating} size={12} />
      {/* ช่องทาง + เลขออเดอร์ — ซ่อนบนจอแคบเพราะแถวเดียวใส่ไม่พอ (ยังอยู่ครบในการ์ดเต็ม) */}
      <span className='hidden sm:flex items-center gap-1 min-is-0'>
        {r.source?.channel && SALES_CHANNEL_LOGO[r.source.channel] && (
          // eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ใน public/
          <img src={SALES_CHANNEL_LOGO[r.source.channel]} alt='' className='is-[11px] bs-[11px] shrink-0' />
        )}
        <Typography className='text-[12px] tabular-nums text-[#aaa8b2] truncate'>{r.orderNo}</Typography>
      </span>
      <Typography className='ml-auto shrink-0 text-[11px] text-[#aaa8b2] whitespace-nowrap'>
        {formatDateTH(r.createdAtIso)}
      </Typography>
    </div>
  )
}

export default function ReviewList({
  items,
  totalCount,
}: {
  items: ReviewListItem[]
  /**
   * จำนวนรีวิวทั้งหมดของร้าน (จาก `profileStats.reviewCount` — ตัวเดียวกับที่กราฟแท่งด้านบนใช้)
   *
   * 🛑 ต้องรับมาเทียบ ไม่ใช่เดาจาก `items.length` — รายการถูก cap ที่ `MAX_PROFILE_REVIEWS`
   * ร้านที่เกินเพดานจะได้หน้าที่กราฟแท่งบอกเลขหนึ่ง แต่ชิปบอกอีกเลขหนึ่ง โดยไม่มีอะไรอธิบาย
   * (เคยเป็นแบบนี้จริงตอน cap = 10: กราฟบอก 21 ชิปบอก 10)
   */
  totalCount?: number
}) {
  /* รูปที่กดขยาย — เก็บทั้ง URL ไม่ใช่ index เพราะรายการหลายใบใช้ state ก้อนเดียวกัน
     ถ้าเก็บ index จะกดรูปใบที่ 2 ของรีวิว A แล้วไปเปิดรูปใบที่ 2 ของรีวิว B */
  const [zoomed, setZoomed] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  /* จำนวนแถว "ให้ดาวอย่างเดียว" ที่กางอยู่ — รีวิวที่มีข้อความไม่ถูกซ่อนเลยไม่ว่ากี่อัน
     (ข้อความคือของที่มีค่าที่สุดในแท็บนี้ ซ่อนไว้หลังปุ่มคือซ่อนเหตุผลที่คนเปิดแท็บนี้มา) */
  const [ratingOnlyShown, setRatingOnlyShown] = useState(RATING_ONLY_PAGE)

  if (items.length === 0) return null

  /**
   * ตัวกรอง (`.review-filters` + `.chip` ของไฟล์อ้างอิง)
   *
   * 🛑 สร้างชิปจาก **ข้อมูลที่มีจริงเท่านั้น** — ดาวที่ไม่มีรีวิวสักใบจะไม่มีชิป
   * ไฟล์อ้างอิงโชว์ครบทุกดาวเพราะร้านตัวอย่างมีครบ แต่ถ้าลอกมาตรง ๆ ร้านที่มีแต่รีวิว 5 ดาว
   * จะได้ชิป "4 ดาว 0 / 3 ดาว 0 / …" เรียงกันเป็นแถว ซึ่งกดแล้วได้หน้าว่าง = ชิปที่มีไว้ทำให้ผิดหวัง
   *
   * "มีรูปภาพ" นับจาก `images.length` ที่เซิร์ฟเวอร์แปลงเป็น URL เต็มมาแล้ว
   */
  const starCounts = new Map<number, number>()
  for (const r of items) starCounts.set(r.rating, (starCounts.get(r.rating) ?? 0) + 1)
  const withImages = items.filter((r) => r.images.length > 0).length

  const chips: { key: string; label: string; match: (r: ReviewListItem) => boolean }[] = [
    { key: 'all', label: `ทั้งหมด ${items.length}`, match: () => true },
    ...[5, 4, 3, 2, 1]
      .filter((star) => (starCounts.get(star) ?? 0) > 0)
      .map((star) => ({
        key: `s${star}`,
        label: `${star} ดาว ${starCounts.get(star)}`,
        match: (r: ReviewListItem) => r.rating === star,
      })),
    ...(withImages > 0
      ? [{ key: 'img', label: `มีรูปภาพ ${withImages}`, match: (r: ReviewListItem) => r.images.length > 0 }]
      : []),
  ]

  const activeChip = chips.find((c) => c.key === filter) ?? chips[0]
  const shown = items.filter(activeChip.match)

  /**
   * 🛑 **แท็บนี้ไม่ใช่ฟีดคอมเมนต์ มันคือรายการให้ดาว** — ข้อมูลจริงบน prod (2026-08-23):
   * ทั้งแพลตฟอร์มมีรีวิว 23 อัน **มีข้อความแค่ 1 อัน** รูป 0 คำตอบร้าน 0
   *
   * เดิมทุกอันถูกจัดหน้าเหมือนกันหมด (บล็อกสูง ~190px + อวาตาร์ 40px) ⇒ จอเต็มไปด้วยแถว
   * หน้าตาเหมือนกันเป๊ะ ชื่อ mask ซ้ำ ๆ อวาตาร์เทาเหมือนกันหมด ซึ่ง **อ่านเป็นรีวิวปลอม** —
   * ตรงข้ามกับสิ่งที่หน้านี้มีไว้เพื่อ (ทำให้คนเชื่อว่าร้านนี้ขายจริง)
   *
   * แยกเป็นสองชนิด: อันที่มี "เนื้อหา" (ข้อความ/รูป/คำตอบร้าน) ได้พื้นที่เต็มและขึ้นก่อน ·
   * อันที่ให้ดาวอย่างเดียวยุบเป็นแถวเดียว เห็นได้หลายอันต่อจอ
   * 🛑 **ไม่ซ่อนอันที่ไม่มีข้อความ** — มันคือหลักฐานว่ามีคนซื้อจริง แค่ไม่ต้องกินพื้นที่เท่ากัน
   */
  const hasContent = (r: ReviewListItem) =>
    Boolean(r.comment?.trim()) || r.images.length > 0 || Boolean(r.shopReply?.trim())
  const detailed = shown.filter(hasContent)
  const ratingOnly = shown.filter((r) => !hasContent(r))
  const ratingOnlyVisible = ratingOnly.slice(0, ratingOnlyShown)

  /* ร้านที่มีรีวิวมากกว่าเพดานที่ดึงมา — ต้องบอก ไม่ใช่เงียบ */
  const truncated = totalCount != null && totalCount > items.length

  return (
    <div className='flex flex-col'>
      {/* ชิปโผล่เมื่อมีอะไรให้กรองจริง ๆ (มากกว่าชิป "ทั้งหมด" ตัวเดียว) — ร้านที่มีรีวิว 5 ดาว
          ล้วนและไม่มีรูปเลย จะได้ชิปแค่ใบเดียวซึ่งกดแล้วไม่เปลี่ยนอะไร จึงไม่ต้องแสดง */}
      {chips.length > 1 && (
        <div className='flex gap-2 flex-wrap plb-[15px] border-be'>
          {chips.map((c) => {
            const on = c.key === activeChip.key
            return (
              <button
                key={c.key}
                type='button'
                onClick={() => setFilter(c.key)}
                aria-pressed={on}
                className={`rounded-full plb-2 pli-3 text-[12px] cursor-pointer min-bs-9 border ${
                  on
                    ? 'font-bold text-primary bg-[var(--mui-palette-primary-lightOpacity)] border-[color:var(--mui-palette-primary-main)]/30'
                    : 'text-[#6f6d79] bg-[var(--mui-palette-background-paper)] border-[#e4e4eb]'
                }`}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      )}

      {detailed.map((r) => (
        /* `.review` ของไฟล์อ้างอิง — กริด 3 คอลัมน์: รูป 42px | เนื้อหา | วันที่
           🛑 ต้องเป็น **กริดจริง** ไม่ใช่เอารูปไปแปะไว้ในแถวหัวข้อแบบ flex (ที่ผมทำรอบก่อน)
           เพราะแบบนั้นข้อความรีวิวจะเริ่มที่ขอบซ้ายสุด **ไม่ตรงแนวกับชื่อ** ซึ่งเป็นจุดที่ user
           ทักว่า "คนคอมเมนต์ไม่เหมือนใน html" (2026-08-21) — ในต้นแบบทุกบรรทัดของเนื้อหา
           อยู่ในคอลัมน์เดียวกันหมด รูปจึงทำหน้าที่เป็นแกนซ้ายให้ทั้งบล็อก
           ≤650px ยุบเหลือ 2 คอลัมน์ แล้ววันที่ตกไปอยู่ใต้ชื่อ (`.review-date { grid-column:2 }`) */
        <div
          key={r.id}
          className='grid gap-3 plb-[18px] border-be last:border-be-0 [grid-template-columns:42px_1fr_auto] max-[650px]:[grid-template-columns:36px_1fr] max-[650px]:gap-2.5'
        >
              {/* `.review-avatar` ของไฟล์อ้างอิง — **วงกลมไล่สีเทา ไม่ใช่รูปจริง** และเป็นแบบนั้นโดยตั้งใจ
                  🛑 ระบบ *มี* `User.avatar` และ `Review.reviewer` ก็ผูกกับ User อยู่ — แต่ query ของหน้านี้
                  เลือกดึงมาแค่ `displayName` แล้วส่งผ่าน `maskedReviewerName()` ก่อนข้าม RSC boundary
                  (ดูคอมเมนต์ในหน้า `/b/[slug]` และ `/u/[username]`) ตามงานปิดช่อง PII รั่วเมื่อ 2026-06-06
                  ⇒ ชื่อถูกปิดเป็น "ค*******" แล้ว ถ้าเอารูปจริงมาวางคู่กันคือทำลายการปิดบังนั้นทันที
                  เพราะรูปโปรไฟล์ระบุตัวตนได้ตรงกว่าชื่อเสียอีก
                  ไอคอนคนข้างในมีไว้ให้อ่านออกว่า "นี่คือคน" ไม่ใช่ก้อนสีลอย ๆ (user ขอ 2026-08-21) */}
              <span
                aria-hidden
                /* 🛑 ไอคอนต้องเป็น "หมึกเข้ม" ไม่ใช่ขาว — รอบแรกผมใส่ `text-white/85` บนไล่สีเทาอ่อน
                   (#dedce8 → #9a98a7) ซึ่งคอนทราสต์แทบเป็นศูนย์ จนมองไม่เห็นว่ามีไอคอนอยู่
                   user ส่งภาพหน้าจอมาให้ดู (2026-08-21) — วัดแล้วขาวบน #dedce8 ได้ ~1.15:1
                   ส่วน #5b586b บนพื้นเดียวกันได้ ~4.9:1 ผ่านเกณฑ์ non-text 3:1 สบาย */
                className='is-10 bs-10 max-[650px]:is-[34px] max-[650px]:bs-[34px] rounded-full shrink-0 flex items-center justify-center'
                style={{ background: 'linear-gradient(145deg,#dedce8,#c0bece)', color: '#5b586b' }}
              >
                <Icon icon='tabler:user-filled' width={19} />
              </span>
          {/* คอลัมน์ 2 — เนื้อหาทั้งหมดอยู่ในนี้ จะได้ตรงแนวกับชื่อทุกบรรทัด */}
          <div className='min-is-0'>
              <Typography className='text-[12px] font-bold' color='text.primary'>
                {r.reviewerName}
              </Typography>
              <span className='flex mbs-0.5'>
                <Stars rating={r.rating} />
              </span>

          {/* ── หลักฐานว่ารีวิวนี้มาจากการซื้อจริง: ช่องทาง + เลขออเดอร์ ──
              user 2026-08-11 สั่งย้ายขึ้นมาไว้บน (เดิมอยู่ใต้ข้อความรีวิว) — บรรทัดนี้ตอบคำถามว่า
              "ใครพูด และซื้อจากไหน" ซึ่งเป็นบริบทที่ต้องรู้ *ก่อน* อ่านสิ่งที่เขาพูด บนหน้าที่ผู้ชม
              กำลังชั่งใจว่าจะเชื่อร้านนี้ไหม — รีวิวที่ไม่รู้ว่ามาจากออเดอร์จริงคือคอมเมนต์ธรรมดา

              ไม่ใช่ลิงก์ เพราะหน้าออเดอร์เป็นของผู้ซื้อคนนั้น คนอื่นเปิดไม่ได้อยู่แล้ว

              🛑 รูปเพจกับ badge แพลตฟอร์มมาจาก `resolveOrderSource` ตัวเดียวกับหน้า /orders
              ห้ามผสมแหล่ง — `salesChannel` ร้านแก้เองทีหลังได้ ส่วน `shopChannel` คือข้อเท็จจริง
              ตอนสร้างออเดอร์ ผสมกันจะได้ "รูป LINE คู่ badge Facebook" ที่คนดูไม่เชื่ออะไรเลยทั้งคู่ */}
          {/* 🛑 **ไม่ลบ** — ไฟล์อ้างอิงไม่มีบรรทัดนี้ แต่มันคือหลักฐานว่ารีวิวผูกกับออเดอร์จริง
              ซึ่งเป็นแก่นของ Deep (รีวิวปลอมทำไม่ได้) ถอดออกเพื่อให้เหมือน ref = ทิ้งจุดขาย
              user เคาะ 2026-08-21: "ไม่ลบแต่ทำให้สวยจัดตำแหน่งให้ดี"
              ⇒ ยุบเป็นบรรทัดเล็กจาง ๆ ใต้ชื่อ ไม่ใช่แถวเต็มที่แย่งน้ำหนักกับข้อความรีวิว */}
          <div className='flex items-center gap-1.5 mbs-1 mbe-2 opacity-80'>
            {r.source?.logoUrl ? (
              <span className='relative is-[15px] bs-[15px] shrink-0'>
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
            <Typography className='text-[12px] tabular-nums text-[#aaa8b2]'>
              {`คำสั่งซื้อ ${r.orderNo}`}
            </Typography>
          </div>

          {/* ── ข้อความรีวิว = พระเอกของการ์ด ──
              user 2026-08-11 "เน้นข้อความรีวิวครับ" — ใหญ่กว่าทุกอย่างในการ์ด (15px สีหลัก)
              บรรทัดช่องทาง/เลขออเดอร์เหนือมันเป็น caption สีจาง จึงยังไม่แย่งสายตาไปจากตัวข้อความ */}
          {r.comment && (
            <Typography sx={{ fontSize: '13px', lineHeight: 1.7, color: '#555361' }} className='mbe-2'>
              {r.comment}
            </Typography>
          )}

          {/* ── รูปแนบ (Shopee-style) ── */}
          {r.images.length > 0 && (
            <div className='flex gap-[7px] flex-wrap mbe-1 mbs-2.5'>
              {r.images.map((src) => (
                <button
                  key={src}
                  type='button'
                  onClick={() => setZoomed(src)}
                  aria-label='ดูรูปในรีวิวขนาดเต็ม'
                  className='is-[68px] bs-[53px] rounded-lg overflow-hidden border-0 p-0 cursor-pointer bg-[var(--mui-palette-action-hover)] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)]'
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
                <Typography variant='caption' color='text.secondary' className='font-medium'>
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
          {/* คอลัมน์ 3 — วันที่ · `align-self:start` ให้ชิดบนเสมอแม้รีวิวจะยาว */}
            <Typography className='self-start shrink-0 text-[11px] text-[#aaa8b2] whitespace-nowrap'>
              {formatDateTH(r.createdAtIso)}
            </Typography>
        </div>
      ))}

      {/* ── รีวิวที่ให้ดาวอย่างเดียว ──
          หัวข้อโผล่เฉพาะเมื่อมีทั้งสองชนิดบนจอ — ร้านที่ไม่มีรีวิวแบบมีข้อความเลย (ซึ่งเป็นเกือบทุกร้าน
          ตอนนี้) จะได้รายการเดียวไม่มีหัวข้อคั่น ไม่ต้องอธิบายอะไรที่ผู้อ่านไม่ได้ถาม */}
      {ratingOnly.length > 0 && (
        <>
          {detailed.length > 0 && (
            <Typography className='text-[12px] text-[#8e8d99] mbs-4 mbe-1'>
              {`รีวิวที่ให้ดาวอย่างเดียว · ${ratingOnly.length} รายการ`}
            </Typography>
          )}
          {ratingOnlyVisible.map((r) => (
            <CompactReviewRow key={r.id} r={r} />
          ))}
          {ratingOnlyShown < ratingOnly.length && (
            <button
              type='button'
              onClick={() => setRatingOnlyShown((n) => n + RATING_ONLY_PAGE)}
              className='mbs-3 is-full min-bs-10 rounded-full border border-[color:var(--mui-palette-divider)] bg-[var(--mui-palette-background-paper)] text-[13px] font-bold text-[#5a5766] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)]'
            >
              {`ดูรีวิวเพิ่ม (อีก ${ratingOnly.length - ratingOnlyShown})`}
            </button>
          )}
        </>
      )}

      {/* 🛑 ร้านที่มีรีวิวมากกว่าเพดานที่ดึงมา **ต้องบอก** — ไม่งั้นกราฟแท่งด้านบนกับจำนวนที่นับได้
          ข้างล่างจะไม่ตรงกันโดยไม่มีอะไรอธิบาย ซึ่งเป็นสิ่งที่หน้านี้เพิ่งแก้ไป
          (docs/conventions/partial-data-must-be-labeled-or-filled.md) */}
      {truncated && (
        <Typography className='text-[12px] text-[#8e8d99] text-center mbs-3'>
          {`แสดง ${items.length} รีวิวล่าสุด จากทั้งหมด ${totalCount}`}
        </Typography>
      )}

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
