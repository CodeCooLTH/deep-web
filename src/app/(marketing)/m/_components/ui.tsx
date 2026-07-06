// Presentational primitives ใช้ร่วมทุกหน้า /m (server-safe, ไม่มี client JS) — ยึดสไตล์ home/โปรไฟล์:
// การ์ดมน rounded-2xl ขอบจาง, หัวข้อ 15-17px, empty-state ไอคอนในวงกลม. เก็บดีไซน์ที่เดียว กันเพี้ยน.
import type { ReactNode } from 'react'
import Link from 'next/link'

import MBackButton from './MBackButton'

// หัวหน้าเพจ (AppTopBar ไม่โชว์ชื่อหน้า จึงต้องมี h1 ในเพจเอง).
// back = fallback href ของปุ่มย้อนกลับ (ใส่เฉพาะหน้า sub ที่ไม่ใช่ tab ล่าง)
export const MPageTitle = ({ title, action, back }: { title: string; action?: ReactNode; back?: string }) => (
  <div className='flex items-center gap-1.5'>
    {back && <MBackButton fallback={back} />}
    <h1 className='flex-1 text-[17px] font-semibold m-0 text-[var(--mui-palette-text-primary)]'>{title}</h1>
    {action}
  </div>
)

// การ์ดพื้นฐาน
export const MCard = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] ${className}`}>
    {children}
  </div>
)

// สถานะว่าง — ไอคอนในวงกลม + ข้อความ (+ ปุ่มเสริม)
export const MEmpty = ({
  icon,
  text,
  hint,
  cta
}: {
  icon: string
  text: string
  hint?: string
  cta?: { href: string; label: string }
}) => (
  <div className='flex flex-col items-center justify-center gap-2 pbs-16 pbe-10 text-center'>
    <div className='size-16 rounded-full bg-[var(--mui-palette-action-hover)] flex items-center justify-center'>
      <i className={`${icon} text-[28px] text-[var(--mui-palette-text-disabled)]`} />
    </div>
    <p className='text-[14px] m-0 text-[var(--mui-palette-text-secondary)]'>{text}</p>
    {hint && <p className='text-[12px] m-0 text-[var(--mui-palette-text-disabled)]'>{hint}</p>}
    {cta && (
      <Link
        href={cta.href}
        className='mbs-2 inline-flex items-center gap-1 h-9 pli-4 rounded-lg no-underline text-[13px] font-medium bg-[var(--mui-palette-primary-main)] text-white active:opacity-80 transition-opacity'
      >
        {cta.label}
      </Link>
    )}
  </div>
)

// chip เล็ก (สถานะ/แท็ก) — สีจาก semantic token
export type SemColor = 'warning' | 'info' | 'success' | 'error' | 'primary' | 'secondary'
export const MChip = ({ label, color }: { label: string; color: SemColor }) => (
  <span
    className='inline-flex items-center text-[11px] font-medium leading-none pli-2 plb-1 rounded-full'
    style={{
      background: `var(--mui-palette-${color}-lightOpacity)`,
      color: `var(--mui-palette-${color}-main)`
    }}
  >
    {label}
  </span>
)
