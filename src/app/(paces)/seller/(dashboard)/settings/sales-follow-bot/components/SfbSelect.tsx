'use client'

/**
 * SfbSelect — Select2 (react-select) ของหน้าบอทติดตามยอดขาย: wrapper เดียวกับ ShipForm + คลาสประจำหน้าเพื่อแก้คอนทราสต์ชิป (UX §20)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/select/components/Select2.tsx
 *   (className="select2 react-select" classNamePrefix="react-select" · isMulti)
 * ห้าม native <select> (มติ Select2) · ค่าที่ส่งต่อเป็น prop ของ react-select ทั้งหมด
 */
import type { ComponentProps } from 'react'

import Select from '@/components/wrappers/Select'
import './sfb-select.css'

export default function SfbSelect(props: ComponentProps<typeof Select>) {
  const { className, ...rest } = props
  return <Select className={`select2 react-select sfb-select ${className ?? ''}`} classNamePrefix="react-select" {...rest} />
}
