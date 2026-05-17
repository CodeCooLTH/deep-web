/**
 * SlipImageClient — client wrapper เล็กสำหรับ onError fallback ของ <img>
 * onError เป็น event handler ส่งข้าม RSC boundary ไม่ได้ → ต้องใช้ 'use client'
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/components/IssueDetailModal.tsx
 *       (img/preview block — same theme ancestor as verifications/[id] doc-preview)
 */
'use client'

import { Icon } from '@iconify/react'
import { useState } from 'react'

type Props = {
  slipFileId: string
  amount: number
}

export default function SlipImageClient({ slipFileId, amount }: Props) {
  const [errored, setErrored] = useState(false)

  if (errored) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
        <Icon icon="tabler:photo-off" className="text-4xl" />
        <p className="text-sm">ไม่สามารถโหลดสลิปได้</p>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/files/${slipFileId}`}
      alt={`สลิปโอนเงิน ฿${amount.toLocaleString('th-TH')}`}
      className="max-h-96 object-contain mx-auto"
      onError={() => setErrored(true)}
    />
  )
}
