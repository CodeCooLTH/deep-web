import Icon from '@/components/wrappers/Icon'

type Status = 'PENDING' | 'APPROVED' | 'REJECTED'

interface StatusBadgeProps {
  status: Status
}

const config: Record<Status, { label: string; icon: string; cls: string }> = {
  APPROVED: {
    label: '✓ ผ่านแล้ว',
    // mdi:check-circle → tabler:circle-check (ผ่าน wrapper ไม่ต้อง prefix)
    icon: 'circle-check',
    cls: 'bg-success/10 text-success',
  },
  PENDING: {
    label: 'รอตรวจสอบ',
    // mdi:clock-outline → tabler:clock
    icon: 'clock',
    cls: 'bg-warning/10 text-warning',
  },
  REJECTED: {
    label: 'ถูกปฏิเสธ',
    // mdi:close-circle → tabler:circle-x
    icon: 'circle-x',
    cls: 'bg-danger/10 text-danger',
  },
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { label, icon, cls } = config[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}
    >
      <Icon icon={icon} className="size-3.5" />
      {label}
    </span>
  )
}
