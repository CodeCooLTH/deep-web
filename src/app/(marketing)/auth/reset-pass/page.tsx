import type { Metadata } from 'next'

import ResetPassCard from './ResetPassCard'

export const metadata: Metadata = { title: 'ลืมรหัสผ่าน' }

export default function ResetPassPage() {
  return <ResetPassCard />
}
