/**
 * ChannelBadge — badge ช่องทางแชท (Deep / Messenger / Instagram) feat 00018 (T3)
 *
 * ไม่พบ theme match ตรง (Paces ไม่มี "channel badge" component) — closest primitive:
 *   Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css (`badge`) + Paces §6 "fixed badge"
 *   Base (overlay ring pattern): src/app/(paces)/seller/(dashboard)/dashboard/components/SellerHeader.tsx:66
 *     (`ring-2 ring-card` บน badge มุมของ avatar — ใช้ pattern เดียวกัน)
 * ดู docs/superpowers/specs/2026-07-22-facebook-chat-ui-design.md ตาราง "Theme Source Mapping"
 * แถว "Channel badge (avatar overlay)"
 *
 * สี brand (Messenger, Instagram — ดูค่า hex ที่ตัวแปร CHANNEL_DISPLAY ด้านล่าง):
 *   Hard Rule 6 exception — สี brand เป็น asset ใช้ตาม ref ได้ พร้อม comment กำกับ
 *   (pattern เดียวกับ src/app/(paces)/seller/(dashboard)/settings/ConnectedAccountsClient.tsx
 *   ที่ทำไว้แล้วสำหรับ Facebook/Instagram — ใช้ `style={{ color }}` บน Icon ไม่ใช่ arbitrary
 *   Tailwind class ตาม Hard Rule 7)
 * Instagram = ค่าเดิมที่มีอยู่แล้วในโค้ด; Messenger = ค่าที่สเปกเสนอ
 * (ยังไม่ verify อย่างเป็นทางการ — ดู Open Questions #1 ของสเปก)
 *
 * Paces primitive เท่านั้น — ห้าม arbitrary value (Hard Rule 7): ใช้ token class ทั้งหมด
 * (badge/bg-default-100/bg-card/ring-card/size-4/size-5) — สีเดียวที่เป็น hex ตรงคือ brand
 * color ผ่าน `style` ตามข้อยกเว้นข้างบนเท่านั้น
 *
 * ใช้ซ้ำที่: InboxList.tsx (overlay บน avatar แถวรายการ + icon บน channel tabs), และ
 * agent T4/T5 จะ import ไปใช้ที่ header เธรด (ChatThread.tsx) และ Customer Panel
 */
import type { CSSProperties } from 'react'
import Icon from '@/components/wrappers/Icon'

export type ChatChannel = 'DEEP' | 'MESSENGER' | 'INSTAGRAM'

/**
 * ตัวเลือกตัวกรอง "เพจ" — 1 ต่อ ShopChannel ที่เชื่อมไว้ (feat 00018 งาน 2: ย้ายมาจาก InboxList.tsx
 * เดิม {id,label} คงเป็น field ดิบ (provider/name/avatarUrl) ไม่ประกอบ label สำเร็จรูปอีกต่อไป —
 * PageFilterDropdown ต้องใช้ provider (ไอคอนช่องทาง) + name (ค้นหา/แสดงชื่อ) + avatarUrl (รูปเพจ)
 * แยกกัน ไม่ใช่ string เดียวเหมือนตัวกรองแบบ FilterDropdown ทั่วไป
 */
export type ChannelFilterOption = {
  id: string
  provider: string
  name: string
  avatarUrl: string | null
}

type ChannelDisplay = {
  label: string
  icon: string
  /** DEEP ใช้ token Paces (text-primary) — MESSENGER/INSTAGRAM ใช้ brand color inline (ดู comment หัวไฟล์) */
  iconClassName?: string
  iconStyle?: CSSProperties
}

const CHANNEL_DISPLAY: Record<ChatChannel, ChannelDisplay> = {
  DEEP: {
    label: 'Deep',
    icon: 'message-circle',
    iconClassName: 'text-primary',
  },
  MESSENGER: {
    label: 'Messenger',
    icon: 'brand-messenger',
    iconStyle: { color: '#0084FF' }, // Hard Rule 6 exception: Messenger brand color — brand asset ใช้ได้ตาม ref
  },
  INSTAGRAM: {
    label: 'Instagram',
    icon: 'brand-instagram',
    iconStyle: { color: '#E1306C' }, // Hard Rule 6 exception: Instagram brand color — ค่าเดิมที่มีอยู่แล้วใน ConnectedAccountsClient.tsx
  },
}

/** ค่าอื่นนอก 3 ค่านี้ (ข้อมูลเพี้ยน/อนาคต) → fallback เป็น DEEP — ห้าม crash */
export function resolveChatChannel(channel: string): ChatChannel {
  return channel === 'MESSENGER' || channel === 'INSTAGRAM' ? channel : 'DEEP'
}

/** export ให้ที่อื่น (เช่น channel tabs ใน InboxList) ใช้ icon/สีชุดเดียวกันได้โดยไม่ต้อง render ทั้ง badge */
export function getChannelDisplay(channel: string): ChannelDisplay {
  return CHANNEL_DISPLAY[resolveChatChannel(channel)]
}

export type ChannelBadgeProps = {
  /** 'DEEP' | 'MESSENGER' | 'INSTAGRAM' — ค่าอื่น fallback เป็น DEEP */
  channel: string
  size?: 'sm' | 'md'
}

/** inline pill badge (icon + label) — ใช้ข้าง header เธรด / ชื่อลูกค้าใน Customer Panel */
export function ChannelBadge({ channel, size = 'sm' }: ChannelBadgeProps) {
  const display = getChannelDisplay(channel)
  const iconDim = size === 'md' ? 16 : 14
  return (
    <span
      className={`badge bg-default-100 text-default-700 inline-flex items-center gap-1 ${
        size === 'md' ? 'text-xs' : 'text-2xs'
      }`}
    >
      <Icon icon={display.icon} width={iconDim} height={iconDim} className={display.iconClassName} style={display.iconStyle} />
      {display.label}
    </span>
  )
}

/**
 * overlay badge วงกลมมุมล่างขวาของ avatar — ต้องอยู่ใน wrapper ที่มี class `relative`
 *
 * ใช้ **พื้นสีแบรนด์ทึบ + ไอคอนขาว** ไม่ใช่พื้นขาว+ไอคอนสี เพราะที่ขนาดเท่านี้ไอคอนสีบางเส้น
 * บนพื้นขาวแยกไม่ออกด้วยการกวาดตา (feedback จาก user บน prod: "อยากให้แยกออกว่าอันไหน
 * in-app อันไหน Facebook") — พื้นทึบให้ contrast ระดับที่รู้ทันทีว่าแถวไหนมาจากช่องทางไหน
 *
 * มี title + sr-only ด้วย — เดิม aria-hidden ทำให้ผู้ใช้ screen reader ไม่รู้เลยว่าเธรดนี้
 * มาจากช่องทางไหน ทั้งที่เป็นข้อมูลสำคัญ (ตอบ Messenger มีเงื่อนไข 24 ชม. แต่ Deep ไม่มี)
 */
export function ChannelBadgeOverlay({ channel, size = 'md' }: ChannelBadgeProps) {
  const key = resolveChatChannel(channel)
  const display = CHANNEL_DISPLAY[key]
  const dim = size === 'md' ? 'size-5' : 'size-4'
  const iconDim = size === 'md' ? 12 : 10
  // DEEP ใช้ token Paces (bg-primary) — อีกสองช่องทางเป็นสีแบรนด์ (Hard Rule 6 exception)
  const isDeep = key === 'DEEP'
  return (
    <span
      className={`ring-card absolute -end-0.5 -bottom-0.5 flex ${dim} items-center justify-center rounded-full ring-2 ${
        isDeep ? 'bg-primary' : ''
      }`}
      style={isDeep ? undefined : { backgroundColor: display.iconStyle?.color }}
      title={display.label}
    >
      <Icon icon={display.icon} width={iconDim} height={iconDim} className="text-white" />
      <span className="sr-only">{display.label}</span>
    </span>
  )
}
