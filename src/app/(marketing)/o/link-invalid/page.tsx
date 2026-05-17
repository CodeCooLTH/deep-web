/**
 * /o/link-invalid — static RSC page สำหรับ SMS code failure ทุกประเภท
 *
 * RC-2 uniform: ทุก failure path (rate-limit / format / not-found / expired /
 * used / phone-mismatch / order-mismatch) redirect มาที่นี่ — URL เดียว
 * ไม่มี query param หรือ reason ที่เป็น oracle enumeration
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/NotFound.tsx
 *       (via SmsErrorPage component ที่ copy จาก NotFound pattern ไว้แล้ว)
 *
 * Font: inherit จาก (marketing)/layout.tsx (Anuphan CSS variable) — ไม่ hardcode
 */
import type { Metadata } from 'next'

import SmsErrorPage from '../_components/SmsErrorPage'

export const metadata: Metadata = { title: 'ลิงก์ไม่ถูกต้อง' }

export default function LinkInvalidPage() {
  return <SmsErrorPage />
}
