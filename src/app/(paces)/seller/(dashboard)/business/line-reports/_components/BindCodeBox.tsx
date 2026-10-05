'use client'

/**
 * BindCodeBox — กล่องโค้ดผูกกลุ่ม (`ผูก K7M2-XQ4P`) + คัดลอก + นับถอยหลัง · หมดอายุ → กล่องเทา + ปุ่มสร้างใหม่
 *
 * Base: ไม่พบ theme match สำหรับ "กล่องแสดงโค้ด" (addendum E §9 ข้อ 3) — ใช้ `bg-light rounded-lg p-4`
 * (theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx กล่องพื้นจาง) + .btn จาก _buttons.css
 *
 * 🛑 โค้ดเป็น Anuphan + tabular-nums + tracking-wide + whitespace-nowrap — ห้ามใช้แบบ monospace (ฆ่าฟอนต์ไทย)
 * 🛑 ค่าคัดลอก = `ผูก ${code}` ทั้งประโยค (วางในกลุ่มแล้วส่งได้เลย) · CopyLinkButton ห้ามส่ง preview (มีฟอนต์ monospace ในตัว)
 * 🛑 `code` มาจาก state ของ wizard เท่านั้น — ไม่เก็บ localStorage/URL (hash at rest ฝั่ง server)
 */
import Icon from '@/components/wrappers/Icon'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'
import CodeCountdown from './CodeCountdown'

type Props = {
  code: string
  expiresAt: string
  expired: boolean
  busy: boolean
  blockedReason: string | null
  onExpire: () => void
  onRegenerate: () => void
}

export default function BindCodeBox({ code, expiresAt, expired, busy, blockedReason, onExpire, onRegenerate }: Props) {
  if (expired) {
    return (
      <div className="bg-default-100 rounded-lg p-4">
        <p className="text-default-800 mb-3 text-sm font-medium">โค้ดหมดอายุแล้ว</p>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={busy || blockedReason !== null}
          className="btn btn-sm bg-primary hover:bg-primary-hover inline-flex w-full items-center justify-center gap-1.5 text-white sm:w-auto"
        >
          <Icon icon={busy ? 'loader-2' : 'refresh'} className={`text-base ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
          สร้างโค้ดใหม่
        </button>
        {blockedReason && <p className="text-default-700 mt-2 mb-0 text-xs">{blockedReason}</p>}
      </div>
    )
  }
  return (
    <div className="bg-light rounded-lg p-4">
      <p className="text-default-700 mb-2 text-xs">พิมพ์ข้อความนี้ในกลุ่ม LINE</p>
      <p className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-default-700 text-base font-medium">ผูก</span>
        <span className="text-default-900 text-2xl font-semibold tracking-wide whitespace-nowrap tabular-nums select-all">{code}</span>
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CopyLinkButton value={`ผูก ${code}`} label="คัดลอกข้อความ" successMessage="คัดลอกข้อความแล้ว" />
        <CodeCountdown expiresAt={expiresAt} prefix="ใช้ได้อีก " variant="badge" onExpire={onExpire} />
      </div>
      <p className="text-default-700 mb-0 text-xs">ในโค้ดไม่มีตัวอักษร O, I, L — 0 และ 1 คือตัวเลข พิมพ์ตัวเล็กหรือตัวใหญ่ก็ได้</p>
    </div>
  )
}
