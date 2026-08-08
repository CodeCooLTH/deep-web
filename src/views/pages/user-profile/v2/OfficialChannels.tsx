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

import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

export type OfficialChannel = {
  provider: string
  name: string
  avatarUrl: string | null
  externalId: string
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

function ChannelAvatar({ src, bg, icon }: { src: string | null; bg: string; icon: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span
      className='is-[38px] bs-[38px] rounded-xl shrink-0 relative flex items-center justify-center text-white overflow-hidden'
      style={{ background: bg }}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- รูปจากแพลตฟอร์มภายนอก หลากโดเมน
        <img src={src} alt='' className='is-full bs-full object-cover' onError={() => setFailed(true)} />
      ) : (
        <Icon icon={icon} width={19} />
      )}
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
            {href && (
              <span className='text-[13px] font-semibold text-primary shrink-0 flex items-center gap-1'>
                เปิด
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
