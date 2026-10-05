/**
 * GroupStatusBadge — ป้ายสถานะกลุ่ม (ผูกแล้ว / รอผูก / บอทถูกนำออก / หยุดส่งเพราะแพ็กเกจ)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (.badge + bg-{tone}/15)
 * + src/app/(paces)/seller/(dashboard)/settings/channels/LineChannelCard.tsx (TONE_BADGE → `-ink`)
 *
 * รับ `GroupBadge` จาก presenter แล้ว render อย่างเดียว — ห้ามตัดสินสถานะ/สีเองที่นี่
 */
import Icon from '@/components/wrappers/Icon'
import type { GroupBadge } from '@/lib/line-report/presenter'
import { TONE_BADGE } from './tone'

export default function GroupStatusBadge({ badge }: { badge: GroupBadge }) {
  return (
    <span className={`badge inline-flex items-center gap-1 ${TONE_BADGE[badge.tone]}`}>
      <Icon icon={badge.icon} className="text-sm" aria-hidden="true" />
      {badge.label}
    </span>
  )
}
