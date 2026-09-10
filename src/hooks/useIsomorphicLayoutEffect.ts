'use client'

import { useEffect, useLayoutEffect } from 'react'

/**
 * `useLayoutEffect` ที่ไม่เตือนตอน SSR
 *
 * 🛑 ทำไมต้องมี: React เตือน *"useLayoutEffect does nothing on the server"* กับ client component
 * ที่ถูกเรนเดอร์ฝั่งเซิร์ฟเวอร์เพื่อทำ HTML ชุดแรก ซึ่ง `InboxList` เป็นแบบนั้น (ต่างจาก
 * `RowFocusSheet`/`MessageActionBubble` ที่ mount หลังผู้ใช้กด จึงใช้ `useLayoutEffect` ตรง ๆ ได้)
 *
 * ใช้เมื่อ **ต้องทำงานก่อนเบราว์เซอร์วาด** จริง ๆ เท่านั้น (เช่น คืนตำแหน่ง scroll ไม่ให้เห็นจอกระโดด)
 * งานทั่วไปยังต้องใช้ `useEffect` ตามเดิม
 */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
