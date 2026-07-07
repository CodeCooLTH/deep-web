import type { Metadata } from 'next'

import { MPageTitle } from '../_components/ui'
import ShopsBrowse from './ShopsBrowse'

export const metadata: Metadata = { title: 'ร้านค้า' }

/** ร้านค้าทั้งหมด (mobile) — ค้นหา + filter ตามเลเวล/หมวด + infinite scroll (scale จริง).
 * ?category=<key> มาจากหน้า home (หมวดหมู่ร้านค้า) → เปิดมาพร้อม filter หมวดนั้น */
export default async function MobileShopsPage({
  searchParams
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams
  return (
    <div className='flex flex-col gap-4'>
      <MPageTitle title='ร้านค้า' back='/dashboard' />
      <ShopsBrowse initialCategory={category} />
    </div>
  )
}
