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
import { getChannelLabel, resolveChatChannel, type ChatChannel } from '@/lib/chat-channel'

/**
 * ชนิด + ชื่อช่องทางย้ายไปอยู่ `@/lib/chat-channel` (ไฟล์บริสุทธิ์ ไม่มี React) เพราะ push
 * notification ฝั่ง server ต้องใช้ "คำเดียวกัน" กับที่แสดงในกล่องแชท แต่ import ไฟล์นี้ไม่ได้
 * (`'use client'` + Icon wrapper) — re-export ไว้ให้ call-site เดิมที่ import จากที่นี่ใช้ต่อได้เหมือนเดิม
 */
export { resolveChatChannel, type ChatChannel }

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
    label: getChannelLabel('DEEP'),
    icon: 'message-circle',
    iconClassName: 'text-primary',
  },
  MESSENGER: {
    // label ยังเป็น "Messenger" เพราะเป็นชื่อ "ช่องทาง" จริงที่ใช้ในแท็บกรอง/alt — แต่ไอคอนเปลี่ยน
    // จากโลโก้ Messenger เป็นโลโก้ Facebook ตามที่ user สั่ง 2026-07-23: ในมุมของแอดมินร้าน
    // เธรดพวกนี้คือ "คนทักเข้ามาที่เพจ Facebook" ไม่ใช่ "แอป Messenger" โลโก้ f จึงสื่อตรงกว่า
    label: getChannelLabel('MESSENGER'),
    icon: 'brand-facebook', // fallback ถ้า logoSrc โหลดไม่ได้ (เช่น tabs ที่ยังใช้ Icon)
    logoSrc: '/images/logos/facebook.svg',
  },
  INSTAGRAM: {
    label: getChannelLabel('INSTAGRAM'),
    icon: 'brand-instagram',
    // โลโก้ทรงกลม (user ส่งภาพมาให้ 2026-07-23) แทนทรงสี่เหลี่ยมมนของ instagram.svg เดิม —
    // ในรายการแชท badge ทุกช่องทางเป็นวงกลม (Messenger/Deep) ทรงสี่เหลี่ยมของ IG จึงเป็นตัวเดียว
    // ที่หลุดจังหวะ. ไล่สี = gradient แบรนด์ชุดเดียวกับไฟล์เดิม ไม่ได้คิดสีขึ้นเอง
    logoSrc: '/images/logos/instagram-circle.svg',
  },
  LINE: {
    // feature 00025 S-14a — โลโก้จริง (asset มีอยู่แล้ว) เป็นตัวแสดงหลัก เหมือน Messenger/Instagram
    // icon = fallback เมื่อ logoSrc โหลดไม่ขึ้น (BadgeImage.onError ถอยไป Icon อัตโนมัติไม่ได้ — แต่
    // แถวที่ไม่มี logoSrc เลยจะใช้ icon เป็นตัวหลักแทน ดู ChannelBadge/ChannelBadgeOverlay ด้านล่าง)
    // 'brand-line' ยืนยันมีจริงใน Tabler icon set (@tabler/icons/icons/outline/brand-line.svg) —
    // เหมือน brand-facebook/brand-instagram ที่ใช้อยู่แล้วก็ไม่อยู่ใน gallery ของ Paces docs เช่นกัน
    label: getChannelLabel('LINE'),
    icon: 'brand-line',
    // สี brand LINE #06C755 — Hard Rule 6 carve-out (asset สีตามแบรนด์จริง) ผ่าน `style` เท่านั้น
    // ตาม pattern เดียวกับ Messenger/Instagram ในไฟล์นี้ — ใช้เฉพาะตอน fallback เป็น Icon (ไม่มี
    // logoSrc/imageUrl) เพราะ logoSrc เป็น .svg ที่มีสีในตัวอยู่แล้ว
    iconStyle: { color: '#06C755' }, // Hard Rule 6 exception: LINE brand color — brand asset ใช้ได้ตาม ref
    logoSrc: '/images/logos/line.svg',
  },
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
 * ChannelMark — เครื่องหมายช่องทางขนาดจิ๋ว ไม่มีพื้นหลัง ไม่มี ring สำหรับ "บรรทัดที่มา"
 * ในแถวรายการอินบ็อกซ์ (มติแบบ C จาก mockup 2026-08-09 ที่ user เลือก)
 *
 * 🛑 ทำไมใช้โลโก้ซ้ำ ไม่ใช่ "จุดสี" ตามที่ร่างไว้ตอนแรก: จุดสีล้วนสื่อด้วย *สี* อย่างเดียว
 * ซึ่งเป็นเหตุผลเดียวกับที่ mockup ปฏิเสธแบบ B ไปแล้ว (อ่านยาก + ไม่ผ่านเกณฑ์ a11y ที่ห้าม
 * พึ่งสีอย่างเดียว) และการตั้งค่าสี hex ของแต่ละแบรนด์เพิ่มที่นี่ = สร้างนิยามสีแบรนด์ชุดที่สอง
 * ขึ้นมาคู่ขนานกับ logoSrc/iconStyle ที่มีอยู่แล้วในไฟล์นี้ (Hard Rule 16) — ใช้ของเดิมซ้ำจึง
 * ได้ทั้ง "รูปทรง + สี" และไม่มีค่าคงที่ใหม่ให้หลุด sync วันหลัง
 */
export function ChannelMark({ channel, imageUrl }: { channel: string; imageUrl?: string | null }) {
  const display = getChannelDisplay(channel)
  // รูปเพจ/LINE OA จริงมาก่อนเสมอ (user สั่ง 2026-08-09) — badge มุม avatar บอกแพลตฟอร์มไปแล้ว
  // เอาโลโก้แพลตฟอร์มมาซ้ำตรงนี้อีกจึงไม่ให้ข้อมูลใหม่ ส่วนรูปเพจช่วยจำได้เร็วกว่าเมื่อร้านตั้ง
  // โลโก้ต่างกันต่อเพจ · โหลดไม่สำเร็จ (URL รูปเพจของ Meta หมดอายุได้) → ถอยไปโลโก้แพลตฟอร์มเอง
  if (imageUrl || display.logoSrc) {
    return (
      <BadgeImage
        imageUrl={imageUrl}
        logoSrc={display.logoSrc}
        alt=""
        width={12}
        height={12}
        className="size-3 shrink-0 rounded-full object-cover"
      />
    )
  }
  // DEEP — ไม่มีโลโก้แบรนด์ ใช้ tabler icon + token สีเดิมของช่องทาง (ไม่ใช่ hex)
  return (
    <Icon
      icon={display.icon}
      width={12}
      height={12}
      aria-hidden="true"
      className={`size-3 shrink-0 ${display.iconClassName ?? ''}`}
      style={display.iconStyle}
    />
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
