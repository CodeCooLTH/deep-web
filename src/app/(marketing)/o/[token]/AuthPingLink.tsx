'use client'

/**
 * AuthPingLink — ปุ่ม/ลิงก์ "ไปหน้าเข้าสู่ระบบ" ที่ยิงบันทึกว่าเริ่ม auth flow ก่อนเปลี่ยนหน้า
 *
 * 🛑 นี่คือ **client island ตัวเดียว** ของหน้า `/o/[token]` โหมด guest — เหตุผลที่แยกไฟล์:
 * ก่อนหน้านี้ `GuestOrderView.tsx` ทั้ง 460 บรรทัดเป็น `'use client'` เพื่อ `onClick` สองจุดนี้
 * เท่านั้น ⇒ จอแรกที่ผู้ซื้อทุกคนเปิดจากมือถือ (PRODUCT.md: ส่วนใหญ่เจอ Deep ครั้งแรกที่นี่)
 * ต้องดาวน์โหลด+hydrate ต้นไม้ทั้งก้อนทั้งที่เนื้อหาเกือบทั้งหมดคงที่
 *
 * ที่เหลือของหน้าเป็น server component ได้เพราะ `@iconify/react` ใช้ใน RSC ได้ในโปรเจกต์นี้
 * (`TrustPill.tsx` ในโฟลเดอร์เดียวกันทำอยู่แล้ว) — ถ้าวันหนึ่งต้องเพิ่ม state ในหน้านี้
 * ให้แตก island ใหม่แทนการเติม `'use client'` กลับไปที่ไฟล์ใหญ่
 *
 * 🛑 ห้ามใส่ mutation ใด ๆ ที่นี่ — ทุกปุ่มที่ผูกตัวตนบนจอ guest เป็น "ลิงก์ไปหน้า login"
 * เท่านั้น (BR-BOE-06/07) ต่อให้ server ปฏิเสธอยู่แล้ว UI ก็ต้องไม่หลอกให้กด
 */

import type { ComponentProps, ReactNode } from 'react'

import { LinkButton } from '@/app/(marketing)/_components/mui-link'

type Props = Omit<ComponentProps<typeof LinkButton>, 'href' | 'onClick'> & {
  href: string
  publicToken: string
  children: ReactNode
}

export default function AuthPingLink({ href, publicToken, children, ...rest }: Props) {
  /**
   * ยิงบันทึกว่า "เริ่ม auth flow จากลิงก์ออเดอร์" แบบ fire-and-forget ก่อนเปลี่ยนหน้า
   * ไม่ await และไม่สนใจผลลัพธ์ — endpoint คืน 204 เสมอ (ครึ่งแรกของ Login Completion Rate)
   */
  const pingAuthFlow = () => {
    void fetch(`/api/orders/${publicToken}/auth-flow/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'other' }),
      keepalive: true, // ต้องส่งให้จบแม้หน้ากำลังจะถูกเปลี่ยน
    }).catch(() => {})
  }

  return (
    <LinkButton href={href} onClick={pingAuthFlow} {...rest}>
      {children}
    </LinkButton>
  )
}
