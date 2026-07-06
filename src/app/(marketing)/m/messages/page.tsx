import type { Metadata } from 'next'

import { MPageTitle } from '../_components/ui'
import MessagesInbox from './MessagesInbox'

export const metadata: Metadata = { title: 'ข้อความ' }

export default function MobileMessagesPage() {
  return (
    <div className='flex flex-col gap-4'>
      <MPageTitle title='ข้อความ' />
      <MessagesInbox />
    </div>
  )
}
