'use client'

/**
 * Base: theme/paces/Admin/TS/src/layouts/components/TopBar/components/SearchBoxRounded.tsx
 * (input-icon-group + Icon "search" + input.form-input rounded-full ผูก --topbar-search-bg/border
 * token เดิม) ปรับจาก theme (feat 00018, งาน 1):
 * - ตัด `hidden xl:flex` + ความกว้างคงที่ `w-57.5` ออก → `w-full` กินพื้นที่เหลือทั้งหมดของ topbar
 *   (โผล่เฉพาะ /inbox — TopBar/index.tsx เป็นคนคุมเงื่อนไข ไม่ใช่ breakpoint ของ component นี้)
 * - value/onChange ผูกกับ ChatSearchContext (useChatSearchInput) แทน uncontrolled input เดิม —
 *   เพื่อให้ InboxList (rail) อ่านค่าเดียวกันได้ (เดิมช่องค้นหาอยู่ใน InboxList เอง ย้ายขึ้น
 *   topbar ตาม docs/superpowers/specs/2026-07-22-facebook-chat-ui-design.md)
 * - placeholder เปลี่ยนเป็นข้อความ Content outline ของสเปก (แทน "Quick Search..." เดิม)
 */
import Icon from '@/components/wrappers/Icon'
import { useChatSearchInput } from '@/context/useChatSearchContext'

const ChatSearchBox = () => {
  const { searchInput, setSearchInput } = useChatSearchInput()

  return (
    <div id="chat-search-box" className="input-icon-group w-full">
      <Icon icon="search" className="input-icon text-lg text-(--topbar-item-color)/50! placeholder:opacity-50" />
      <input
        type="search"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="ค้นหาชื่อ ลูกค้า เบอร์ หรือข้อความในแชท"
        className="form-input w-full rounded-full! border-(--topbar-search-border)! bg-(--topbar-search-bg)! text-(--topbar-item-color)! placeholder:opacity-50"
        aria-label="ค้นหาชื่อ ลูกค้า เบอร์ หรือข้อความในแชท"
      />
    </div>
  )
}

export default ChatSearchBox
