import clsx, { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const generateInitials = (name = ''): string => {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export const toPascalCase = (value: string) =>
  value
    .replace(/[-_ ]+/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')

export const toTitleCase = (value?: string) => {
  if (!value) return ''
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export const formatBytes = (bytes: number, decimals: number = 2) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * สีจาก token ของธีมสำหรับ **style ใน DOM ที่ render บนเซิร์ฟเวอร์ด้วย** (จุด legend ฯลฯ)
 *
 * ห้ามใช้ getColor ใน style ของ JSX: บนเซิร์ฟเวอร์ getColor คืนสีสำรอง rgba(0,0,0,0.2) (ไม่มี CSS ให้อ่าน)
 * แต่ในเบราว์เซอร์คืนสีจริง ⇒ hydration mismatch (เจอบนแดชบอร์ดคอม 2026-10-12) · var() เป็นสตริงเดียวกัน
 * ทั้งสองฝั่ง แล้วเบราว์เซอร์แปลงเป็นสีเดียวกับที่ getColor อ่าน (`--color-${v}`) · getColor ยังใช้กับ option ของกราฟ
 */
export const colorVar = (v: string): string => `var(--color-${v}, rgba(0,0,0,0.2))`

export function getColor(v: string, a: number = 1): string {
  if (typeof window === 'undefined') return 'rgba(0,0,0,0.2)'

  const val = getComputedStyle(document.documentElement).getPropertyValue(`--color-${v}`).trim()

  if (!val) return 'rgba(0,0,0,0.2)'

  if (a === 1) return val

  if (val.startsWith('#')) {
    const c = val.replace('#', '')
    const bigint = parseInt(c, 16)
    const r = (bigint >> 16) & 255
    const g = (bigint >> 8) & 255
    const b = bigint & 255
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }

  if (val.startsWith('rgb')) {
    const rgb = val.match(/\d+,\s*\d+,\s*\d+/)?.[0]
    return rgb ? `rgba(${rgb}, ${a})` : val
  }

  return val
}

export const getFont = () => {
  if (typeof window === 'undefined') {
    return
  }
  return getComputedStyle(document.body).fontFamily.trim()
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const splitArray = <T>(arr: T[], size: number): T[][] => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))
}
