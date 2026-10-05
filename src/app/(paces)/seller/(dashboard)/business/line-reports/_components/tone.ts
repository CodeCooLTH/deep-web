/**
 * tone → คลาสของ Paces (ใช้ร่วมทุกจอของรายงานกลุ่ม LINE)
 *
 * ทำไมไม่อยู่ใน lib: เป็นคลาส Tailwind (lib/presenter ต้อง pure ไม่ลากคลาสเข้า) · ความหมายของ tone ตัดสินที่ presenter แล้ว
 * ตัวหนังสือบนพื้นจางใช้ `-ink` ทุกจุด (contrast) · neutral = ไม่ใช่เขียว/แดง
 */
import type { Tone } from '@/lib/line-report/presenter'

export const TONE_BADGE: Record<Tone, string> = {
  success: 'bg-success/15 text-success-ink',
  warning: 'bg-warning/15 text-warning-ink',
  danger: 'bg-danger/15 text-danger-ink',
  neutral: 'bg-default-100 text-default-700',
}

export const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success-ink',
  warning: 'text-warning-ink',
  danger: 'text-danger-ink',
  neutral: 'text-default-700',
}
