// สีของฉาก 3D — สีสื่อความหมาย (สถานะ/โต๊ะ) อ่านจากโทเคนผ่าน getColor ห้ามฮาร์ดโค้ด
// ส่วนที่เป็น hex ด้านล่างคือ "สีวัสดุ" (ไม้/ผนัง/ผ้า) ที่ไม่มีโทเคนใน Paces — ค่าตรง mockup ที่ user อนุมัติ 2026-10-16
import { STATUS_TOKEN, TABLE_TOKEN } from '@/lib/chat-desk/channel-colors'
import type { DeskCustomerStatus, DeskTableKind } from '@/lib/chat-desk/types'
import { getColor } from '@/utils/helpers'

export type SceneTokens = {
  status: Record<DeskCustomerStatus, string>
  table: Record<DeskTableKind, string>
  primary: string
  danger: string
}

/** เรียกฝั่ง client เท่านั้น (getColor อ่าน CSS variable) — ฉากโหลดผ่าน dynamic ssr:false จึงปลอดภัย */
export function readTokens(): SceneTokens {
  const pick = <K extends string>(m: Record<K, string>) =>
    Object.fromEntries(Object.entries<string>(m).map(([k, t]) => [k, getColor(t)])) as Record<K, string>
  return { status: pick(STATUS_TOKEN), table: pick(TABLE_TOKEN), primary: getColor('primary'), danger: getColor('danger') }
}

// สีวัสดุ (ไม่มีโทเคน) — ทุกตัวเป็นโทนไม้/ผนัง/พรม/ผ้า ไม่มีเขียว ไม่มีม่วง
export const MATERIAL = {
  wallBack: '#e9e4dc', wallLeft: '#e2ddd4', skirting: '#cfc6b8', // HR7 carve-out: สีวัสดุฉาก 3D (ยกเว้น HR1 มติ 2026-10-16) ไม่มีโทเคน Paces
  signBoard: '#313a46', // HR7 carve-out: สีวัสดุฉาก 3D (ยกเว้น HR1 มติ 2026-10-16) ไม่มีโทเคน Paces
  doorFrame: '#8a6a4a', doorLeaf: '#9aa3ad', doorKnob: '#5b6470', // HR7 carve-out: สีวัสดุฉาก 3D (ยกเว้น HR1 มติ 2026-10-16) ไม่มีโทเคน Paces
  loungeRugOuter: '#e3d6c2', loungeRugInner: '#d8c8b0', // HR7 carve-out: สีวัสดุฉาก 3D (ยกเว้น HR1 มติ 2026-10-16) ไม่มีโทเคน Paces
  chairSeat: '#8796ab', chairBack: '#7a889c', // HR7 carve-out: สีวัสดุฉาก 3D (ยกเว้น HR1 มติ 2026-10-16) ไม่มีโทเคน Paces
  deskTop: '#f4f1ec', monitor: '#2b3040', deskChair: '#6e7a93', // HR7 carve-out: สีวัสดุฉาก 3D (ยกเว้น HR1 มติ 2026-10-16) ไม่มีโทเคน Paces
  rug: { ADMIN: '#cfe0f5', EXTERNAL: '#dde1e6', META_AI: '#b9c0c8', BOT: '#6c7581' } as Record<DeskTableKind, string>, // HR7 carve-out: สีวัสดุฉาก 3D (ยกเว้น HR1 มติ 2026-10-16) ไม่มีโทเคน Paces
  botBody: '#313a46', botHead: '#4a5563', botVisor: '#9fd6ec', // HR7 carve-out: สีวัสดุฉาก 3D (ยกเว้น HR1 มติ 2026-10-16) ไม่มีโทเคน Paces
  metaGem: '#c9d2dc', metaGlow: '#7f8a96', // HR7 carve-out: สีวัสดุฉาก 3D (ยกเว้น HR1 มติ 2026-10-16) ไม่มีโทเคน Paces
  skin: '#f1cba8', capsuleLeg: '#3a4256', // HR7 carve-out: สีวัสดุฉาก 3D (ยกเว้น HR1 มติ 2026-10-16) ไม่มีโทเคน Paces
  lightSky: '#ffffff', lightGround: '#b8a68c', // HR7 carve-out: สีวัสดุฉาก 3D (ยกเว้น HR1 มติ 2026-10-16) ไม่มีโทเคน Paces
  woodHue: 31,
} as const
