'use client'

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
import { useState, type CSSProperties } from 'react'
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
  /** feature 00037 — ร้านเจ้าของเพจ ใช้จัดกลุ่มหัวข้อใน PageFilterDropdown เมื่ออยู่โหมดรวมหลายร้าน
   *  optional เพราะ caller ฝั่ง buyer/หน้าอื่นที่ไม่เกี่ยวกับกล่องแชทรวมไม่จำเป็นต้องส่ง */
  shopId?: string
  shopName?: string
}

type ChannelDisplay = {
  label: string
  icon: string
  /** DEEP ใช้ token Paces (text-primary) — MESSENGER/INSTAGRAM ใช้ brand color inline (ดู comment หัวไฟล์) */
  iconClassName?: string
  iconStyle?: CSSProperties
  /** โลโก้แบรนด์จริง (gradient) ใน public/ — Messenger/Instagram ใช้แทน tabler mono icon เพราะ
   *  ที่ขนาดเล็กโลโก้จริงจำง่ายกว่ามาก (user ยืนยัน ส่งไฟล์ Messenger มาให้เอง) DEEP = in-app ใช้ tabler */
  logoSrc?: string
}

const CHANNEL_DISPLAY: Record<ChatChannel, ChannelDisplay> = {
  DEEP: {
    label: 'Deep',
    icon: 'message-circle',
    iconClassName: 'text-primary',
  },
  MESSENGER: {
    // label ยังเป็น "Messenger" เพราะเป็นชื่อ "ช่องทาง" จริงที่ใช้ในแท็บกรอง/alt — แต่ไอคอนเปลี่ยน
    // จากโลโก้ Messenger เป็นโลโก้ Facebook ตามที่ user สั่ง 2026-07-23: ในมุมของแอดมินร้าน
    // เธรดพวกนี้คือ "คนทักเข้ามาที่เพจ Facebook" ไม่ใช่ "แอป Messenger" โลโก้ f จึงสื่อตรงกว่า
    label: 'Messenger',
    icon: 'brand-facebook', // fallback ถ้า logoSrc โหลดไม่ได้ (เช่น tabs ที่ยังใช้ Icon)
    logoSrc: '/images/logos/facebook.svg',
  },
  INSTAGRAM: {
    label: 'Instagram',
    icon: 'brand-instagram',
    // โลโก้ทรงกลม (user ส่งภาพมาให้ 2026-07-23) แทนทรงสี่เหลี่ยมมนของ instagram.svg เดิม —
    // ในรายการแชท badge ทุกช่องทางเป็นวงกลม (Messenger/Deep) ทรงสี่เหลี่ยมของ IG จึงเป็นตัวเดียว
    // ที่หลุดจังหวะ. ไล่สี = gradient แบรนด์ชุดเดียวกับไฟล์เดิม ไม่ได้คิดสีขึ้นเอง
    logoSrc: '/images/logos/instagram-circle.svg',
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
  /** รูปเพจจริงที่เธรดนี้ผูกอยู่ (ShopChannel.avatarUrl) — user สั่ง 2026-07-23: "ถ้า page มีรูป
   *  ให้ใช้รูป page แทน facebook.svg ถ้าไม่มีค่อย fallback" ร้านที่มีหลายเพจจะแยกออกทันทีว่า
   *  ลูกค้าทักมาจากเพจไหนโดยไม่ต้องอ่านตัวหนังสือ; โหลดรูปไม่สำเร็จ (URL ของ Meta หมดอายุ)
   *  → ถอยไปโลโก้ช่องทางเองอัตโนมัติ */
  imageUrl?: string | null
  /** ข้อความบน pill แทนชื่อช่องทาง — ใช้ใส่ "ชื่อเพจ" (user request 2026-07-23: ร้านที่มีหลายเพจ
   *  ต้องรู้ว่าลูกค้าคนนี้ทักมาจากเพจไหน คำว่า "Messenger" ซ้ำกันทุกเธรดจนไม่ให้ข้อมูลอะไร)
   *  โลโก้แบรนด์ยังอยู่เหมือนเดิม (บอกช่องทาง) — null/ไม่ส่ง = ใช้ชื่อช่องทางเหมือนเดิม (เธรด Deep) */
  label?: string | null
}

/** รูปเพจ + fallback เป็นโลโก้ช่องทางเมื่อโหลดไม่สำเร็จ (URL รูปเพจของ Meta หมดอายุได้) */
function BadgeImage({
  imageUrl,
  logoSrc,
  alt,
  className,
  width,
  height,
}: {
  imageUrl?: string | null
  logoSrc?: string
  alt: string
  className: string
  width?: number
  height?: number
}) {
  const [failed, setFailed] = useState(false)
  const src = !failed && imageUrl ? imageUrl : logoSrc
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}

/** inline pill badge (icon + label) — ใช้ข้าง header เธรด / ชื่อลูกค้าใน Customer Panel */
export function ChannelBadge({ channel, size = 'sm', label, imageUrl }: ChannelBadgeProps) {
  const display = getChannelDisplay(channel)
  const iconDim = size === 'md' ? 16 : 14
  const text = label?.trim() || display.label
  return (
    // max-w-56 + truncate: ชื่อเพจยาวได้ไม่จำกัด (ต่างจากชื่อช่องทางที่สั้นเสมอ) — กันดัน layout
    // header/Customer Panel พัง; title ให้ hover เห็นชื่อเต็ม
    <span
      className={`badge bg-default-100 text-default-700 inline-flex max-w-56 items-center gap-1 ${
        size === 'md' ? 'text-xs' : 'text-2xs'
      }`}
      title={text}
    >
      {imageUrl || display.logoSrc ? (
        // รูปเพจจริงถ้ามี ไม่งั้นโลโก้แบรนด์ (brand asset — Hard Rule 6 carve-out)
        // rounded-full เพราะรูปเพจเป็นสี่เหลี่ยม ต้องครอปเป็นวงกลมให้เข้าชุดกับโลโก้ที่กลมอยู่แล้ว
        <BadgeImage
          imageUrl={imageUrl}
          logoSrc={display.logoSrc}
          alt={display.label}
          width={iconDim}
          height={iconDim}
          className="shrink-0 rounded-full object-cover"
        />
      ) : (
        <Icon
          icon={display.icon}
          width={iconDim}
          height={iconDim}
          className={`shrink-0 ${display.iconClassName ?? ''}`}
          style={display.iconStyle}
        />
      )}
      <span className="truncate">{text}</span>
    </span>
  )
}

/**
 * overlay badge วงกลมมุมล่างขวาของ avatar — ต้องอยู่ใน wrapper ที่มี class `relative`
 *
 * Messenger/Instagram แสดง **โลโก้แบรนด์จริง** (gradient) เต็มวงกลม + ring ขาว — จำง่ายทันที
 * (user ยืนยัน ส่งไฟล์ Messenger มาให้เอง) โลโก้มีสี+รูปทรงในตัว ไม่ต้องมีพื้นทึบ
 * DEEP (in-app) ยังใช้พื้น bg-primary + ไอคอน tabler ขาว เพราะไม่มีโลโก้แบรนด์
 *
 * title + sr-only — ช่องทางเป็นข้อมูลสำคัญ (Messenger มีเงื่อนไข 24 ชม. แต่ Deep ไม่มี)
 * ผู้ใช้ screen reader ต้องรู้ด้วย
 */
export function ChannelBadgeOverlay({ channel, size = 'md', imageUrl }: ChannelBadgeProps) {
  const key = resolveChatChannel(channel)
  const display = CHANNEL_DISPLAY[key]
  // md ลดจาก size-5 (20px) เหลือ size-4 (16px) — user report 2026-07-23: badge ใหญ่จนบังรูปโปรไฟล์
  // จนดูเล็กกว่าความเป็นจริง (คู่กับการขยาย avatar เป็น size-10 ที่ InboxList)
  const dim = size === 'md' ? 'size-4' : 'size-3.5'
  const iconDim = size === 'md' ? 10 : 9

  if (imageUrl || display.logoSrc) {
    return (
      <span className={`ring-card absolute -end-0.5 -bottom-0.5 block ${dim} overflow-hidden rounded-full ring-2`} title={display.label}>
        {/* รูปเพจจริงถ้ามี ไม่งั้นโลโก้แบรนด์เต็มวงกลม (brand asset — Hard Rule 6 carve-out) */}
        <BadgeImage
          imageUrl={imageUrl}
          logoSrc={display.logoSrc}
          alt={display.label}
          className="size-full object-cover"
        />
        <span className="sr-only">{display.label}</span>
      </span>
    )
  }

  // DEEP — พื้น bg-primary + ไอคอน tabler ขาว (ไม่มีโลโก้แบรนด์)
  return (
    <span
      className={`ring-card bg-primary absolute -end-0.5 -bottom-0.5 flex ${dim} items-center justify-center rounded-full ring-2`}
      title={display.label}
    >
      <Icon icon={display.icon} width={iconDim} height={iconDim} className="text-white" />
      <span className="sr-only">{display.label}</span>
    </span>
  )
}
