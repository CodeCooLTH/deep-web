'use client'

/**
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_buttons.css (btn/btn-sm primitive)
 *
 * Generalize: รับ value (full URL/text) จาก caller แทนที่จะ resolve URL ภายใน
 * - เพิ่ม props: value, label, iconOnly, className, showPreview
 * - ลบ resolveBuyerBaseUrl ออกจาก component — caller รับผิดชอบ resolve
 * - D7: icon เปลี่ยนจาก inline SVG → tabler:copy → tabler:check ~1.2s แล้วคืนค่าเดิม
 * - คง fallback clipboard (execCommand) สำหรับ HTTP context
 */

import Icon from '@/components/wrappers/Icon'
import { useState } from 'react'
import { pacesToast } from '@/lib/paces-toast'

interface CopyButtonProps {
  /** ข้อความหรือ URL ที่ต้องการ copy */
  value: string
  /** ป้ายปุ่ม (default: "คัดลอก") */
  label?: string
  /** แสดงเฉพาะ icon ไม่มี label text */
  iconOnly?: boolean
  /** class เพิ่มเติมบนปุ่ม */
  className?: string
  /** แสดง URL preview bar ด้านซ้ายปุ่ม (default: false) */
  showPreview?: boolean
}

export default function CopyLinkButton({
  value,
  label = 'คัดลอก',
  iconOnly = false,
  className = '',
  showPreview = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const writeText = async () => {
      try {
        await navigator.clipboard.writeText(value)
      } catch {
        // Fallback สำหรับ HTTP (non-HTTPS) context
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
    }

    try {
      await writeText()
      pacesToast.success('คัดลอกลิงก์แล้ว')
      setCopied(true)
      // D7: คืน icon กลับหลัง 1.2s
      setTimeout(() => setCopied(false), 1200)
    } catch {
      pacesToast.error('ไม่สามารถคัดลอกได้ โปรดคัดลอกด้วยตนเอง')
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      {showPreview && (
        <span className="text-xs text-default-700 font-mono bg-default-100 px-3 py-1.5 rounded-lg flex-1 min-w-0 truncate select-all">
          {value}
        </span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={iconOnly ? label : undefined}
        className={
          iconOnly
            ? // icon-only → btn-icon จริง (icon centered, ไม่มี px override) ขนาด = ปุ่ม action อื่น
              `btn btn-icon border border-default-300 bg-card hover:bg-default-50 text-default-700 flex-shrink-0 transition-colors ${copied ? 'border-success text-success' : ''} ${className}`.trim()
            : `btn btn-sm border border-default-300 bg-card hover:bg-default-50 text-default-700 inline-flex items-center gap-1.5 text-xs flex-shrink-0 transition-colors ${copied ? 'border-success text-success' : ''} ${className}`.trim()
        }
      >
        <Icon
          icon={copied ? 'check' : 'copy'}
          className={iconOnly ? 'text-base' : undefined}
          width={iconOnly ? undefined : 14}
          height={iconOnly ? undefined : 14}
        />
        {!iconOnly && label}
      </button>
    </div>
  )
}
