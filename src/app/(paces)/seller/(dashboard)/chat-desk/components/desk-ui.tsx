// ชิ้นส่วนเล็กที่หลายการ์ด/รายการใช้ร่วม — สถานะลูกค้า · โลโก้ช่องทาง · จุดออนไลน์ (สีตามตารางเดียวกับ legend: Design Spec §Legend)
import Icon from '@/components/wrappers/Icon'
import { ChannelMark } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import { CHANNEL_LABEL } from '@/lib/chat-desk/channel-colors'
import type { DeskCustomerStatus, DeskPlatform } from '@/lib/chat-desk/types'

/** ชิปสถานะ — ไม่พึ่งสีอย่างเดียว: มีไอคอน + ข้อความ (เทียบ Design Spec §Legend กลุ่มลูกค้า) */
export const STATUS_CHIP: Record<DeskCustomerStatus, { label: string; cls: string; icon: string }> = {
  WAITING: { label: 'รอคำตอบ', cls: 'bg-warning/15 text-warning-ink', icon: 'clock' },
  OVERDUE: { label: 'เกินเวลาตอบ', cls: 'bg-danger/15 text-danger-ink', icon: 'alert-triangle' },
  RECENT: { label: 'ร้านเพิ่งตอบ', cls: 'bg-info/15 text-info-ink', icon: 'messages' },
}

export function StatusChip({ status }: { status: DeskCustomerStatus }) {
  const c = STATUS_CHIP[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${c.cls}`}>
      <Icon icon={c.icon} width={12} height={12} aria-hidden="true" />
      {c.label}
    </span>
  )
}

/** โลโก้ช่องทางในวงกลมเทา — ช่องทางอยู่ที่นี่ ไม่ใช่สีตัว (มติ Controller ข้อ 3) */
export function ChannelDot({ platform, size = 'size-6' }: { platform: DeskPlatform; size?: string }) {
  return (
    <span className={`${size} bg-light text-default-700 grid shrink-0 place-items-center rounded-full`} role="img" aria-label={CHANNEL_LABEL[platform]} title={CHANNEL_LABEL[platform]}>
      <ChannelMark channel={platform} />
    </span>
  )
}

/** จุดออนไลน์: ทึบน้ำเงิน = ออนไลน์ · วงกลวง = ออฟไลน์ · ไม่มีจุด = ตรวจไม่ได้ (ห้ามขึ้นออฟไลน์ BR-CD-12) */
export function OnlineDot({ online }: { online: boolean | null }) {
  if (online === null) return null
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${online ? 'bg-primary' : 'border-default-400 border'}`} />
}
