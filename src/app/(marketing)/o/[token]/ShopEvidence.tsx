'use client'

/**
 * ShopEvidence — หลักฐานของร้านใต้หัวโปรไฟล์บนหน้าออเดอร์ `/o/[token]` (ใช้ร่วมทั้ง 2 จอ)
 *
 * ตอบคำถาม 2 ข้อที่คนได้ลิงก์ออเดอร์จากแชทถามจริง ๆ ก่อนจะยอมกดอะไร:
 *   1. "ร้านนี้เคยขายจริงไหม" → ออเดอร์สำเร็จ + คะแนนรีวิว
 *   2. "นี่ร้านเดียวกับที่เพิ่งคุยด้วยไหม" → เพจที่ร้านเชื่อมไว้ผ่าน OAuth (ปลอมชื่อไม่ได้)
 *
 * 🛑 **ต้องเห็นทั้งก่อนและหลังล็อกอิน** (user 2026-08-11 "ต้องเห็นทั้งคู่ครับ") — เดิมบล็อกนี้
 * มีเฉพาะจอ guest ⇒ ผู้ซื้อที่ล็อกอินเสร็จ *เสีย* หลักฐานที่เพิ่งเห็นเมื่อ 10 วินาทีก่อนไป
 * ทั้งชุด ทั้งที่เป็นวินาทีที่กำลังจะกดปุ่มที่ย้อนไม่ได้
 *
 * 🛑 `null` ไม่ใช่ `0` — 0 แปลว่า "นับแล้วได้ศูนย์" ซึ่งเป็นข้อเท็จจริงที่ต้องบอก แต่เราเลือก
 * ไม่แสดงช่องนั้นเลยเมื่อยังไม่มีประวัติ (ไม่ประจานร้านใหม่ด้วยเลข 0 ตัวโต) เกณฑ์นี้ถูกตัดสิน
 * ที่ `page.tsx` แล้วทั้งสอง branch ด้วยเงื่อนไขเดียวกัน — ที่นี่แค่เคารพมัน
 *
 * ไม่ทำเป็นการ์ดแยกและไม่มี eyebrow: ไหลต่อในบล็อกหัวร้านเพื่อไม่ให้แข่งความสำคัญกับการ์ด
 * ออเดอร์ (DESIGN.md ระบุ "eyebrow เหนือทุก section" เป็น anti-reference ตรงตัว)
 *
 * Base: src/app/(marketing)/o/[token]/GuestOrderView.tsx (บล็อกสถิติเดิม)
 *   + src/views/pages/user-profile/v2/OfficialChannels.tsx (ChannelStrip — แถวช่องทางของหน้าโปรไฟล์)
 */
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

import { ChannelStrip, type OfficialChannel } from '@/views/pages/user-profile/v2/OfficialChannels'
import { Icon } from '@iconify/react'

import { infoBoxSx } from './card-padding'
import { ORDER_TWO_COL_MQ } from './content-width'

export type ShopEvidenceData = {
  completedOrders: number | null
  avgRating: number | null
  reviewCount: number
  channels: OfficialChannel[]
  /**
   * ช่องทาง+ชื่อเพจที่ออเดอร์ใบนี้เกิดขึ้น — ส่งต่อให้ `ChannelStrip` ติดป้าย "คุยกันที่นี่"
   * แทนบรรทัด "จากการคุยที่ …" ที่เคยลอยท้ายการ์ดแล้วพิมพ์ชื่อเพจซ้ำอีกรอบ
   */
  originChannel?: { provider: string; name: string | null } | null
}

/** เส้นคั่นบนของแต่ละแถบย่อย — ใช้ซ้ำ 2 ที่ในไฟล์นี้เท่านั้น ไม่ยกขึ้นเป็น token */
const dividedBlock = { mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' } as const

/**
 * ผิวของกล่องสถิติบนจอกว้าง — ม็อกอัพใช้ `background:#F8F7FB; border:1px solid #F0EEF5`
 * ⇒ แปลงเป็น token ของธีมเรา (`action.hover` + `divider`) ห้าม hardcode hex
 * มือถือไม่ได้ผิวนี้ (คีย์อยู่ใต้ media query) จึงเป็นตัวเลขลอยเหมือนเดิมทุกพิกเซล
 */
/**
 * แผ่นไอคอนหน้าตัวเลข (`.stat-icon` ของม็อกอัพ: 34px · รัศมี 11 · พื้นม่วงจาง)
 * โผล่เฉพาะจอกว้าง — บนมือถือกล่องแคบเกินกว่าจะใส่ไอคอนโดยไม่เบียดตัวเลข
 */
const statIcon = {
  display: 'none',
  [ORDER_TWO_COL_MQ]: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: 34,
    height: 34,
    /* แผ่นไอคอนเล็กกว่ากล่องที่ครอบ ⇒ รัศมีต้องเล็กกว่าด้วย (9px < 12px)
       ไม่งั้นมุมของไอคอนจะโค้งกว่ามุมของกล่อง ซึ่งอ่านเป็นของคนละชุด */
    borderRadius: 1.5,
    bgcolor: 'primary.lightOpacity',
    color: 'primary.main',
  },
} as const

const metricBox = {
  [ORDER_TWO_COL_MQ]: {
    /* ม็อกอัพใช้ `linear-gradient(#fff,#fbfbfe)` = ขาวเกือบล้วน ⇒ ใช้ผิวการ์ดของธีมตรง ๆ
       (ห้าม hardcode hex — HR1) แล้วให้ "ขอบ" เป็นตัวแยกกล่องแทนพื้นเทา */
    bgcolor: 'background.paper',
    /* 🛑 12px = ค่าที่หน้านี้ใช้อยู่แล้ว **15 จุด** — ของเดิมผมตั้ง 21px ซึ่งไม่มีใครใช้เลย
       และ **กลมกว่าการ์ดที่ครอบมัน (6px) ถึง 3.5 เท่า** ⇒ กล่องข้างในดูลอยไม่เข้าชุดกับกล่องนอก
       (วัดจากเบราว์เซอร์จริง 2026-08-30) · รัศมีเป็นภาษาที่ต้องพูดเหมือนกันทั้งหน้า */
    borderRadius: 2,
    border: '1px solid',
    borderColor: 'divider',
    minHeight: 74,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    textAlign: 'left',
    ...infoBoxSx,
  },
} as const

export function ShopStats({
  completedOrders,
  avgRating,
  reviewCount,
}: Omit<ShopEvidenceData, 'channels' | 'originChannel'>) {
  const hasStats = completedOrders != null || avgRating != null
  /**
   * 🛑 จำนวนคอลัมน์ต้องผันตาม **จำนวนสถิติที่มีจริง** ไม่ใช่ตรึงไว้ 2
   *
   * ร้านที่ยังไม่มีรีวิว (`avgRating === null`) มีสถิติช่องเดียว — กริด 2 คอลัมน์ยังจองที่
   * ให้ช่องที่ไม่มีอยู่ ⇒ กล่องไปกองอยู่ครึ่งซ้าย เหลือที่ว่างครึ่งขวาเปล่า ๆ
   * (หัวหน้าเห็นบนจอจริง 2026-08-29 — ร้าน 180 ออเดอร์ 0 รีวิว)
   *
   * เป็นบั๊กที่เกิดตอนเปลี่ยนจาก "แถวเดียวจัดกลาง" มาเป็นกริด: แถวเดียวยุบเองได้
   * แต่กริดไม่ยุบ · ม็อกอัพไม่ได้ครอบเคสนี้เพราะข้อมูลตัวอย่างมีครบสองช่องเสมอ
   *
   * ช่องเดียว → คุมกว้างเท่าครึ่งหนึ่งของสองช่อง แล้วจัดกลาง จะได้ไม่ยืดเป็นแถบยาว
   */
  const statCount = (completedOrders != null ? 1 : 0) + (avgRating != null ? 1 : 0)

  if (!hasStats) return null

  return (
    /**
     * ── สถิติร้าน — โครงตามม็อกอัพ `deep-full-order-page-refined.html` (`.stats`/`.stat`) ──
     *
     * ม็อกอัพเปลี่ยนจาก "ตัวเลขบนป้ายล่าง" เป็น **ไอคอน + ตัวเลข/ป้าย เรียงแนวนอน**
     * `width:min(600px,100%)` · 2 คอลัมน์ · `min-height:74px` · ขอบ + รัศมี 14
     *
     * มือถือ: แถวเดียวจัดกลางมีเส้นคั่น (ของเดิม ไม่แตะ — WebView ใช้จอนี้)
     */
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'stretch',
        gap: 3,
        ...dividedBlock,
        [ORDER_TWO_COL_MQ]: {
          /* 🛑 เส้นคั่นมีหน้าที่เฉพาะตอนสถิติเป็น "ตัวเลขลอย" (มือถือ) —
             พอกลายเป็นกล่องมีขอบแล้ว ขอบของกล่องแยกบล็อกให้เองเรียบร้อย
             เส้นที่เหลืออยู่กลายเป็นขีดซ้ำซ้อนคร่อมบนล่าง (หัวหน้าสั่งเอาออก 2026-08-30) */
          borderTop: 'none',
          pt: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${statCount}, minmax(0, 1fr))`,
          gap: 2.5,
          maxWidth: statCount > 1 ? 600 : 295,
          marginInline: 'auto',
          width: '100%',
        },
      }}
    >
      {completedOrders != null && (
        <Box sx={{ textAlign: 'center', ...metricBox }}>
          <Box sx={statIcon} aria-hidden='true'>
            <Icon icon='tabler-circle-check' fontSize={19} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant='h6'
              sx={{
                /* DESIGN.md §Metric — ตัวเลขที่ทำหน้าที่เป็นภาพ: 800 @ 32/22/20px
                   + tabular-nums + letter-spacing ติดลบ · เดิมยืม variant='h6' (15px)
                   มาแล้วดัน 800 ทับ ⇒ กลายเป็น 800 บน "ข้อความ" ซึ่งเอกสารห้ามไว้ */
                fontSize: '1.25rem',
                fontWeight: 800,
                letterSpacing: '-0.01em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.05,
                display: 'block',
              }}
            >
              {completedOrders.toLocaleString('th-TH')}
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              ออเดอร์สำเร็จ
            </Typography>
          </Box>
        </Box>
      )}
      {/* เส้นคั่นมีหน้าที่เฉพาะตอนเป็นแถวเดียว — พอเป็นกล่องสองช่องแล้ว
          ขอบของกล่องแยกให้เองอยู่แล้ว เส้นตรงกลางจะกลายเป็นขีดลอย ๆ */}
      {completedOrders != null && avgRating != null && (
        <Divider orientation='vertical' flexItem sx={{ [ORDER_TWO_COL_MQ]: { display: 'none' } }} />
      )}
      {avgRating != null && (
        <Box sx={{ textAlign: 'center', ...metricBox }}>
          <Box sx={statIcon} aria-hidden='true'>
            <Icon icon='tabler-star-filled' fontSize={19} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant='h6'
              sx={{
                /* DESIGN.md §Metric — ตัวเลขที่ทำหน้าที่เป็นภาพ: 800 @ 32/22/20px
                   + tabular-nums + letter-spacing ติดลบ · เดิมยืม variant='h6' (15px)
                   มาแล้วดัน 800 ทับ ⇒ กลายเป็น 800 บน "ข้อความ" ซึ่งเอกสารห้ามไว้ */
                fontSize: '1.25rem',
                fontWeight: 800,
                letterSpacing: '-0.01em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.05,
                display: 'block',
              }}
            >
              {avgRating}
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              จาก {reviewCount.toLocaleString('th-TH')} รีวิว
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  )
}

/**
 * ── แถบช่องทางของร้าน (แยกออกมา 2026-08-30) ──
 *
 * ม็อกอัพ v5 วางบล็อกนี้ไว้ **คอลัมน์ขวาของหัวโปรไฟล์** (`.profile-side` → `.socials`)
 * ส่วนสถิติเป็นแถบเต็มความกว้างใต้กริด (`.stats`) ⇒ บนจอกว้างสองบล็อกนี้อยู่คนละที่แล้ว
 * ประกอบเป็นก้อนเดียวไม่ได้อีกต่อไป จึงแยกเป็นชิ้นที่เรียกแยกได้
 *
 * 🛑 `ShopEvidence` (default) ยังอยู่ครบและเรียงเหมือนเดิม — จอ guest ใช้ตัวนั้น ไม่ต้องแก้ตาม
 * "สองจอต้องเห็นหลักฐานชุดเดียวกัน" ยังจริง เพราะเป็นชิ้นเดียวกัน แค่คนละที่วาง
 */
export function ShopChannels({
  channels,
  originChannel = null,
  variant = 'strip',
}: Pick<ShopEvidenceData, 'channels' | 'originChannel'> & { variant?: 'strip' | 'rows' | 'logos' }) {
  {/* ChannelStrip คืน null เองเมื่อไม่มีช่องทาง — แต่เส้นคั่นอยู่ที่ Box ข้างนอก
     ต้องเช็คที่นี่ด้วย ไม่งั้นได้เส้นคั่นลอยคั่นความว่างเปล่า */}
  if (channels.length === 0) return null

  /**
   * 🛑 โหมด `rows` ต้อง **ไม่ผ่านตัวห่อจัดกึ่งกลาง** — ตัวห่อด้านล่างเขียนมาสำหรับแถบ `strip`
   * ที่หัวโปรไฟล์ (เส้นคั่น + `justifyContent:'center'` + `minHeight:76`) พอเอามาครอบ
   * แถวเต็มความกว้าง มันดันแถวไปอยู่กลางการ์ด **ไม่เรียงกับแถวอื่นในการ์ดเดียวกัน**
   * (เห็นบนจอจริง 2026-08-30)
   */
  if (variant !== 'strip') {
    return <ChannelStrip channels={channels} originChannel={originChannel} variant={variant} />
  }

  return (
    <Box
      sx={{
        ...dividedBlock,
        /* ม็อกอัพ `.source-row`: สูงขั้นต่ำ 76 · จัดกลาง — ให้แถวช่องทางมีน้ำหนัก
           พอ ๆ กับกล่องสถิติด้านบน ไม่ใช่บรรทัดเล็ก ๆ ห้อยท้ายการ์ด */
        [ORDER_TWO_COL_MQ]: {
          /* เส้นนี้คือขีดล่างที่คร่อมกล่องสถิติ — ออกด้วยเหตุผลเดียวกับเส้นบน
             ระยะห่าง (`minHeight` + `pt`) ทำหน้าที่แยกบล็อกแทนอยู่แล้ว */
          borderTop: 'none',
          minHeight: 76,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      }}
    >
      <ChannelStrip channels={channels} originChannel={originChannel} variant={variant} />
    </Box>
  )
}

/**
 * หลักฐานของร้านทั้งชุด เรียงบนลงล่าง — จอ guest ใช้ตัวนี้
 *
 * 🛑 **เพจมาก่อนสถิติ** สองบล็อกนี้ตอบคนละคำถาม และคำถามมาไม่พร้อมกัน:
 *   1. "นี่ร้านเดียวกับที่ฉันเพิ่งคุยด้วยไหม" → **เพจ** — ถามทันทีที่อ่านชื่อร้าน
 *   2. "ร้านนี้ขายจริงไหม" → **สถิติ** — ถามหลังจากตอบข้อ 1 ได้แล้ว
 * ของเดิมเรียงกลับกัน ⇒ คำตอบของคำถามแรกไปห้อยท้ายการ์ด ใต้ตัวเลขที่ตอบคำถามที่สอง
 */
export default function ShopEvidence(p: ShopEvidenceData) {
  return (
    <>
      <ShopChannels channels={p.channels} originChannel={p.originChannel} />
      <ShopStats completedOrders={p.completedOrders} avgRating={p.avgRating} reviewCount={p.reviewCount} />
    </>
  )
}
