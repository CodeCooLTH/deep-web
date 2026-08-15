'use client'

/**
 * BadgeShowcase — เหรียญของร้านบนโปรไฟล์สาธารณะ: แถวสรุปแบบ IG + หน้าเต็ม
 *
 * user สั่ง 3 ข้อต่อกันในรอบเดียว (2026-08-13):
 *   1. "เหรียญมันไปอยู่ข้างล่างนะสิ ก็อยากให้เหรียญเด่นเหมือนกัน (อยากชูฟีเจอร์นี้)"
 *   2. "อยากให้แสดงแบบนี้เหมือน ig เพื่อลดพื้นที่"  ← ref: "Followed by oilssm, tutuux.nx + 26 more"
 *   3. "และค่อยมี more ← กดแล้วไปหน้าเต็ม ๆ ว่า user คนนี้ได้เหรียญอะไรบ้าง"
 *
 * ── ข้อ 1 กับ 2 ขัดกันในตัว และทางออกอยู่ที่ข้อ 3 ──────────────────────
 * "เด่นขึ้น" กับ "กินที่น้อยลง" ไปด้วยกันไม่ได้ถ้าคิดแค่เรื่องขนาด — สิ่งที่ทำให้ทั้งสองอย่างจริง
 * พร้อมกันคือ **ย้ายความเด่นจาก "พื้นที่" ไปเป็น "ตำแหน่ง + ปลายทาง"**: แถวสูงราว 40px แต่
 * อยู่ในโซนหลักฐานใต้บรรทัดยืนยันตัวตน แล้วมีที่ให้ไปดูต่อจริง ๆ
 *
 * ── ข้อ 3 คือส่วนที่ระบบยัง "ไม่เคยมี" ─────────────────────────────────
 * `ProfileHero.tsx` เขียนกำกับไว้เองว่า *"ไม่มีลิงก์ ดูทั้งหมด N → เพราะยังไม่มีปลายทางให้ไป
 * ลิงก์ที่กดแล้วไม่ไปไหนบนหน้าที่ทั้งหน้ามีไว้พิสูจน์ความน่าเชื่อถือ แย่กว่าไม่มีลิงก์"* —
 * แถวสรุปบนมือถือของหน้าจริงจึง **กดไม่ได้มาตลอด** ทั้งที่ `criteriaLabel` + `earnedAtIso`
 * ถูกส่งมาถึงหน้าจอครบแล้ว ⇒ ผู้ใช้มือถือไม่เคยรู้เลยว่าเหรียญแต่ละใบได้มายังไง
 * prototype นี้สร้างปลายทางนั้นขึ้นมา แถวสรุปจึงกดได้เป็นครั้งแรก
 *
 * 🛑 หน้าเต็มนี้ทำเป็น **full-screen overlay** ไม่ใช่ route จริง เพราะ prototype ห้ามเพิ่ม
 * โครงสร้าง route ถาวรลง main — ตอน promote ขึ้นของจริงต้องทำเป็น route
 * (`/u/[username]/badges` + `/b/[slug]/badges` — **สองเส้นเสมอ** หน้าโปรไฟล์สาธารณะมี 2 URL)
 * เพื่อให้แชร์ลิงก์ได้และปุ่ม back ของเบราว์เซอร์ทำงานถูก ซึ่ง overlay ให้ไม่ได้
 */
import { useState } from 'react'

import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'

import { Icon } from '@iconify/react'

import { formatDateTH } from '@/lib/format-date'

/**
 * เหรียญหนึ่งใบตามที่หน้าโปรไฟล์สาธารณะต้องใช้
 *
 * `imageUrl` = artwork จริงจาก backend · `icon` เป็นแค่ fallback เมื่อเหรียญนั้นยังไม่มีรูป
 * (11/20 ใบในระบบยังไม่มี artwork) · `criteriaLabel` มาจาก `Badge.criteria` ที่แปลแล้วฝั่ง server
 * — `null` = เกณฑ์ชนิดที่ยังไม่มีคำแปล ⇒ ไม่แสดงบรรทัดนั้น ไม่ใช่เดาข้อความกลาง ๆ
 */
export type HeroBadge = {
  id: string
  name: string
  nameEN: string
  icon: string
  imageUrl?: string | null
  criteriaLabel?: string | null
  /** ISO เพราะข้าม RSC boundary — ห้ามส่ง Date object */
  earnedAtIso?: string | null
}

/** จำนวนเหรียญที่โชว์เป็นรูปซ้อนกัน — เท่ากับของเดิมในหน้าจริง ไม่เปลี่ยนตัวเลขนี้เอง */
const STACK = 3
/** จำนวนชื่อที่พิมพ์ออกมาเป็นตัวอักษร — ref ของ IG โชว์ 2 ชื่อแล้วยุบที่เหลือ */
const NAMED = 2

/** อาร์ตเวิร์กจริงก่อน แล้วค่อยตกไปไอคอนเส้น — เหรียญ 11/20 ใบในระบบยังไม่มีรูป */
function Artwork({ b, size }: { b: HeroBadge; size: number }) {
  const [failed, setFailed] = useState(false)
  if (b.imageUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- asset ใน public/ + storage หลากโดเมน
      <img
        src={b.imageUrl}
        alt=''
        width={size}
        height={size}
        loading='lazy'
        onError={() => setFailed(true)}
        // contain ไม่ใช่ cover — อาร์ตเวิร์กเป็นรูปเหรียญ/ริบบิ้น cover จะครอปขอบลายทิ้ง
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    )
  }
  return <Icon icon='tabler:medal' width={Math.round(size * 0.6)} className='text-primary' />
}

export default function BadgeShowcase({
  badges,
  total,
  shopName,
}: {
  badges: HeroBadge[]
  total: number
  shopName: string
}) {
  const [pageOpen, setPageOpen] = useState(false)

  /* 🛑 ห้ามเรียก `useLockBodyScroll` ที่นี่ — `<Dialog>` ล็อก scroll ให้เองอยู่แล้ว และ
     "เรียกซ้ำไม่เสียหาย" (คำที่เคยเขียนไว้ตรงนี้) **ผิด**: MUI จำค่า `body.style.overflow`
     ตอน mount ไว้เพื่อคืนตอนปิด ⇒ ถ้า hook ของเราล็อกไปก่อน (effect ของ component แม่รันก่อน
     ตัวล็อกของ Modal) MUI จะจำว่าค่าเดิมคือ `hidden` แล้ว **คืนค่าเป็น hidden หลัง transition
     จบ** ทับ cleanup ของ hook ที่คืนถูกไปแล้ว ⇒ หน้าเลื่อนไม่ได้อีกเลยจนกว่าจะรีโหลด
     (เกิดจริงบน prod 2026-08-15 user เจอเอง — ปิดด้วยเทส
     `src/__tests__/overlay-scroll-lock-single-owner.test.ts`)
     hook นั้นมีไว้สำหรับ overlay ที่ประกอบเองล้วน ๆ เท่านั้น เช่น `ProfileLightbox.tsx`
     — docs/conventions/overlay-scroll-lock.md */

  if (badges.length === 0) return null

  const rest = total - Math.min(NAMED, badges.length)

  return (
    <>
      {/* ── แถวสรุปแบบ IG: รูปซ้อน + ชื่อ 2 ใบ + "อีก N" ──
             สูงราว 40px (ของเดิมที่เป็นกริดชื่อใต้ไอคอนสูงราว 96px)
             🛑 ทั้งแถวเป็นปุ่มเดียว ไม่ใช่เฉพาะคำว่า "อีก N" — คำนั้นสูงราว 18px ซึ่งตกเกณฑ์
             tap target 44px ส่วนทั้งแถวผ่านสบาย และกลุ่มผู้ใช้ตาม PRODUCT.md (ผู้สูงวัย/
             digital-literacy ต่ำ) แตะเป้าใหญ่ง่ายกว่าเสมอ */}
      <button
        type='button'
        onClick={() => setPageOpen(true)}
        aria-haspopup='dialog'
        aria-label={`ดูเหรียญทั้งหมดของร้าน ${total} เหรียญ`}
        className='is-full flex items-center gap-2 min-bs-[44px] border-0 bg-transparent p-0 cursor-pointer font-[inherit] text-start rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)]'
      >
        <span className='flex shrink-0'>
          {badges.slice(0, STACK).map((b, i) => (
            <span
              key={b.id}
              className={`is-7 bs-7 rounded-full bg-[var(--mui-palette-background-paper)] flex items-center justify-center shrink-0 ${i > 0 ? '-mis-2' : ''}`}
              /* วงพื้นขาวคั่นทุกใบ — ref ของ IG ซ้อน "รูปคน" ซึ่งแต่ละใบต่างกันชัด
                 ส่วนเหรียญเราหลายใบเป็นไอคอนเส้นสีเดียวกัน ซ้อนดิบ ๆ จะอ่านเป็นก้อนเดียว */
              style={{ boxShadow: '0 0 0 2px var(--mui-palette-background-paper)', zIndex: STACK - i }}
            >
              <Artwork b={b} size={26} />
            </span>
          ))}
        </span>

        <Typography variant='caption' color='text.secondary' className='min-is-0 flex-1 truncate'>
          {'เหรียญ '}
          <strong className='text-textPrimary font-semibold'>
            {badges.slice(0, NAMED).map((b) => b.name).join(', ')}
          </strong>
          {rest > 0 && (
            /* "อีก N" เป็นสีหลัก = สัญญาณว่ากดได้ (แพตเทิร์นเดียวกับ "เพิ่มเติม" ท้าย bio) */
            <span className='text-primary font-semibold'>{` + อีก ${rest}`}</span>
          )}
        </Typography>

        <Icon icon='tabler:chevron-right' width={16} className='shrink-0 text-[var(--mui-palette-text-disabled)]' />
      </button>

      {/* ── หน้าเต็ม: เหรียญทั้งหมดพร้อมเงื่อนไขที่ได้มา ──
             fullScreen ทุก breakpoint โดยตั้งใจ — นี่คือ "หน้า" ไม่ใช่แผงข้อมูล ผู้ใช้เข้ามาเพื่อ
             อ่านรายการยาว ๆ การบีบเป็นโมดัลกลางจอบนเดสก์ท็อปจะได้กล่องที่ต้อง scroll ในกล่องอีกที */}
      <Dialog fullScreen open={pageOpen} onClose={() => setPageOpen(false)} aria-labelledby='proto-badge-page-title'>
        <div className='flex flex-col bs-full bg-[var(--mui-palette-background-paper)]'>
          {/* หัวแบบหน้า: ปุ่มย้อนกลับซ้าย + ชื่อหน้า — sticky เพราะรายการยาวได้ */}
          <div
            className='sticky inset-block-start-0 z-10 flex items-center gap-2 pli-3 plb-2 border-be bg-[var(--mui-palette-background-paper)]'
            style={{ paddingBlockStart: 'calc(8px + env(safe-area-inset-top))' }}
          >
            {/* IconButton ของธีม — ได้ ripple/โฟกัสริง/ขนาด hit area ตาม `overrides/icon-button.ts` */}
            <IconButton onClick={() => setPageOpen(false)} aria-label='ย้อนกลับ' size='large' className='shrink-0'>
              <Icon icon='tabler:arrow-left' width={22} />
            </IconButton>
            <Typography id='proto-badge-page-title' component='h1' className='text-[18px] font-bold min-is-0 truncate'>
              เหรียญของร้าน
            </Typography>
          </div>

          <div className='flex-1 overflow-y-auto overscroll-contain'>
            <div className='mli-auto max-is-[640px] pli-5 plb-5'>
              <Typography variant='body2' color='text.secondary' className='mbe-1'>
                {shopName}
              </Typography>
              <Typography className='text-[22px] font-extrabold tabular-nums leading-tight' color='text.primary'>
                {`${total} เหรียญ`}
              </Typography>

              {/* 🛑 ประโยคนี้คือสิ่งที่ทำให้เหรียญเป็นหลักฐาน ไม่ใช่ของประดับ — ห้ามตัดทิ้ง
                  DESIGN.md ห้าม "badge ตกแต่งที่ตีความไม่ได้" ไว้ตรงตัว สิ่งที่ทำให้ผ่านข้อห้ามนั้น
                  คือการบอกกลไก: ระบบประเมินเอง (evaluateSellerBadgesForShop) ร้านขอเองไม่ได้ */}
              <Typography variant='body2' color='text.secondary' className='mbs-2 mbe-5 leading-relaxed'>
                เหรียญทั้งหมดนี้ระบบมอบให้เองจากพฤติกรรมจริงของร้าน ร้านขอเองไม่ได้และซื้อไม่ได้
              </Typography>

              <ul className='m-0 p-0 list-none flex flex-col'>
                {badges.map((b) => (
                  <li key={b.id} className='flex items-start gap-3 plb-4 border-be last:border-be-0'>
                    <span className='is-14 bs-14 shrink-0 rounded-full flex items-center justify-center bg-[var(--mui-palette-action-hover)]'>
                      <Artwork b={b} size={40} />
                    </span>
                    <div className='min-is-0 flex-1'>
                      <Typography className='text-[15px] font-semibold leading-snug' color='text.primary'>
                        {b.name}
                      </Typography>
                      {/* เงื่อนไขที่ได้มา = คำตอบของ "ทำไมเหรียญนี้ถึงมีความหมาย"
                          null = เกณฑ์ชนิดที่ยังไม่มีคำแปล → ไม่แสดงบรรทัด ไม่ใช่เดาข้อความกลาง ๆ */}
                      {b.criteriaLabel && (
                        <Typography variant='body2' color='text.secondary' className='mbs-0.5 leading-snug'>
                          {b.criteriaLabel}
                        </Typography>
                      )}
                      {b.earnedAtIso && (
                        <Typography variant='caption' color='text.disabled' className='block mbs-1'>
                          {`ได้รับเมื่อ ${formatDateTH(b.earnedAtIso)}`}
                        </Typography>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* จำนวนที่ส่งมาแสดงอาจน้อยกว่า total (hero cap ไว้) — ต้องบอก ไม่ใช่เงียบ
                  ผู้ใช้ที่นับแล้วไม่ตรงกับหัวข้อจะเลิกเชื่อตัวเลขทั้งหน้า */}
              {badges.length < total && (
                <Typography variant='caption' color='text.disabled' className='block mbs-4'>
                  {`แสดง ${badges.length} จาก ${total} เหรียญ`}
                </Typography>
              )}
            </div>
          </div>
        </div>
      </Dialog>
    </>
  )
}
