'use client'

import Button, { type ButtonProps } from '@mui/material/Button'
import Chip, { type ChipProps } from '@mui/material/Chip'
import NextLink from 'next/link'
import type React from 'react'

type LinkOnlyProps = { href: string }

export function LinkButton({
  href,
  ...rest
}: Omit<ButtonProps, 'component' | 'href'> & LinkOnlyProps) {
  const Cmp = Button as unknown as (
    p: ButtonProps & { component: typeof NextLink; href: string },
  ) => React.ReactElement
  return <Cmp {...rest} component={NextLink} href={href} />
}

export function LinkChip({
  href,
  ...rest
}: Omit<ChipProps, 'component' | 'href' | 'clickable'> & LinkOnlyProps) {
  const Cmp = Chip as unknown as (
    p: ChipProps & { component: typeof NextLink; href: string; clickable: true },
  ) => React.ReactElement
  /* 🛑 `minBlockSize: 44` — `LinkChip` เป็น **ตัวกรองที่กดได้** ไม่ใช่ป้ายอ่านอย่างเดียว
     MUI `Chip` ให้ความสูง 32px ซึ่งต่ำกว่า tap target ที่ DESIGN.md §Do's บังคับ
     (วัดบน `/orders` และ `/reviews` มือถือ 2026-08-31: ตัวกรองทุกใบ 32px)
     ป้ายที่กดไม่ได้ (`<Chip>` ตรง ๆ) ไม่โดนกฎนี้ — มันไม่ใช่เป้าให้นิ้ว */
  return <Cmp {...rest} component={NextLink} href={href} clickable sx={{ minBlockSize: 44, ...rest.sx }} />
}
