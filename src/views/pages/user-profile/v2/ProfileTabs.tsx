'use client'

/**
 * ProfileTabs — แท็บของหน้าร้านสาธารณะโฉมใหม่ (mockup 2026-07-26)
 *
 * ต่างจาก ProfileTabsNav เดิมที่เป็น anchor-scroll ไปยัง section ในหน้าเดียว — อันนี้สลับ panel จริง
 * เพราะเนื้อหาสามชุด (รายการที่ขาย / ช่องทาง Official / รีวิว) ไม่ได้ต่อเนื่องกันเชิงการอ่าน
 * การเลื่อนผ่านทั้งหมดจึงไม่ช่วยอะไร และทำให้หน้ายาวเกินจำเป็นบนมือถือ
 *
 * แท็บที่ไม่มีข้อมูลจะไม่ถูก render เป็นตัวเลือกเลย ไม่ใช่ render แล้วโชว์หน้าเปล่า
 *
 * a11y: ใช้ role tablist/tab/tabpanel + aria-selected และรองรับปุ่มลูกศรซ้าย-ขวา
 * Base: theme/vuexy/typescript-version/full-version/src/@core/components/mui (Tabs pattern),
 *   ปรับเป็น button ธรรมดาเพื่อคุม underline indicator ให้ตรง mockup
 */
import { useId, useState, type ReactNode } from 'react'

import { Icon } from '@iconify/react'

/**
 * ไอคอนประจำแท็บ — user เคาะชุดนี้เอง 2026-07-26 (convention no-emoji-use-icons กำหนดว่า
 * จุดที่ควรมีไอคอนแต่สเปกไม่ได้ระบุตัว ต้องถามก่อน ห้ามเดา)
 * ปักหมุด = ปุ่มเล่น สื่อว่าเป็นคลิป · สินค้า = กล่อง · เกี่ยวกับร้าน = วงกลม i · รีวิว = ดาว
 * ห้องพัก/ปฏิทิน ของร้านบ้านพักใช้เตียงกับปฏิทินตามความหมายตรงตัว
 */
const TAB_ICON: Record<string, string> = {
  pinned: 'tabler:player-play',
  items: 'tabler:package',
  rooms: 'tabler:bed',
  calendar: 'tabler:calendar',
  about: 'tabler:info-circle',
  reviews: 'tabler:star',
}

export type ProfileTabDef = { key: string; label: string; content: ReactNode }

export default function ProfileTabs({ tabs }: { tabs: ProfileTabDef[] }) {
  const baseId = useId()
  const [active, setActive] = useState(0)

  if (tabs.length === 0) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    const next = (active + dir + tabs.length) % tabs.length
    setActive(next)
    document.getElementById(`${baseId}-tab-${next}`)?.focus()
  }

  return (
    <>
      <div role='tablist' className='flex gap-6 border-be overflow-x-auto pli-5' onKeyDown={onKeyDown}>
        {tabs.map((t, i) => {
          const selected = i === active
          return (
            <button
              key={t.key}
              id={`${baseId}-tab-${i}`}
              role='tab'
              type='button'
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${i}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={`relative plb-3 min-bs-[44px] text-[15px] font-semibold whitespace-nowrap bg-transparent border-0 cursor-pointer font-[inherit] inline-flex items-center gap-1.5 ${
                selected ? 'text-[var(--mui-palette-text-primary)]' : 'text-[var(--mui-palette-text-disabled)]'
              }`}
            >
              {/* ไอคอนช่วยให้กวาดตาหาแท็บที่ต้องการได้โดยไม่ต้องอ่านทุกคำ — จางลงเมื่อไม่ได้เลือก
                  เพื่อไม่ให้แย่งน้ำหนักกับแท็บที่ active */}
              {TAB_ICON[t.key] && <Icon icon={TAB_ICON[t.key]} width={17} />}
              {t.label}
              {selected && (
                <span className='absolute inline-start-0 inline-end-0 -bottom-px bs-[2.5px] rounded bg-primary' />
              )}
            </button>
          )
        })}
      </div>

      {tabs.map((t, i) => (
        <div
          key={t.key}
          id={`${baseId}-panel-${i}`}
          role='tabpanel'
          aria-labelledby={`${baseId}-tab-${i}`}
          hidden={i !== active}
          className='pli-5 pbs-4 pbe-6'
        >
          {i === active && t.content}
        </div>
      ))}
    </>
  )
}
