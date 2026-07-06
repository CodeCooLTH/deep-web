import type { Metadata } from 'next'

import { MPageTitle } from '../_components/ui'
import ShopsBrowse from './ShopsBrowse'

export const metadata: Metadata = { title: 'ร้านค้า' }

/** ร้านค้าทั้งหมด (mobile) — ค้นหา + filter ตามเลเวล + infinite scroll (scale จริง) */
export default function MobileShopsPage() {
  return (
    <div className='flex flex-col gap-4'>
      <MPageTitle title='ร้านค้า' back='/dashboard' />
      <ShopsBrowse />
    </div>
  )
}
