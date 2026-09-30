'use client'

/**
 * FinanceTabs — แถบแท็บของหน้า "การเงินร้าน" (feature 00067 FR-FIN-01/02)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx (ชุด .nav-tabs/.nav-link ของ Paces)
 *   ผ่าน precedent ในรีโป: src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanel.tsx:912
 *   (โครงเดียวกันเป๊ะ: nav role=tablist + button role=tab + border-b-2 border-primary ตอน active)
 *
 * 🛑 `flex-nowrap` ไม่ใช่ค่าเริ่มต้นของ `.nav-tabs` ซึ่งเป็น flex-wrap — 3 แท็บภาษาไทยที่ 320px
 * จะตกบรรทัดถ้าไม่ปิด wrap ก่อน และการใส่ truncate อย่างเดียวไม่มีผลเลย เพราะ flex ตัดสินว่า
 * จะ wrap ไหมจากขนาดเนื้อหา **เต็มก่อนหด** (docs/conventions/flex-header-truncation.md)
 *
 * 🛑 ห้ามใส่ `overflow-x-auto` — แท็บแค่ 3 ตัวต้อง fit พอดี แถบที่เลื่อนได้ทำให้แท็บที่สาม
 * ถูกซ่อนครึ่งใบแล้วไม่มีใครรู้ว่ามีอยู่
 */
import { useCallback, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { FINANCE_TABS, FINANCE_TAB_PARAM, type FinanceTab } from '@/lib/finance-tabs'

const TAB_LABEL: Record<FinanceTab, string> = {
  pnl: 'กำไรขาดทุน',
  collect: 'ยอดเก็บเงิน',
  expense: 'ค่าใช้จ่าย',
}

type Props = {
  active: FinanceTab
  /** id สำหรับผูก aria-controls กับแผงเนื้อหา — ผู้เรียกต้องใส่ id นี้ที่กล่องเนื้อหาด้วย */
  panelId: string
}

export default function FinanceTabs({ active, panelId }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const navRef = useRef<HTMLElement | null>(null)

  const go = useCallback(
    (tab: FinanceTab) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(FINANCE_TAB_PARAM, tab)
      /**
       * `push` ไม่ใช่ `replace` — ผู้ใช้ที่กดเข้าแท็บค่าใช้จ่ายแล้วกด back ของเบราว์เซอร์
       * คาดหวังว่าจะกลับมาแท็บเดิม ไม่ใช่กระเด็นออกจากหน้าไปเลย (FR-FIN-02 AC-04)
       * ประวัติจะยาวขึ้นตามจำนวนครั้งที่สลับ ซึ่งเป็นสิ่งที่ผู้ใช้สร้างเองและย้อนได้ตามคาด
       */
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  /**
   * roving tabindex — ลูกศรซ้าย/ขวาเดินระหว่างแท็บตามสเปก WAI-ARIA
   * (แท็บที่ไม่ active มี tabIndex -1 ⇒ Tab ข้ามไปเนื้อหาเลย ไม่ต้องกด Tab สามครั้ง)
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const i = FINANCE_TABS.indexOf(active)
      const next =
        e.key === 'ArrowRight'
          ? FINANCE_TABS[(i + 1) % FINANCE_TABS.length]
          : FINANCE_TABS[(i - 1 + FINANCE_TABS.length) % FINANCE_TABS.length]
      go(next)
      // ย้ายโฟกัสตามไปด้วย ไม่งั้นลูกศรครั้งที่สองจะเดินจากตัวเดิมตลอด
      navRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus()
    },
    [active, go],
  )

  return (
    <nav
      ref={navRef}
      className="nav-tabs border-default-200 mb-1.25 flex h-auto flex-nowrap border-b px-4"
      role="tablist"
      aria-label="มุมมองการเงินของร้าน"
      onKeyDown={onKeyDown}
    >
      {FINANCE_TABS.map((tab) => {
        const selected = tab === active
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            data-tab={tab}
            id={`finance-tab-${tab}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => go(tab)}
            className={`nav-link -mb-px inline-flex min-h-11 min-w-0 flex-1 items-center justify-center px-2 py-3 text-sm ${
              selected ? 'border-b-2 border-primary text-primary font-semibold' : 'border-b-2 border-transparent'
            }`}
          >
            <span className="truncate">{TAB_LABEL[tab]}</span>
          </button>
        )
      })}
    </nav>
  )
}
