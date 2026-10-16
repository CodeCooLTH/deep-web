// โทเคนสีของหน้าโต๊ะแชท — เก็บ "ชื่อโทเคน" ไม่ใช่ hex ตัวฉากอ่านค่าจริงผ่าน getColor() (HR16: ห้ามประกาศสีแบรนด์ซ้ำ)
import type { DeskCustomerStatus, DeskPlatform, DeskTableKind } from './types'

/** แถบสัดส่วนช่องทาง — คงที่ต่อช่องทาง กันสีสลับที่เมื่อลำดับเปลี่ยน */
export const CHANNEL_TOKEN: Record<DeskPlatform, string> = {
  DEEP: 'primary',
  MESSENGER: 'info',
  INSTAGRAM: 'dark',
  LINE: 'default-400',
}

export const CHANNEL_LABEL: Record<DeskPlatform, string> = {
  DEEP: 'Deep',
  MESSENGER: 'Messenger',
  INSTAGRAM: 'Instagram',
  LINE: 'LINE',
}

/** สีพื้นผิวตัวลูกค้าตามสถานะ (Design Spec §Legend) */
export const STATUS_TOKEN: Record<DeskCustomerStatus, string> = {
  WAITING: 'warning',
  RECENT: 'info',
  OVERDUE: 'danger',
}

/** สีหน้าโต๊ะ: น้ำเงิน = คนที่ระบบรู้จัก · เทา = ไม่ใช่แอดมินที่ระบบรู้จัก */
export const TABLE_TOKEN: Record<DeskTableKind, string> = {
  ADMIN: 'primary',
  EXTERNAL: 'default-400',
  META_AI: 'default-600',
  BOT: 'dark',
}
