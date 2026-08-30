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

import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'


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
  /** หมวด ("ยอดขาย"/"รีวิว"/…) จาก `badgeCategoryLabel` — `null` = เกณฑ์ชนิดที่ยังไม่มีหมวด
   *  ⇒ ไม่แสดงป้ายเลย ไม่ใช่ติดป้ายกลาง ๆ (ดูเหตุผลเต็มที่ `src/lib/badge-criteria.ts`) */
  categoryLabel?: string | null
  /** ISO เพราะข้าม RSC boundary — ห้ามส่ง Date object */
  earnedAtIso?: string | null
}

/** จำนวนเหรียญที่โชว์เป็นรูปซ้อนกัน — เท่ากับของเดิมในหน้าจริง ไม่เปลี่ยนตัวเลขนี้เอง */
/**
 * เดิมซ้อนกัน 3 ใบแบบ IG เพราะแถวนี้เคยอยู่ **กลางหน้าคอลัมน์เดียว** ที่ต้องประหยัดความสูง
 * โครงใหม่ (2026-08-21) ย้ายมาอยู่ในการ์ดคอลัมน์ซ้ายซึ่งกว้าง 255px และมีที่เหลือ —
 * user สั่งว่า "อยากให้แสดงเหรียญ 1-6 เหรียญได้เลย" ⇒ วางเรียงจริงไม่ซ้อนทับ
 *
 * 🛑 6 ไม่ใช่ตัวเลขมั่ว: การ์ดกว้าง 255px − padding 40 = 215px ⇒ เหรียญ 28px + gap 6px
 * ได้ 6 ใบพอดี (6×28 + 5×6 = 198) เหลือที่ให้ตัวนับ "+N" อีกใบโดยไม่ตกบรรทัด
 */
const STACK = 6
/** จำนวนชื่อที่พิมพ์ออกมาเป็นตัวอักษร — ref ของ IG โชว์ 2 ชื่อแล้วยุบที่เหลือ */
const NAMED = 2

/** อาร์ตเวิร์กจริงก่อน แล้วค่อยตกไปไอคอนเส้น — เหรียญ 11/20 ใบในระบบยังไม่มีรูป */
/** ใช้ร่วมกับ `ShopExtraPages.tsx` — กติกา "อาร์ตเวิร์กจริงก่อน แล้วค่อยตกไปไอคอน" ต้องมีที่เดียว */
export function Artwork({ b, size }: { b: HeroBadge; size: number }) {
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
  onOpenPage,
}: {
  badges: HeroBadge[]
  total: number
  /** เปิดหน้าเต็มจอ — 🛑 หน้านั้นอยู่ที่ `ShopExtraPages.tsx` และถูก render โดย `ShopProfile`
   *  ที่เดียว **ไม่ใช่ที่นี่** เพราะไฟล์อ้างอิงรวมหน้าเหรียญกับหน้าเพจไว้เป็นหน้าเดียวที่สลับ
   *  ด้วยแท็บ ⇒ ถ้าแต่ละการ์ดถือ Dialog ของตัวเอง แท็บจะพากันไปไหนไม่ได้ */
  onOpenPage: () => void
}) {

  /* 🛑 ห้ามเรียก `useLockBodyScroll` ที่นี่หรือที่หน้าเต็มจอ — `<Dialog>` ของ MUI ล็อก scroll
     ให้เองอยู่แล้ว และ "เรียกซ้ำไม่เสียหาย" (คำที่เคยเขียนไว้) **ผิด**: MUI จำค่า
     `body.style.overflow` ตอน mount ไว้เพื่อคืนตอนปิด ⇒ ถ้า hook ของเราล็อกไปก่อน MUI จะจำว่า
     ค่าเดิมคือ `hidden` แล้วคืนเป็น hidden หลัง transition จบ ⇒ หน้าเลื่อนไม่ได้จนกว่าจะรีโหลด
     (เกิดจริงบน prod 2026-08-15 — ปิดด้วย `src/__tests__/overlay-scroll-lock-single-owner.test.ts`)
     ตัว `<Dialog>` ย้ายไป `ShopExtraPages.tsx` แล้ว กติกานี้จึงบังคับที่ไฟล์นั้นแทน */

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
        onClick={onOpenPage}
        aria-haspopup='dialog'
        aria-label={`ดูเหรียญทั้งหมดของร้าน ${total} เหรียญ`}
        /* 🛑 เรียง "ลง" ไม่ใช่ "ข้าง" — เหรียญ 6 ใบกินความกว้างเกือบเต็มการ์ด 255px แล้ว
            ถ้าวางคำอธิบายไว้ข้าง ๆ มันจะเหลือที่ ~40px แล้วตกบรรทัดทีละคำจนอ่านไม่ได้
            (user ส่งภาพหน้าจอมาให้ดู 2026-08-21 — เป็นบั๊กที่ผมทำเองตอนขยายจาก 3 เป็น 6 ใบ) */
        className='is-full flex flex-col items-start gap-2 border-0 bg-transparent p-0 cursor-pointer font-[inherit] text-start rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)]'
      >
        {/* 🛑 บรรทัดสรุปอยู่ **บน** แถวเหรียญ (user สั่งสลับ 2026-08-21)
            อ่านจากบนลงล่างได้ "มีกี่ใบ + กดดูได้" ก่อน แล้วค่อยเห็นว่าหน้าตาเป็นยังไง
            ตรงกับลำดับที่คนอ่านจริง — รู้ว่ามีอะไรก่อน แล้วค่อยดูรายละเอียด */}
        {/* 🛑 แยก "จำนวน" กับ "ทางเข้า" ออกคนละฝั่ง ไม่ใช่ต่อกันเป็นประโยคเดียว
            เดิมเขียนติดกันเป็น "เหรียญ 6 ใบ ดูทั้งหมด ›" ซึ่งอ่านเป็นประโยคเดียวที่ไม่รู้เรื่อง
            (user ทัก 2026-08-21 ว่า "text มันยังแปลก ๆ") — สองอย่างนี้คนละหน้าที่:
            ซ้าย = ข้อเท็จจริง · ขวา = สิ่งที่กดได้ · การวางคนละฝั่งบอกความต่างนั้นโดยไม่ต้องใช้คำ */}
        <span className='is-full flex items-center justify-between gap-2'>
          <Typography variant='caption' color='text.secondary' className='tabular-nums'>
            {`เหรียญ ${total} ใบ`}
          </Typography>
          <span className='inline-flex items-center gap-0.5 text-[13px] font-medium text-primary shrink-0'>
            ดูทั้งหมด
            <Icon icon='tabler:chevron-right' width={14} aria-hidden />
          </span>
        </span>

        <span className='flex shrink-0 gap-1 flex-wrap'>
          {badges.slice(0, STACK).map((b) => (
            /* Tooltip ของธีม ไม่ใช่ `title` ของเบราว์เซอร์ — native หน่วง ~1 วินาทีก่อนโผล่
               จน user ทดสอบแล้วนึกว่ายังไม่ได้ทำ (2026-08-21) ตัวนี้ขึ้นทันทีและใช้สไตล์เดียว
               กับ tooltip อื่นทั้งระบบ

               ห่อ <span> ที่มีอยู่แล้ว ไม่ได้เพิ่มชั้น DOM ใหม่ · คลิกยัง bubble ขึ้นไปถึง <button>
               ที่ครอบอยู่ตามเดิม (Tooltip ดักแค่ hover/focus ไม่ได้ preventDefault) */
            <Tooltip key={b.id} title={b.name} arrow enterTouchDelay={0}>
              <span
                className='is-8 bs-8 rounded-full bg-[var(--mui-palette-background-paper)] flex items-center justify-center shrink-0'
                style={{ boxShadow: '0 0 0 1px var(--mui-palette-divider)' }}
              >
                <Artwork b={b} size={30} />
              </span>
            </Tooltip>
          ))}
        </span>

      </button>

      {/* ── หน้าเต็ม: เหรียญทั้งหมดพร้อมเงื่อนไขที่ได้มา ──
             fullScreen ทุก breakpoint โดยตั้งใจ — นี่คือ "หน้า" ไม่ใช่แผงข้อมูล ผู้ใช้เข้ามาเพื่อ
             อ่านรายการยาว ๆ การบีบเป็นโมดัลกลางจอบนเดสก์ท็อปจะได้กล่องที่ต้อง scroll ในกล่องอีกที */}
    </>
  )
}
