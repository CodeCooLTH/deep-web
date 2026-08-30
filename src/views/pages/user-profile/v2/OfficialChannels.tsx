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
 * ช่องทางที่ **แถบช่องทางวาดออกมาได้จริง** — ตัวที่ไม่มีใน `PROVIDER` จะถูก
 * `if (!meta) return null` ทิ้งเงียบ ๆ
 *
 * 🛑 ต้อง export เพราะฝั่งที่ตัดสินใจเรื่อง **ข้อมูล** ต้องถามได้ว่า "อันนี้จะโผล่บนจอไหม"
 * เคสจริง 2026-08-29: ร้านมี 2 ช่องทางในฐาน (Messenger + LINE) แต่เรนเดอร์ได้ 1
 * ⇒ ตัวกัน "ชื่อเพจซ้ำ" ที่นับจากข้อมูลเห็น 2 เลยปล่อยผ่าน แล้วผู้ซื้อเห็นชื่อเดียวกัน
 * สองบรรทัดติดกันบนจอ · ข้อมูลกับสิ่งที่เห็นต้องนับด้วยเกณฑ์เดียวกัน
 */
export function isRenderableChannel(provider: string): boolean {
  return provider in PROVIDER
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
           เดิมเป็น `rounded-xl` ซึ่งในสกินนี้ = 10px ไม่อยู่บนบันได — ค่านี้ถูกก็อปต่อ ๆ กันมาทั้งโฟลเดอร์
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
              <span className='block text-[13px] font-medium truncate'>{c.name}</span>
              {/* text.secondary ไม่ใช่ text.disabled — ชนิดของช่องทาง (Facebook Page/Instagram)
                  คือส่วนหนึ่งของหลักฐาน ไม่ใช่ของประดับ ink 0.4 ตก AA (~2.3:1) */}
              <Typography component='span' variant='caption' color='text.secondary' className='block'>
                {meta.label}
              </Typography>
            </span>
            {/* "เปิด" เฉย ๆ ไม่บอกว่าเปิดอะไรและจะพาออกนอกเว็บ — link text ต้องเข้าใจได้นอกบริบท
                (screen reader อ่านรายการลิงก์แยกจากแถว จะได้ "เปิด เปิด เปิด" เรียงกัน) */}
            {href && (
              <span className='text-[13px] font-medium text-primary shrink-0 flex items-center gap-1'>
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

export function ChannelStrip({
  channels,
  /**
   * ช่องทาง+ชื่อเพจที่ออเดอร์ใบนี้เกิดขึ้น — แถวที่ตรงกันได้ป้าย "คุยกันที่นี่"
   *
   * 🛑 มีไว้แทน **บรรทัดลอยท้ายการ์ด** ("จากการคุยที่ …") ที่พิมพ์ชื่อเพจซ้ำอีกรอบ —
   * ร้านที่ตั้งชื่อเพจเหมือนชื่อร้าน (ปกติมาก) ทำให้ชื่อเดียวกันโผล่ 3–4 รอบในการ์ดเดียว
   * คำตอบอยู่ถูกที่กว่าด้วย: "ใบนี้คุยกันที่เพจไหน" กับ "กดไปดูเพจนั้น" คือสิ่งเดียวกัน
   *
   * 🛑 ต้องเป็น **(ช่องทาง, ชื่อ)** ไม่ใช่ชื่อเปล่า — ร้านตั้งชื่อเพจ IG กับ Facebook เหมือนกัน
   * เป๊ะได้ เทียบแค่ชื่อแล้วป้ายขึ้น **ทั้งสองแถว** (เจอจริงตอนเปิดหน้าหลังเขียนโค้ดเสร็จ —
   * เทสสแกนซอร์สจับไม่ได้เลยเพราะโค้ดถูกทุกบรรทัด สิ่งที่ผิดคือเกณฑ์)
   *
   * `null` = ผู้เรียกไม่มีข้อมูลนี้ (หน้าโปรไฟล์ `/u`, `/b`) ⇒ ไม่มีป้าย เหมือนเดิมทุกพิกเซล
   */
  originChannel = null,
  variant = 'strip',
}: {
  channels: OfficialChannel[]
  originChannel?: { provider: string; name: string | null } | null
  /**
   * `'strip'` — แถวเดียวจัดกลาง แบบที่หัวโปรไฟล์ใช้ (ค่าตั้งต้น ไม่กระทบผู้เรียกเดิม)
   *
   * `'rows'` — **แถวเต็มความกว้าง ใบละบรรทัด** สำหรับการ์ดที่กว้าง
   * 🛑 มีโหมดนี้เพราะ `'strip'` ถูกออกแบบมาสำหรับหัวโปรไฟล์ที่แคบ — พอเอาไปวางบนการ์ด
   * กว้าง ๆ มันพัง 2 ทาง: ช่องทางเดียว → รูปกับชื่อลอยกันคนละที่ · สองช่องทาง → เบียดกัน
   * แล้วป้าย "คุยกันที่นี่" หล่นไปอยู่ใต้ใบซ้ายอย่างเดียว (หัวหน้าเห็นทั้งสองแบบ 2026-08-30)
   */
  variant?: 'strip' | 'rows' | 'logos'
}) {
  const [expanded, setExpanded] = useState(false)
  if (channels.length === 0) return null

  const VISIBLE = 2
  const isOriginRow = (c: OfficialChannel) =>
    originChannel?.name != null && c.provider === originChannel.provider && c.name === originChannel.name
  /**
   * 🛑 เพจต้นทางต้องอยู่ใน **สองใบแรก** เสมอ — ไม่งั้นร้านที่มี 3 เพจขึ้นไปจะซ่อนป้าย
   * "คุยกันที่นี่" ไว้หลังปุ่ม "อีก N" **พร้อมกับที่บรรทัดสำรองถูกซ่อนไปแล้ว**
   * (`shouldShowOrderOrigin` ซ่อนทันทีที่จับคู่ได้) ⇒ ที่มาหายทั้งสองทาง
   *
   * `sort` ของ JS เสถียร (ES2019) ⇒ ลำดับเดิมของใบที่เหลือไม่ถูกสลับ
   */
  const ordered =
    originChannel == null
      ? channels
      : [...channels].sort((a, b) => Number(isOriginRow(b)) - Number(isOriginRow(a)))
  const shown = expanded ? ordered : ordered.slice(0, VISIBLE)
  const rest = ordered.length - shown.length

  if (variant === 'logos') {
    /**
     * ── โลโก้ล้วน (ม็อกอัพ v5 `.socials` = วงกลม 36px ไม่มีชื่อ) ──
     *
     * 🛑 ผ่านมา 3 ผังแล้วและ "ไม่สวย" ทุกครั้ง (คอลัมน์ขวา · ใต้สถิติ · แถวในการ์ดช่วยเหลือ)
     * ทั้งสามผังมีของเหมือนกันอย่างหนึ่ง: **ชื่อเพจไทยยาว ๆ ที่ซ้ำกันแทบทุกตัวอักษร**
     * ("ธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง" สองบรรทัดติดกัน) ⇒ ไม่ว่าจัดยังไงก็อ่านเป็นบล็อกรก
     *
     * v5 แก้ปัญหานี้ด้วยการ **ไม่แสดงชื่อเลย** — เหลือแค่โลโก้แพลตฟอร์ม ซึ่งเป็นสิ่งเดียวที่
     * ผู้ซื้อต้องรู้จริง ๆ ("ร้านนี้มีเพจ Facebook กับ Instagram ที่ยืนยันแล้ว")
     * ชื่อเต็ม + ยอดผู้ติดตาม + คำอธิบายว่ายืนยันยังไง ย้ายไปอยู่ใน tooltip/`aria-label`
     * ⇒ ข้อมูลไม่หาย แต่เลิกกินพื้นที่
     */
    return (
      <div className='flex items-center justify-center gap-2 flex-wrap'>
        {ordered.map((c) => {
          const meta = PROVIDER[c.provider]
          if (!meta) return null
          const href = meta.url(c)
          const label = FOLLOWER_LABEL[c.provider] ?? 'ผู้ติดตาม'
          const isOrigin = isOriginRow(c)
          const count =
            typeof c.followerCount === 'number' ? ` · ${compactCount(c.followerCount)} ${label}` : ''
          const note = `${isOrigin ? 'คุยกันที่นี่ — ' : ''}${c.name} · ${meta.label}${count}\n${trustNote(meta.label)}`

          /* พื้นที่แตะ 44px รอบโลโก้ 40px — โลโก้เล็กแต่ต้องกดโดน (`PRODUCT.md`) */
          const cls =
            'inline-flex items-center justify-center is-11 bs-11 rounded-full no-underline text-[color:inherit]'
          const mark = (
            <span
              /* วงแหวนม่วง = เพจที่ออเดอร์ใบนี้เกิดขึ้น · คำเต็มอยู่ใน tooltip + aria-label
                 (ไม่ใช้ข้อความบนจอ เพราะทั้งโหมดนี้มีอยู่เพื่อเลิกใส่ข้อความ) */
              className='rounded-full grid place-items-center'
              style={
                isOrigin
                  ? { outline: '2px solid var(--mui-palette-primary-main)', outlineOffset: 2 }
                  : undefined
              }
            >
              <ChannelMark
                src={c.avatarUrl}
                provider={c.provider}
                icon={meta.icon}
                bg={meta.bg}
                providerLabel={meta.label}
                size={40}
              />
            </span>
          )

          return (
            <Tooltip
              key={`${c.provider}-${c.externalId}`}
              title={<span style={{ whiteSpace: 'pre-line' }}>{note}</span>}
              enterTouchDelay={0}
              leaveTouchDelay={6000}
              slotProps={{ tooltip: { sx: { maxInlineSize: 260, fontSize: '13px', lineHeight: 1.5 } } }}
            >
              {href ? (
                <a
                  href={href}
                  target='_blank'
                  rel='noopener noreferrer'
                  className={cls}
                  aria-label={`${isOrigin ? 'คุยกันที่นี่ — ' : ''}เปิด ${c.name} ใน ${meta.label}`}
                >
                  {mark}
                </a>
              ) : (
                <span className={cls} aria-label={`${c.name} · ${meta.label}`}>
                  {mark}
                </span>
              )}
            </Tooltip>
          )
        })}
      </div>
    )
  }

  if (variant === 'rows') {
    return (
      <div className='flex flex-col'>
        {ordered.map((c) => {
          const meta = PROVIDER[c.provider]
          if (!meta) return null
          const href = meta.url(c)
          const label = FOLLOWER_LABEL[c.provider] ?? 'ผู้ติดตาม'
          const isOrigin = isOriginRow(c)

          const inner = (
            <>
              {/* 🛑 กล่อง 44px ครอบตรา 28px — แถวการกระทำในการ์ดเดียวกันใช้แผ่นไอคอน 44px
                  ถ้าไม่ครอบ คอลัมน์ข้อความของสองชนิดจะเริ่มคนละ x ต่างกัน ~10px
                  ซึ่งเป็นระยะที่ตาจับได้พอดีว่า "ไม่ตรงกัน" */}
              <span className='is-11 flex justify-center shrink-0'>
                <ChannelMark
                  src={c.avatarUrl}
                  provider={c.provider}
                  icon={meta.icon}
                  bg={meta.bg}
                  providerLabel={meta.label}
                />
              </span>
              <span className='min-is-0 flex-1'>
                <span className='block text-[13px] font-medium truncate'>{c.name}</span>
                <span className='block text-[13px] text-[var(--mui-palette-text-secondary)]'>
                  {meta.label}
                  {typeof c.followerCount === 'number' && (
                    <>
                      {' · '}
                      <span className='font-medium tabular-nums text-[var(--mui-palette-text-primary)]'>
                        {compactCount(c.followerCount)}
                      </span>
                      {` ${label}`}
                    </>
                  )}
                </span>
              </span>
              {isOrigin && (
                <span
                  className='shrink-0 inline-flex items-center gap-1 rounded-full plb-[2px] pli-1.5 text-[11px] font-medium'
                  style={{
                    background: 'var(--mui-palette-primary-lightOpacity)',
                    color: 'var(--mui-palette-primary-main)',
                  }}
                >
                  <Icon icon='tabler-message-circle' width={11} aria-hidden='true' />
                  คุยกันที่นี่
                </span>
              )}
              {href && (
                <Icon
                  icon='tabler-external-link'
                  fontSize={16}
                  aria-hidden='true'
                  className='shrink-0 text-[color:var(--mui-palette-text-secondary)]'
                />
              )}
            </>
          )

          /* 56px = ความสูงเดียวกับแถวการกระทำในการ์ดเดียวกัน (ชื่อ + คำอธิบาย สองบรรทัด)
             ⇒ ทั้งการ์ดอ่านเป็นรายการเดียวกัน ไม่ใช่ของสองชนิดต่อกัน */
          const rowCls =
            'flex items-center gap-1.5 min-bs-[56px] plb-2 pli-[5px] rounded-2xl no-underline text-[color:inherit] hover:bg-[var(--mui-palette-action-hover)] transition-colors'

          return href ? (
            <a
              key={`${c.provider}-${c.externalId}`}
              href={href}
              target='_blank'
              rel='noopener noreferrer'
              className={rowCls}
              aria-label={`เปิด ${c.name} ใน ${meta.label}`}
            >
              {inner}
            </a>
          ) : (
            <div key={`${c.provider}-${c.externalId}`} className={rowCls}>
              {inner}
            </div>
          )
        })}
      </div>
    )
  }

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
        /* เกณฑ์เดียวกับ `shouldShowOrderOrigin` เป๊ะ — สองฝั่งต้องตัดสินเหมือนกัน */
        const isOrigin = isOriginRow(c)

        const inner = (
          <>
            <ChannelMark
              src={c.avatarUrl}
              provider={c.provider}
              icon={meta.icon}
              bg={meta.bg}
              providerLabel={meta.label}
            />
            <span className='flex flex-col leading-tight min-is-0'>
              {/* 🛑 2 บรรทัดแทน `truncate` บรรทัดเดียว — backport จาก `OfficialChannelsBlock.tsx`
                  (ux audit 2026-08-14: บั๊กเดียวกันถูกแก้ที่โปรไฟล์สาธารณะแล้วแต่ค้างที่นี่)
                  ชื่อเพจจริงยาวได้ถึง 34 ตัวอักษร และ **หางของชื่อคือที่ที่เพจของร้านเดียวกันต่างกัน**
                  ("… สายซิ่ง" vs "… สาขาสอง") ตัดหางทิ้งทำให้สองเพจเหลือข้อความเหมือนกันเป๊ะ
                  ซึ่งทำลายเหตุผลทั้งหมดที่บล็อกนี้มีอยู่ (ใช้เทียบกับเพจที่เจอที่อื่น)
                  🛑 ไฟล์นี้ถูกใช้โดย `/o/[token]` (`ShopEvidence.tsx`) ซึ่งเป็นจอที่ผู้ซื้อคนเดียวกัน
                  เห็นห่างจากโปรไฟล์ไม่กี่วินาที — ตัดหางที่จอหนึ่งแต่ไม่ตัดที่อีกจอ คือความแม่นยำ
                  ที่ไม่ตรงกัน ไม่ใช่แค่สไตล์ที่ต่างกัน */}
              <span
                /* 🛑 เพดาน 150px ตั้งไว้ตอนบล็อกนี้อยู่บนการ์ดแคบ — บนหน้าออเดอร์จอกว้าง
                   การ์ดกว้าง ~1160px แต่ชื่อยังถูกบีบให้หักเป็น 2 บรรทัดโดยไม่จำเป็น
                   (หัวหน้าเห็นบนจอจริง 2026-08-29) · ขยายเพดานเมื่อมีที่ **แต่คง clamp 2 บรรทัดไว้**
                   เพราะเหตุผลเดิมยังจริง: หางชื่อคือตัวที่แยกสาขาออกจากกัน ตัดทิ้งไม่ได้ */
                className='text-[13px] font-medium max-is-[150px] min-[861px]:max-is-[420px]'
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                  overflow: 'hidden',
                }}
              >
                {c.name}
              </span>
              <span className='text-[11px] text-[var(--mui-palette-text-secondary)]'>
                {meta.label}
                {/* ยอดต่อท้ายชื่อช่องทางในบรรทัดเดียวกัน ไม่แยกไปชิดขวา — ทั้งก้อนจึงอ่านเป็น
                    "ป้ายกำกับของเพจนี้" ไม่ใช่แถวตารางที่มีค่าอยู่คนละฝั่ง
                    ซ่อนเมื่อไม่รู้ยอด ห้ามแสดง 0 */}
                {typeof c.followerCount === 'number' && (
                  <>
                    {' · '}
                    <span className='font-medium tabular-nums text-[var(--mui-palette-text-primary)]'>
                      {compactCount(c.followerCount)}
                    </span>
                    {` ${label}`}
                  </>
                )}
              </span>
              {/**
               * ป้าย "คุยกันที่นี่" — บรรทัดที่สาม ไม่ใช่ต่อท้ายแนวนอน
               *
               * แถวนี้เป็น `flex items-center` ที่ไม่ wrap — ยัดป้ายเป็นลูกแนวนอนจะไปแย่งที่
               * กับชื่อเพจซึ่งยาวได้ถึง 34 ตัวอักษร แล้วดันแถวกว้างเกินจอที่ 320px
               * (คลาสเดียวกับ `flex-header-truncation.md`)
               */}
              {isOrigin && (
                <span
                  className='self-start inline-flex items-center gap-1 rounded-full mbs-1 plb-[2px] pli-1.5 text-[11px] font-medium'
                  style={{
                    /* ม่วงคือสีของ "การกระทำ" บนหน้านี้ (One Voice ≤10%) — ป้ายนี้เป็น
                       *ข้อเท็จจริงของออเดอร์* ไม่ใช่ปุ่ม ⇒ ผิวจาง + หมึกเข้ม ไม่ใช่พื้นทึบ */
                    background: 'var(--mui-palette-primary-lightOpacity)',
                    color: 'var(--mui-palette-primary-main)',
                  }}
                >
                  <Icon icon='tabler-message-circle' width={11} aria-hidden='true' />
                  คุยกันที่นี่
                </span>
              )}
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
                {/**
                 * 🛑 ไอคอน "ออกนอกเว็บ" — ลิงก์นี้เปิดแท็บใหม่ไปเว็บของ Meta/LINE
                 * แต่เดิม **ไม่มีอะไรบนจอบอกเลย** ผู้ซื้อที่กดจากหน้าออเดอร์จะเจอเว็บอื่น
                 * โดยไม่รู้ว่าทำไม (หัวหน้าสั่ง 2026-08-30: "ให้เขารู้แต่ละปุ่ม แต่ละที่ทำไร")
                 *
                 * `aria-label` บอก screen reader อยู่แล้ว — ที่ขาดคือคนที่ **มองเห็น**
                 * ⇒ ต้องมีทั้งคู่ ไม่ใช่อย่างใดอย่างหนึ่ง
                 *
                 * `aria-hidden` เพราะ `aria-label` ของ `<a>` พูดครบแล้ว
                 * ปล่อยให้อ่านซ้ำจะได้ "เปิด X ใน Y, ลิงก์ภายนอก" ซึ่งยืดโดยไม่เพิ่มข้อมูล
                 */}
                <Icon
                  icon='tabler-external-link'
                  fontSize={13}
                  aria-hidden='true'
                  className='shrink-0 text-[color:var(--mui-palette-text-secondary)]'
                />
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
  providerLabel,
  size = 28,
}: {
  src: string | null
  provider: string
  icon: string
  bg: string
  /** "Facebook Page" / "Instagram" — ใช้เป็นคำใน tooltip ของตราแพลตฟอร์ม */
  providerLabel: string
  /** ขนาดวงกลม — 28 ในแถว · 40 ในโหมดโลโก้ล้วน */
  size?: number
}) {
  const brandLogo =
    provider === 'MESSENGER'
      ? '/images/logos/facebook.svg'
      : provider === 'INSTAGRAM'
        ? '/images/logos/instagram-circle.svg'
        : null

  return (
    /* 20 → 28px — ต้องมีที่พอให้ตราแพลตฟอร์มกับเช็คเขียวอยู่คนละมุมโดยไม่ทับกัน
       `ChannelStrip` ถูกใช้ที่หน้าออเดอร์ที่เดียว (ตรวจแล้ว) การขยายจึงไม่กระทบหน้าอื่น */
    <span className='shrink-0 relative' style={{ inlineSize: size, blockSize: size }}>
      {/* ลำดับ fallback 3 ชั้นยังเหมือนเดิมเป๊ะ: รูปเพจจริง → โลโก้แบรนด์ → พื้นสีแบรนด์ + ไอคอน
          MUI Avatar จะ render children ก็ต่อเมื่อ **ไม่มี src หรือ src โหลดไม่ขึ้น** ชั้นที่ 2/3
          จึงอยู่ใน children ได้โดยไม่ต้องถือ state เอง (ดูเหตุผลเต็มที่ ChannelAvatar)
          พื้นเป็น transparent เมื่อมีโลโก้แบรนด์ เพราะโลโก้มีสีของตัวเองอยู่แล้ว */}
      <CustomAvatar
        src={src ?? undefined}
        alt=''
        sx={{
          inlineSize: size,
          blockSize: size,
          background: brandLogo ? 'transparent' : bg,
          color: 'common.white',
        }}
      >
        {brandLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ใน public/
          <img src={brandLogo} alt='' className='is-full bs-full' />
        ) : (
          <Icon icon={icon} width={16} />
        )}
      </CustomAvatar>

      {/**
       * 🛑 **ตราแพลตฟอร์มมุมขวาล่าง** (หัวหน้าสั่ง 2026-08-30: "ใส่ logo face")
       *
       * รูปวงกลมคือ **รูปเพจของร้าน** ซึ่งบอกไม่ได้เลยว่ามาจากแพลตฟอร์มไหน — ชื่อช่องทาง
       * อยู่เป็นตัวหนังสือเล็ก ๆ ใต้ชื่อเพจ ซึ่งต้องอ่านถึงจะรู้ · ตราโลโก้อ่านออกทันทีที่เห็น
       *
       * วงขาวรอบโลโก้จำเป็น: โลโก้ทับอยู่บนรูปเพจซึ่งสีอะไรก็ได้ (เคสจริงคือรูปดำสนิท)
       * ⇒ ถ้าไม่มีวงรอง โลโก้จะจมหายไปกับรูปบางใบ (คลาสเดียวกับ `TILE_SCRIM`)
       *
       * `title` ไม่ใช่ของแทน Tooltip — แถวทั้งแถวมี MUI Tooltip อยู่แล้ว อันนี้เป็นชั้นเสริม
       * สำหรับเมาส์ที่ชี้ตรงตราพอดี
       */}
      {brandLogo && (
        <span
          title={`ยืนยันแล้วว่าเป็นเพจของร้านนี้บน ${providerLabel}`}
          className='absolute inline-end-[-3px] block-end-[-3px] is-[15px] bs-[15px] rounded-full bg-[var(--mui-palette-background-paper)] border-[1.5px] border-[var(--mui-palette-background-paper)] shadow-sm grid place-items-center overflow-hidden'
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ใน public/ */}
          <img src={brandLogo} alt='' className='is-full bs-full' />
        </span>
      )}

      {/* เช็คเขียว = ยืนยันความเป็นเจ้าของผ่าน OAuth ปลอมไม่ได้ — เหตุผลเดียวที่บล็อกนี้มีค่า
          ย้ายมามุมขวา**บน** เพราะมุมขวาล่างเป็นที่ของตราแพลตฟอร์มแล้ว (ยังอยู่ครบ ไม่ได้ถอด) */}
      <span
        className='absolute inline-end-[-2px] block-start-[-2px] is-[11px] bs-[11px] rounded-full bg-success text-white border-[1.5px] border-[var(--mui-palette-background-paper)] grid place-items-center'
        title='ยืนยันความเป็นเจ้าของแล้ว'
      >
        <Icon icon='lucide:check' width={7} />
      </span>
    </span>
  )
}
