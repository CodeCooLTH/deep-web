'use client'

/**
 * OfficialChannels — แท็บ "ช่องทาง Official" (mockup 2026-07-26)
 *
 * ทำไมถึงมีน้ำหนักมากกว่าลิงก์ธรรมดา: ช่องทางพวกนี้ผ่าน OAuth ของแพลตฟอร์มมาแล้ว ชื่อและรูปที่
 * แสดงจึงถูกดึงมาจากแพลตฟอร์มโดยตรง ไม่ใช่ข้อความที่ร้านพิมพ์เอง ปลอมไม่ได้ และผู้ซื้อจำนวนมาก
 * รู้จักเพจของร้านก่อนรู้จัก Deep การเห็นชื่อเพจเดียวกับที่เคยเห็นในฟีดคือหลักฐานว่ามาถูกที่
 *
 * แสดงเฉพาะช่องทางที่ยัง ACTIVE (กรองที่ service) — ช่องทางที่ถอดออกหรือโทเคนหมดอายุไม่ใช่
 * หลักฐานว่าติดต่อร้านได้จริงอีกต่อไป
 *
 * เปิดแท็บใหม่พร้อม rel noopener noreferrer — ทางเลือกที่ user ตัดสิน 2026-07-26 (ให้ผู้ซื้อไป
 * ตรวจเพจเองต่อได้ แต่ไม่ทิ้งหน้าร้านที่กำลังตัดสินใจอยู่)
 *
 * Base: src/app/(marketing)/auth/sign-in/OrderLinkShell.tsx (แถวช่องทางเดียวกัน ให้สองหน้าเป็นชุดเดียว)
 */
import { useState } from 'react'
import type { ReactElement } from 'react'

import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'

import CustomAvatar from '@core/components/mui/Avatar'

import { Icon } from '@iconify/react'

export type OfficialChannel = {
  provider: string
  name: string
  avatarUrl: string | null
  externalId: string
  /** 🛑 null = "ยังไม่รู้" ไม่ใช่ 0 — เพจที่เชื่อมไว้ก่อนมีคอลัมน์นี้จะเป็น null จนกว่าจะเชื่อมใหม่
   *  ต้องซ่อนยอดทั้งส่วน ห้าม fallback เป็น 0 เพราะ 0 แปลว่า "ไม่มีคนถูกใจ" ซึ่งเป็นคนละความหมาย */
  followerCount?: number | null
  /** LINE Basic ID (ขึ้นต้นด้วย `@`) — ไม่ใช่ `externalId` ซึ่งเป็น id ภายในที่ line.me ไม่รับ
   *  `null` สำหรับช่องทางที่ไม่ใช่ LINE หรือเพจที่เชื่อมก่อนมีคอลัมน์นี้ */
  basicId?: string | null
}

/** คำเรียกยอดตามแพลตฟอร์ม — Instagram ไม่มี "ไลก์" ของบัญชี มีแต่ผู้ติดตาม (user เคาะ 2026-08-09) */
const FOLLOWER_LABEL: Record<string, string> = {
  MESSENGER: 'ถูกใจ',
  INSTAGRAM: 'ผู้ติดตาม',
  LINE: 'ผู้ติดตาม',
}

/** ย่อเลขให้อ่านง่ายบนพื้นที่แคบ — 12,300 → 12.3K (ชุดเดียวกับที่ไทล์คลิปใช้) */
function compactCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** ป้ายกำกับ + สีแบรนด์ + วิธีประกอบ URL ต่อแพลตฟอร์ม
 *  สีแบรนด์เป็น carve-out ที่อนุญาต (Hard Rule 6) เพราะเป็น asset ของเจ้าของแพลตฟอร์ม */
const PROVIDER: Record<string, { label: string; icon: string; bg: string; url: (c: OfficialChannel) => string | null }> = {
  MESSENGER: {
    label: 'Facebook Page',
    icon: 'lucide:facebook',
    bg: '#1877F2',
    url: (c) => `https://www.facebook.com/${c.externalId}`,
  },
  INSTAGRAM: {
    label: 'Instagram',
    icon: 'lucide:instagram',
    bg: 'linear-gradient(45deg,#f09433,#dc2743,#bc1888)',
    // IG ใช้ username ไม่ใช่ business id — name ที่เก็บไว้คือ handle จึงใช้ตัวนั้นประกอบ URL
    url: (c) => (c.name.startsWith('@') ? `https://www.instagram.com/${c.name.slice(1)}` : null),
  },
}

/**
 * รูปเพจขนาด 38px ในแท็บ "ช่องทาง"
 *
 * 🛑 ใช้ `CustomAvatar` ของธีม (`@core/components/mui/Avatar` — ห่อ MUI `Avatar`) ไม่ใช่แท็กรูป
 * ดิบ + `useState(failed)` ที่เขียนเอง: **MUI Avatar ตกไปใช้ children ให้เองอยู่แล้วเมื่อรูปโหลด
 * ไม่ขึ้น** state ที่เราเขียนเองจึงเป็นการทำซ้ำสิ่งที่ primitive ทำให้ฟรี — และไฟล์นี้เคยเขียน
 * ตรรกะเดียวกันซ้ำ 2 จุด (38px กับ 20px) ด้วยตัวแปรคนละตัว
 * (Hard Rule 1 — safepay-ux audit 2026-08-10)
 *
 * รูปเพจมาจากหลายโดเมนภายนอกที่ next/image config ไม่ครอบ MUI Avatar เรนเดอร์แท็กรูปดิบให้อยู่แล้ว
 * จึงใช้ได้โดยไม่ต้อง disable lint เหมือนตอนเขียนเอง
 */
function ChannelAvatar({ src, bg, icon }: { src: string | null; bg: string; icon: string }) {
  return (
    <span className='is-[38px] bs-[38px] shrink-0 relative'>
      <CustomAvatar
        src={src ?? undefined}
        alt=''
        variant='rounded'
        /* 8px = ขั้น "การ์ดและแผง" ของ shape ramp ฝั่ง buyer (DESIGN.md §Shapes 4/6/8/10/full)
           เดิมเป็น `rounded-xl` (12px) ซึ่งไม่อยู่บน ramp เลย — ค่านี้ถูกก็อปต่อ ๆ กันมาทั้งโฟลเดอร์
           v2/ จน "สม่ำเสมอกันเอง" แต่ไม่ตรงระบบ ไฟล์อื่นในโฟลเดอร์แก้ไปแล้ว ตัวนี้ตกค้าง
           และผมยกมันข้ามมาตอนเปลี่ยนเป็น CustomAvatar โดยไม่ได้เอะใจ (impeccable hook จับได้) */
        sx={{ inlineSize: 38, blockSize: 38, borderRadius: '8px', background: bg, color: 'common.white' }}
      >
        <Icon icon={icon} width={19} />
      </CustomAvatar>
      {/* เช็คเขียว = ยืนยันความเป็นเจ้าของผ่าน OAuth ปลอมไม่ได้ — เหตุผลเดียวที่บล็อกนี้มีค่า */}
      <span
        className='absolute -bottom-0.5 -inline-end-0.5 is-4 bs-4 rounded-full bg-success text-white flex items-center justify-center border-2 border-[var(--mui-palette-background-paper)]'
        title='ยืนยันความเป็นเจ้าของแล้ว'
      >
        <Icon icon='lucide:check' width={8} />
      </span>
    </span>
  )
}

export default function OfficialChannels({ channels }: { channels: OfficialChannel[] }) {
  return (
    <div className='flex flex-col'>
      <Typography variant='body2' color='text.secondary' className='mbe-3'>
        ช่องทางเหล่านี้ยืนยันแล้วว่าเป็นของร้านนี้จริง ผ่านการเข้าสู่ระบบกับแพลตฟอร์มโดยตรง
      </Typography>

      {channels.map((c) => {
        const meta = PROVIDER[c.provider]
        if (!meta) return null
        const href = meta.url(c)

        const inner = (
          <>
            <ChannelAvatar src={c.avatarUrl} bg={meta.bg} icon={meta.icon} />
            <span className='min-is-0 flex-1'>
              <span className='block text-sm font-semibold truncate'>{c.name}</span>
              {/* text.secondary ไม่ใช่ text.disabled — ชนิดของช่องทาง (Facebook Page/Instagram)
                  คือส่วนหนึ่งของหลักฐาน ไม่ใช่ของประดับ ink 0.4 ตก AA (~2.3:1) */}
              <Typography component='span' variant='caption' color='text.secondary' className='block'>
                {meta.label}
              </Typography>
            </span>
            {/* "เปิด" เฉย ๆ ไม่บอกว่าเปิดอะไรและจะพาออกนอกเว็บ — link text ต้องเข้าใจได้นอกบริบท
                (screen reader อ่านรายการลิงก์แยกจากแถว จะได้ "เปิด เปิด เปิด" เรียงกัน) */}
            {href && (
              <span className='text-[13px] font-semibold text-primary shrink-0 flex items-center gap-1'>
                {`เปิดใน ${meta.label}`}
                <Icon icon='lucide:external-link' width={13} />
              </span>
            )}
          </>
        )

        const rowClass = 'flex items-center gap-3 plb-2.5 border-be last:border-be-0 min-is-0'

        return href ? (
          <a
            key={`${c.provider}-${c.externalId}`}
            href={href}
            target='_blank'
            rel='noopener noreferrer'
            className={`${rowClass} no-underline text-[color:inherit]`}
          >
            {inner}
          </a>
        ) : (
          <div key={`${c.provider}-${c.externalId}`} className={rowClass}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}


/**
 * ChannelStrip — ช่องทางที่เชื่อมต่อ วางในหัวโปรไฟล์ใต้บรรทัด slug
 *
 * ประวัติการลองผิด (อย่าวนกลับไปทางเดิม):
 *   1. ชิปมีกรอบเรียงกลาง → user: "ไม่ค่อยชอบ chip ที่ครอบเพจ" (กรอบทำให้อ่านเป็นปุ่ม ทั้งที่เป็นหลักฐาน)
 *   2. บรรทัดละช่องทาง เต็มความกว้าง ยอดชิดขวา → user: "ไม่สวยเฉย" (กระจายออกจนดูเป็นตาราง
 *      ไม่ใช่ป้ายกำกับตัวตน และช่องว่างกลางแถวยาวเกินทำให้ชื่อเพจกับยอดดูไม่เกี่ยวกัน)
 *   3. ✅ ปัจจุบัน: อยู่ **ติดกันตรงกลาง** เหมือนเวอร์ชันแรก แต่ **ไม่มีกรอบ** — user ระบุเองว่า
 *      "ตรง page แบบเดิม (ที่ติดๆ กันตรงกลาง) และไม่มี chip ยังสวยกว่า"
 *
 * ยังคงชื่อเพจ + ชื่อช่องทาง + ยอด ครบตามที่ขอไว้รอบก่อน แค่จัดให้กระชับเข้าหากัน
 */
/**
 * คำอธิบายว่าทำไมเพจนี้เชื่อถือได้ (user 2026-08-10 "hover ต้องชี้แจงด้วยว่าเป็นเพจที่มาจากการ
 * authentication เชื่อถือได้")
 *
 * 🛑 เขียนเป็น **สิ่งที่เกิดขึ้นจริง** ไม่ใช่คำรับรองลอย ๆ — "ยืนยันแล้ว" เฉย ๆ ไม่ได้บอกว่าใคร
 * ยืนยันหรือยืนยันยังไง ซึ่งบนหน้าที่ทั้งหน้ามีไว้พิสูจน์ความน่าเชื่อถือ คำรับรองที่ตรวจสอบไม่ได้
 * มีค่าเท่ากับโฆษณา ประโยคนี้บอกกลไก (เข้าสู่ระบบ + กดอนุญาตกับเจ้าของแพลตฟอร์ม) และบอกสิ่งที่
 * มัน **ไม่ใช่** (ลิงก์ที่พิมพ์กรอกเอง) ซึ่งเป็นข้อแตกต่างที่ผู้ซื้อเอาไปใช้ได้จริง
 *
 * ห้ามเขียนว่า "Deep ตรวจสอบแล้วว่าเป็นเพจของร้าน" — เราไม่ได้ตรวจอะไร เราแค่รับผลจาก OAuth
 */
function trustNote(providerLabel: string) {
  return `ร้านเชื่อมเพจนี้ด้วยการเข้าสู่ระบบ ${providerLabel} แล้วกดอนุญาตเอง ไม่ใช่ลิงก์ที่พิมพ์กรอกเข้ามา จึงยืนยันได้ว่าเพจนี้อยู่ในความดูแลของร้านนี้จริง`
}

export function ChannelStrip({ channels }: { channels: OfficialChannel[] }) {
  const [expanded, setExpanded] = useState(false)
  if (channels.length === 0) return null

  const VISIBLE = 2
  const shown = expanded ? channels : channels.slice(0, VISIBLE)
  const rest = channels.length - shown.length

  return (
    /* gap-x กว้างกว่า gap-y เพื่อให้แต่ละช่องทางเป็นก้อนที่แยกจากกันได้ด้วยระยะ ไม่ต้องใช้เส้น/กรอบ
       🛑 ไม่มี padding ล่าง — แต่ละแถวมี `min-bs-[44px]` (hit target) ซึ่งจัดเนื้อหา ~20px ไว้กลาง
       จึงมีที่ว่างบน-ล่างในตัวอยู่แล้วข้างละ ~12px การใส่ pbe อีกชั้นทำให้ระยะห่างสะสมเป็น ~24px
       แล้วหัวโปรไฟล์อ่านเป็น "บล็อกที่ลอยห่างกัน" (user ทัก 2026-08-10 "มันห่าง ๆ กันไงไม่รู้")
       ปล่อยให้พื้นที่แตะทำหน้าที่เป็นระยะห่างไปในตัว */
    <div className='flex flex-wrap justify-center items-center gap-x-5 gap-y-1 pli-5'>
      {shown.map((c) => {
        const meta = PROVIDER[c.provider]
        if (!meta) return null
        const href = meta.url(c)
        const label = FOLLOWER_LABEL[c.provider] ?? 'ผู้ติดตาม'

        const inner = (
          <>
            <ChannelMark src={c.avatarUrl} provider={c.provider} icon={meta.icon} bg={meta.bg} />
            <span className='flex flex-col leading-tight min-is-0'>
              {/* ชื่อเพจตัดที่ 150px — สั้นกว่านี้อ่านไม่ออกว่าเพจไหน ยาวกว่านี้สองช่องทางไม่พอบรรทัดเดียว */}
              <span className='text-[13px] font-semibold truncate max-is-[150px]'>{c.name}</span>
              <span className='text-[11px] text-[var(--mui-palette-text-secondary)]'>
                {meta.label}
                {/* ยอดต่อท้ายชื่อช่องทางในบรรทัดเดียวกัน ไม่แยกไปชิดขวา — ทั้งก้อนจึงอ่านเป็น
                    "ป้ายกำกับของเพจนี้" ไม่ใช่แถวตารางที่มีค่าอยู่คนละฝั่ง
                    ซ่อนเมื่อไม่รู้ยอด ห้ามแสดง 0 */}
                {typeof c.followerCount === 'number' && (
                  <>
                    {' · '}
                    <span className='font-semibold tabular-nums text-[var(--mui-palette-text-primary)]'>
                      {compactCount(c.followerCount)}
                    </span>
                    {` ${label}`}
                  </>
                )}
              </span>
            </span>
          </>
        )

        const cls = 'flex items-center gap-2 min-bs-[44px] no-underline text-[color:inherit]'

        const note = trustNote(meta.label)

        // MUI Tooltip ไม่ใช่ `title=` — บนมือถือซึ่งเป็น surface หลักของเรา `title` เข้าถึงไม่ได้เลย
        // (ไม่มี hover) ส่วน Tooltip ของ MUI เปิดด้วยการแตะค้างและด้วยโฟกัสคีย์บอร์ดได้ด้วย
        // enterTouchDelay=0 เพราะ 700ms ตั้งต้นยาวพอที่คนจะปล่อยนิ้วไปก่อนโดยไม่รู้ว่ามีอะไรให้อ่าน
        // describeChild: ข้อความนี้เป็น "คำอธิบายเพิ่ม" ของลิงก์ ไม่ใช่ชื่อของมัน — ถ้าไม่ใส่
        // Tooltip จะไปทับ aria-label แล้ว screen reader จะไม่บอกว่าลิงก์นี้พาไปไหน
        const withNote = (node: ReactElement) => (
          <Tooltip
            key={`${c.provider}-${c.externalId}`}
            title={note}
            describeChild
            enterTouchDelay={0}
            leaveTouchDelay={6000}
            /* 13px = ขั้น "Body small / Label" ของ ramp (DESIGN.md §Typography) ไม่ใช่ 12px
               ซึ่งเป็นขั้น Overline ที่สงวนไว้ให้ป้ายสั้น ๆ พร้อม letter-spacing — ข้อความนี้เป็น
               ประโยคอธิบายเต็ม และ 11px ตั้งต้นของ MUI Tooltip เล็กเกินไปสำหรับตัวไทย 2 บรรทัด */
            slotProps={{ tooltip: { sx: { maxInlineSize: 260, fontSize: '13px', lineHeight: 1.5 } } }}
          >
            {node}
          </Tooltip>
        )

        return href
          ? withNote(
              <a
                href={href}
                target='_blank'
                rel='noopener noreferrer'
                className={cls}
                aria-label={`เปิด ${c.name} ใน ${meta.label}`}
              >
                {inner}
              </a>,
            )
          : withNote(<div className={cls}>{inner}</div>)
      })}

      {rest > 0 && (
        <button
          type='button'
          onClick={() => setExpanded(true)}
          aria-label={`ดูช่องทางที่เหลืออีก ${rest} ช่องทาง`}
          className='flex items-center gap-1 min-bs-[44px] border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--mui-palette-text-secondary)] cursor-pointer'
        >
          {`อีก ${rest}`}
          <Icon icon='lucide:chevron-down' width={13} />
        </button>
      )}
    </div>
  )
}

/**
 * โลโก้ช่องทาง 20px — รูปเพจจริงก่อน แล้วค่อยตกไปที่ **โลโก้แบรนด์จริง** ใน public/images/logos/
 * ไม่ใช่ไอคอนเส้นบนพื้นสี: IG แทบไม่เคยมี avatarUrl (Graph ไม่คืนรูปให้ business account id)
 * ถ้าใช้ glyph เส้นจะได้วงกลมสีที่ตีความไม่ได้ ขณะที่ไทล์คลิปในหน้าเดียวกันใช้ไฟล์จริงอยู่แล้ว
 */
function ChannelMark({
  src,
  provider,
  icon,
  bg,
}: {
  src: string | null
  provider: string
  icon: string
  bg: string
}) {
  const brandLogo =
    provider === 'MESSENGER'
      ? '/images/logos/facebook.svg'
      : provider === 'INSTAGRAM'
        ? '/images/logos/instagram-circle.svg'
        : null

  return (
    <span className='is-5 bs-5 shrink-0 relative'>
      {/* ลำดับ fallback 3 ชั้นยังเหมือนเดิมเป๊ะ: รูปเพจจริง → โลโก้แบรนด์ → พื้นสีแบรนด์ + ไอคอน
          MUI Avatar จะ render children ก็ต่อเมื่อ **ไม่มี src หรือ src โหลดไม่ขึ้น** ชั้นที่ 2/3
          จึงอยู่ใน children ได้โดยไม่ต้องถือ state เอง (ดูเหตุผลเต็มที่ ChannelAvatar)
          พื้นเป็น transparent เมื่อมีโลโก้แบรนด์ เพราะโลโก้มีสีของตัวเองอยู่แล้ว */}
      <CustomAvatar
        src={src ?? undefined}
        alt=''
        sx={{
          inlineSize: 20,
          blockSize: 20,
          background: brandLogo ? 'transparent' : bg,
          color: 'common.white',
        }}
      >
        {brandLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ใน public/
          <img src={brandLogo} alt='' className='is-full bs-full' />
        ) : (
          <Icon icon={icon} width={12} />
        )}
      </CustomAvatar>
      {/* เช็คเขียว = ยืนยันความเป็นเจ้าของผ่าน OAuth ปลอมไม่ได้ — เหตุผลเดียวที่บล็อกนี้มีค่า */}
      <span
        className='absolute inline-end-[-2px] block-end-[-2px] is-[9px] bs-[9px] rounded-full bg-success border-[1.5px] border-[var(--mui-palette-background-paper)]'
        title='ยืนยันความเป็นเจ้าของแล้ว'
      />
    </span>
  )
}
