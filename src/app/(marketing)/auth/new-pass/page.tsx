import type { Metadata } from 'next'
import NewPassCard from './NewPassCard'

export const metadata: Metadata = { title: 'ตั้งรหัสผ่านใหม่' }

export default function NewPassPage() {
  return <NewPassCard />
}
