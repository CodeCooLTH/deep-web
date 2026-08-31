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

/** `count` = ตัวเลขบนแท็บตามไฟล์อ้างอิง (`.tab .count`) — ไม่ส่งมาก็ไม่แสดง
 *  🛑 ต้องเป็น optional: แท็บ "เกี่ยวกับร้าน"/"รีวิว" ไม่มีจำนวนที่นับได้ ถ้าบังคับส่งจะต้อง
 *  ยัดเลขหลอก ๆ ลงไปซึ่งแย่กว่าไม่มี */
export type ProfileTabDef = { key: string; label: string; content: ReactNode; count?: number }

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
  const initialIndex = (() => {
    if (!initialActiveKey) return 0
    const i = tabs.findIndex((t) => t.key === initialActiveKey)
    return i >= 0 ? i : 0
  })()

  const [active, setActive] = useState(initialIndex)

  /**
   * แท็บที่ "เคยเปิดแล้ว" — เนื้อหาของแท็บเหล่านี้ค้างอยู่ใน DOM ต่อไป (ซ่อนด้วย `hidden`)
   * แทนที่จะถูกถอดทิ้งทุกครั้งที่สลับแท็บ
   *
   * 🛑 ปัญหาที่แก้ (user เจอเองบน prod 2026-08-23 "tab สินค้ามันโหลดรูปใหม่ทุกรอบ ทั้ง ๆ ที่เคย
   * โหลดแล้ว"): เดิม panel เขียนว่า `{i === active && t.content}` ⇒ ออกจากแท็บสินค้าเมื่อไหร่
   * `<img>` ทั้ง 22 ใบถูกถอดออกจาก DOM ทันที กลับเข้ามาใหม่ = สร้าง element ใหม่หมด แล้ว
   * `loading="lazy"` เริ่มนับหนึ่งอีกรอบ ⇒ เห็นแผ่นดำ + ไอคอนรูปทุกครั้งที่กลับมา
   * (ต่อให้ไฟล์อยู่ใน cache ของเบราว์เซอร์แล้ว รูปขนาด ~200KB/ใบ ก็ยังต้องถอดรหัสใหม่ทั้งชุด)
   *
   * ทำไมเป็น "เคยเปิดแล้ว" ไม่ใช่ mount ทุกแท็บตั้งแต่แรก: แท็บที่ผู้ชมไม่เคยกดต้องไม่ถูกโหลด
   * ตั้งแต่เปิดหน้า (แท็บปักหมุดมีไทล์คลิป 12 ใบ · แท็บรีวิวมีรายการยาว) — ของเดิมได้ข้อดีข้อนี้
   * มาฟรีจากการ render เฉพาะแท็บที่ active ห้ามทิ้งไปพร้อมกับการแก้บั๊ก
   */
  /* 🛑 ต้องเริ่มจาก `initialIndex` ไม่ใช่ 0 — deep link (`?p=` → แท็บสินค้า · `?clip=` → ปักหมุด)
     เปิดหน้ามาที่แท็บอื่นได้ ถ้าใส่ 0 ตายตัว แท็บที่กำลังเปิดอยู่จะไม่ถูก render เลยตอนโหลดครั้งแรก */
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set([initialIndex]))

  /** ย้ายแท็บ + จำว่าเคยเปิดแล้ว — ทุกทางที่เปลี่ยนแท็บต้องผ่านตัวนี้ (คลิก/ลูกศรซ้ายขวา) */
  const go = (i: number) => {
    setActive(i)
    setVisited((prev) => (prev.has(i) ? prev : new Set(prev).add(i)))
  }

  if (tabs.length === 0) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    const next = (active + dir + tabs.length) % tabs.length
    go(next)
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
        /* `.tabs` ของไฟล์อ้างอิง: สูง 54 · gap 4 · pli 18 · เส้นคั่นล่าง
           มือถือ (≤650) สูง 50 · pli 9 · เลื่อนข้างได้และซ่อนแถบเลื่อน
           🛑 **ไม่ใส่ sticky** ทั้งที่ไฟล์อ้างอิงมี (`top:66px`) — หัวเว็บของเราเป็น `sticky top:0`
           อยู่แล้ว (front-pages/styles.module.css) ถ้าตรึงแถบนี้ด้วยจะซ้อนทับกันเอง */
        className='flex items-stretch gap-1 border-be overflow-x-auto overflow-y-hidden bs-[50px] sm:bs-[54px] pli-2 sm:pli-[18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
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
              onClick={() => go(i)}
              /* `.tab`: pli 15 (มือถือ 12) · gap 7 · สีเทา #8e8d99 → ม่วงตอน active
                 ขีดใต้หนา 3px เว้นขอบข้างละ 12px (ไม่เต็มความกว้างปุ่ม) ตามไฟล์อ้างอิง

                 🛑 ตัวหนังสือ **ไม่** เอา 12px/800 ตามไฟล์อ้างอิง — ระบบเรามีแรมป์ 13/15 และ
                 คำศัพท์น้ำหนักแค่ 400/500 (DESIGN.md §Type) แท็บที่ถูกเลือกแยกด้วย *สี + ขีดใต้ 3px*
                 อยู่แล้ว ทั้งสองสถานะเคยหนา 700 เท่ากัน น้ำหนักจึงไม่ได้สื่ออะไร ลดเป็น 500 ไม่เสียข้อมูล */
              className={`relative inline-flex items-center gap-[7px] whitespace-nowrap bg-transparent border-0 cursor-pointer font-[inherit] pli-3 sm:pli-[15px] text-[13px] sm:text-[15px] font-medium ${
                selected ? 'text-primary' : 'text-[#8e8d99]'
              }`}
            >
              {/* ไอคอนช่วยให้กวาดตาหาแท็บที่ต้องการได้โดยไม่ต้องอ่านทุกคำ — จางลงเมื่อไม่ได้เลือก
                  เพื่อไม่ให้แย่งน้ำหนักกับแท็บที่ active */}
              {TAB_ICON[t.key] && <Icon icon={TAB_ICON[t.key]} width={17} />}
              {t.label}
              {t.count != null && (
                <span className='text-[13px] font-medium rounded-full plb-0.5 pli-1.5 bg-[var(--mui-palette-primary-lightOpacity)] text-primary tabular-nums'>
                  {t.count}
                </span>
              )}
              {/* 🛑 ตัวชี้แท็บใช้ `bottom-0` ไม่ใช่ `-bottom-px` — ตัวที่ยื่นออกนอกกล่อง 1px คือสิ่งที่
                  ทำให้แถบแท็บ **เลื่อนขึ้นลงได้** (user ทัก 2026-08-11 "ทำไม Tab ถึง scroll บนล่างได้")

                  ต้นเหตุจริงคือสเปก CSS: `overflow-x: auto` เดี่ยว ๆ ทำให้ `overflow-y` ที่เป็น
                  `visible` ถูกคำนวณเป็น `auto` โดยอัตโนมัติ (visible คู่กับ auto ไม่ได้) กล่องจึง
                  กลายเป็น scroll container ทั้งสองแกน แล้ว 1px ที่ยื่นออกไปก็พอทำให้เลื่อนได้จริง
                  แก้สองชั้น: `overflow-y-hidden` ที่กล่อง + ตัวชี้ไม่ยื่นออกนอกกล่อง */}
              {selected && (
                <span className='absolute inline-start-3 inline-end-3 bottom-0 bs-[3px] rounded-t bg-primary' />
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
          className='pli-3 plb-4 pbe-[22px] sm:pli-5 sm:plb-5'
        >
          {/* เคยเปิดแล้ว = ค้างไว้ใน DOM (ถูกซ่อนด้วย `hidden` ด้านบน) ไม่ถอดทิ้ง —
              ดูเหตุผลเต็มที่คอมเมนต์ของ `visited` */}
          {visited.has(i) && t.content}
        </div>
      ))}
    </>
  )
}
