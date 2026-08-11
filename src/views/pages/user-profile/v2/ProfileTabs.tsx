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
 * บริการ (feat 00028 SERVICE_QUEUE) ใช้ armchair — ตรงกับกล่องไอคอนในการ์ดบริการเอง
 */
const TAB_ICON: Record<string, string> = {
  pinned: 'tabler:player-play',
  items: 'tabler:package',
  rooms: 'tabler:bed',
  calendar: 'tabler:calendar',
  services: 'tabler:armchair',
  about: 'tabler:info-circle',
  reviews: 'tabler:star',
}

export type ProfileTabDef = { key: string; label: string; content: ReactNode }

export default function ProfileTabs({
  tabs,
  initialActiveKey,
}: {
  tabs: ProfileTabDef[]
  /**
   * แท็บที่ต้องเปิดอยู่ตอนโหลดหน้า — ใช้กับ deep link ของ lightbox (`?p=` → สินค้า · `?clip=` → ปักหมุด)
   * คีย์ที่ไม่มีในชุดแท็บ (แท็บนั้นไม่ถูก render เพราะไม่มีข้อมูล) → ตกกลับไปแท็บแรกตามปกติ
   */
  initialActiveKey?: string | null
}) {
  const baseId = useId()
  /* 🛑 lazy initializer ไม่ใช่ useEffect — useEffect จะมีหนึ่งเฟรมที่แท็บ 0 ถูก render ไปแล้ว
     ผู้ใช้ที่กดลิงก์มาจะเห็นแท็บแรกกระพริบก่อนแล้วค่อยสลับ (และ panel ของแท็บ 0 จะ mount ทิ้ง
     โดยเปล่าประโยชน์ เพราะ ProfileTabs render เฉพาะ content ของแท็บที่ active) */
  const [active, setActive] = useState(() => {
    if (!initialActiveKey) return 0
    const i = tabs.findIndex((t) => t.key === initialActiveKey)
    return i >= 0 ? i : 0
  })

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
      {/* 🛑 mbs-2 เฉพาะมือถือ — บนจอเล็กแถบตัวเลขกับแถบแท็บชนกันจนอ่านเป็นก้อนเดียว
          (user 2026-08-11 "ตรง static / tab อยากให้ห่างกันอีกนิด มันชิดไปหน่อย")

          ระยะนี้อยู่ **เหนือ tablist** ไม่ใช่เพิ่ม padding ล่างให้แถบตัวเลข เพราะแถบตัวเลขมี
          `border-be` เป็นขอบล่างของตัวเอง — เพิ่ม padding ข้างในจะดันเส้นขอบลงไปด้วย แล้ว
          ที่ว่างจะไปโผล่ "ในกรอบ" แทนที่จะเป็น "ระหว่างสองบล็อก"

          📌 เดิมตั้ง `sm:mbs-0` ด้วยเหตุผลว่า "จอกว้างสายตาแยกสองบล็อกได้ด้วยความกว้าง" —
          user ดูของจริงแล้วบอกว่าไม่จริง (2026-08-11 "เพิ่มระยะห่างระหว่างเหรียญ สถิติ tab")
          เดสก์ท็อปเป็น `sm:mbs-3` แทน · ความกว้างไม่ได้ทดแทนระยะห่างแนวตั้ง มันคนละแกนกัน */}
      <div
        role='tablist'
        className='flex gap-6 border-be overflow-x-auto overflow-y-hidden pli-5 mbs-2 sm:mbs-3'
        onKeyDown={onKeyDown}
      >
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
              {/* 🛑 ตัวชี้แท็บใช้ `bottom-0` ไม่ใช่ `-bottom-px` — ตัวที่ยื่นออกนอกกล่อง 1px คือสิ่งที่
                  ทำให้แถบแท็บ **เลื่อนขึ้นลงได้** (user ทัก 2026-08-11 "ทำไม Tab ถึง scroll บนล่างได้")

                  ต้นเหตุจริงคือสเปก CSS: `overflow-x: auto` เดี่ยว ๆ ทำให้ `overflow-y` ที่เป็น
                  `visible` ถูกคำนวณเป็น `auto` โดยอัตโนมัติ (visible คู่กับ auto ไม่ได้) กล่องจึง
                  กลายเป็น scroll container ทั้งสองแกน แล้ว 1px ที่ยื่นออกไปก็พอทำให้เลื่อนได้จริง
                  แก้สองชั้น: `overflow-y-hidden` ที่กล่อง + ตัวชี้ไม่ยื่นออกนอกกล่อง */}
              {selected && (
                <span className='absolute inline-start-0 inline-end-0 bottom-0 bs-[2.5px] rounded bg-primary' />
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
