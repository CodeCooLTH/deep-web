'use client'

/**
 * ChatSearchContext — ยกช่องค้นหาแชทขึ้นไปไว้ระดับ layout (feat 00018, Chat Rail topbar งาน 1)
 *
 * เดิมช่องค้นหาอยู่ใน InboxList.tsx เอง (ผูกกับ card-header ของมัน) — ตอนนี้ต้องย้ายขึ้นไปที่
 * TopBar (โผล่เฉพาะ /inbox*) แต่ตัวกรองจริงยังต้องเกิดที่ InboxList (rail) → ต้องมี state กลาง
 * ที่ทั้งสองฝั่งเห็นร่วมกัน mount ที่ VerticalLayout.tsx (ครอบทั้ง TopBar + Sidenav + page-content)
 *
 * แยกเป็น 2 context ไม่รวมกัน (ตั้งใจ ไม่ใช่ over-engineer):
 * - ChatSearchInputContext: {searchInput, setSearchInput} — เปลี่ยน "ทุกตัวอักษร" ที่พิมพ์
 *   ใช้เฉพาะ ChatSearchBox (topbar input) เป็น controlled input ต้องอ่าน/เขียนค่าปัจจุบันตรง ๆ
 * - ChatSearchQueryContext: {debouncedQuery, setSearchInput} — เปลี่ยนเฉพาะทุก 400ms (debounce
 *   เดียวกับที่เคยอยู่ใน InboxList.tsx ก่อนย้าย) ใช้โดย InboxList (rail mode) ไปยิง fetch filter
 *   จริง — ตั้งใจไม่รวมกับ context บนเพราะถ้ารวม InboxList จะ re-render ทุกตัวอักษรตามไปด้วย
 *   (ผิดข้อกำหนดงาน "ห้ามทำให้ทั้ง layout re-render ทุกตัวอักษร") — React context เปลี่ยน object
 *   reference แล้ว re-render เฉพาะ component ที่เรียก use()/useContext() ของ context นั้นจริง ๆ
 *   (ไม่ re-render subtree ที่ไม่ได้ consume) แยก context จึงตัด InboxList ออกจาก "ทุกตัวอักษร" ได้
 *   setSearchInput ใน context ล่างมีไว้ให้ InboxList เคลียร์ช่องค้นหาได้ (ปุ่ม "ล้างตัวกรอง")
 *   โดยไม่ต้อง subscribe context บนที่เปลี่ยนทุกตัวอักษร
 */
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'

type ChatSearchInputContextValue = {
  searchInput: string
  setSearchInput: (value: string) => void
}

type ChatSearchQueryContextValue = {
  debouncedQuery: string
  setSearchInput: (value: string) => void
}

const ChatSearchInputContext = createContext<ChatSearchInputContextValue | undefined>(undefined)
const ChatSearchQueryContext = createContext<ChatSearchQueryContextValue | undefined>(undefined)

export const ChatSearchProvider = ({ children }: { children: ReactNode }) => {
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // debounce 400ms — ของเดิม logic เดียวกับที่เคยอยู่ใน InboxList.tsx ก่อนย้ายช่องค้นหาขึ้น topbar
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const inputValue = useMemo(() => ({ searchInput, setSearchInput }), [searchInput])

  // ตั้งใจไม่ใส่ setSearchInput ใน deps — เป็น setter จาก useState (stable reference ตาม React
  // guarantee) ต้องการให้ object นี้เปลี่ยนเฉพาะตอน debouncedQuery เปลี่ยน (ทุก 400ms) ไม่ใช่ทุก
  // ตัวอักษร (ดู comment หัวไฟล์)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryValue = useMemo(() => ({ debouncedQuery, setSearchInput }), [debouncedQuery])

  return (
    <ChatSearchInputContext value={inputValue}>
      <ChatSearchQueryContext value={queryValue}>{children}</ChatSearchQueryContext>
    </ChatSearchInputContext>
  )
}

/** ใช้ที่ ChatSearchBox (topbar input) เท่านั้น — re-render ทุกตัวอักษร (จำกัดแค่ตัวมันเอง) */
export const useChatSearchInput = () => {
  const ctx = use(ChatSearchInputContext)
  if (!ctx) throw new Error('useChatSearchInput ต้องถูกเรียกภายใต้ ChatSearchProvider')
  return ctx
}

/** ใช้ที่ InboxList (rail mode) — re-render เฉพาะทุก 400ms หลังพิมพ์เสร็จ ไม่ใช่ทุกตัวอักษร */
export const useChatSearchQuery = () => {
  const ctx = use(ChatSearchQueryContext)
  if (!ctx) throw new Error('useChatSearchQuery ต้องถูกเรียกภายใต้ ChatSearchProvider')
  return ctx
}
