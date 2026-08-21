'use client'

/**
 * PhoneSuggestHint — **สล็อตเดียวใต้ช่องเบอร์** ที่เป็นเจ้าของทุกอย่างที่จะพูดตรงนั้น:
 * chip แนะนำเบอร์ / คำเตือนรูปแบบ / error ตอนกดบันทึก / เงียบ
 *
 * Base: `theme/paces/Admin/TS/src/assets/css/custom/_forms.css:246` +
 *       `theme/paces/Admin/TS/src/layouts/components/TopBar/components/AppsDropdownGrid.tsx:48`
 *       (พื้น soft `bg-primary/15` — ท่ามาตรฐานของธีม) · ขอบชิป `ring-primary/25`
 *       ตาม precedent `seller/(chat)/_components/DraftOrderProvider.tsx:836`
 *
 * ที่มา: `docs/20 - Features/00014 - Customer Directory/EXTENSIONS-2026-08-21-phone-format.md` §E1
 *
 * 🛑 **component นี้ต้องรับ `errorMessage` มาแสดงเอง ห้ามให้ผู้เรียกเลือกระหว่าง hint กับ error**
 * รอบแรกเขียนเป็น `{hintVisible ? <PhoneSuggestHint/> : errors.buyerContact && <p/>}` ที่ผู้เรียก
 * ผลคือ **error ตอนกดบันทึกไม่มีวันถูกแสดงเลย** (ค่าที่มี chip ก็คือค่าที่ยังบันทึกไม่ผ่านเสมอ)
 * ขณะที่ `OrderCreateForm.tsx` ยิง toast ว่า "ดูช่องที่ทำเครื่องหมายสีแดง" ⇒ ร้านกวาดตาหาสีแดง
 * ที่ไม่มีอยู่จริงแล้วกดบันทึกซ้ำ — impeccable critique P0-1 (2026-08-21)
 *
 * 🛑 และการให้ผู้เรียกครอบด้วยเทอร์นารียัง **ทำลาย live region** ที่ไฟล์นี้เขียนสัญญาไว้เอง:
 * `role="status"` ที่ mount พร้อมเนื้อหา screen reader จะไม่ประกาศ — เงื่อนไขที่ผู้เรียกใช้
 * (`hasPhoneHint`) เป็นตัวเดียวกับที่ component เช็คภายในอยู่แล้ว เทอร์นารีนั้นจึงไม่มีผลกับภาพเลย
 * มีแต่ผลเสีย (critique B1)
 */

import { phoneHint, chipsHeadline } from '@/lib/phone-hint'

interface Props {
  /** ค่าที่ผู้ใช้พิมพ์อยู่ในช่องตอนนี้ */
  value: string
  /** id ของสล็อต — ผู้เรียกชี้ `aria-describedby` ของ input มาที่นี่ */
  id: string
  /** กดแล้วเขียนทับค่าในช่อง + ค้นใหม่ (ผู้เรียกเป็นคนทำ) */
  onPick: (phone: string) => void
  /**
   * มือถือ: ปุ่มสูง ≥44px ตาม AA baseline · เดสก์ท็อป: ปล่อยตาม `.btn`
   * (`text-sm` เท่าปุ่มปกติ — เลข 10 หลักติดกันที่ 12px คือของที่อ่านยากที่สุดในจอ
   * และ PRODUCT.md สั่งให้ default ใหญ่กว่ามาตรฐานเล็กน้อยสำหรับกลุ่มผู้สูงวัย)
   */
  size?: 'mobile' | 'desktop'
  /** error จากตอนกดบันทึก (`errors.buyerContact?.message`) — component เป็นคนตัดสินว่าจะโชว์เมื่อไร */
  errorMessage?: string
}

export default function PhoneSuggestHint({ value, id, onPick, size = 'mobile', errorMessage }: Props) {
  const hint = phoneHint(value)
  const mobile = size === 'mobile'
  const blocked = Boolean(errorMessage)

  // 🛑 **พื้นที่นิ้วกับก้อนสีที่ตาเห็น ไม่จำเป็นต้องเป็นชิ้นเดียวกัน** (user สั่งย่อรอบสอง 2026-08-21)
  //
  // `<button>` = กล่องโปร่งใสสูง 44px → นิ้วแตะได้เท่าเดิมตาม PRODUCT.md §Accessibility
  // (เกณฑ์ tap target ≥44px ที่โปรเจกต์ประกาศเอง สูงกว่าที่ WCAG 2.2 §2.5.8 บังคับคือ 24px)
  // `<span>` ข้างใน = ก้อนสีจริง สูง ~26px → น้ำหนักสายตาลดลงเกือบครึ่งโดยไม่เสียอะไรเลย
  //
  // ทางที่ *ไม่* เลือก: ลด `min-h-11` ตรง ๆ — นั่นคือการเอาพื้นที่นิ้วของผู้สูงวัยไปแลกกับ
  // ความสวย ซึ่งเป็นกลุ่มเป้าหมายที่ PRODUCT.md ระบุไว้ชัด
  //
  // สีบนก้อน: `text-primary-ink` ไม่ใช่ `text-primary` — `#236dc9` บนพื้น `primary/15`
  // วัดได้ 4.17:1 ตกเกณฑ์ AA 4.5:1 ส่วน `#1e3a8a` ได้ 8.44:1 (`_root.css:37` เขียนตัวเลข
  // ไว้เองพร้อมหมายเหตุว่ายังไม่มีผู้ใช้งาน — ชิปนี้คือรายแรก · dark mode กลับด้านให้แล้ว)
  // `ring-1 ring-primary/25` — พื้นชิปต่างจากการ์ดขาวแค่ 1.23:1 ไม่มีขอบผู้ใช้จะไม่รู้ว่ากดได้
  // (WCAG 1.4.11 non-text 3:1 — ขอบเป็นตัวแบกเกณฑ์แทนพื้น)
  //
  // `btn` + `min-h-11` ต้องอยู่บรรทัดเดียวกัน — ด่าน mobile-affordance.test.ts อ่านทีละบรรทัด
  const chipHit = mobile ? 'btn group min-h-11 px-0 py-0' : 'btn group px-0 py-0'
  const chipPill =
    'rounded-full px-2.5 py-0.5 text-sm font-medium bg-primary/15 text-primary-ink ring-1 ring-primary/25 transition-colors group-hover:bg-primary group-hover:text-white'

  // 🛑 กล่องนี้ mount ค้างเสมอ แม้ตอนไม่มีอะไรจะพูด — live region ที่ถูก unmount/mount ใหม่
  // ทุกครั้ง screen reader จะไม่ประกาศการเปลี่ยนแปลง (ประกาศแค่ตอนแรกที่ mount)
  return (
    <div id={id} role="status" aria-live="polite">
      {hint.kind === 'chips' && (
        <>
          {/* บรรทัดนำ — ตอบ 2 คำถามที่ชิปเปล่า ๆ ตอบไม่ได้: ระบบทำอะไรให้ และกดแล้วได้อะไรต่อ
              (ชิปที่เขียนแค่เลขเดิมของผู้ใช้ ไม่มีแรงจูงใจให้กด — critique P1-5)
              เมื่อกดบันทึกแล้วติด error บรรทัดนี้เปลี่ยนเป็นคำบล็อก ไม่ใช่เพิ่มบรรทัดที่สอง */}
          <p className={`mt-0.5 text-xs ${blocked ? 'text-danger' : 'text-default-500'}`}>
            {chipsHeadline(hint.suggestions.length, blocked)}
          </p>
          {/* gap-y-0 ได้เพราะกล่องแตะ 44px ของสองแถวชนกันพอดี ไม่มีช่องตาย
              🛑 ห้ามใส่ margin ติดลบเพื่อดึงบล็อกให้เตี้ยลง — กล่องแตะที่โผล่พ้นขอบล่าง
              จะไปทับ control ตัวถัดไปแล้วขโมยการแตะที่ผู้ใช้ตั้งใจกดอย่างอื่น */}
          <div className="mt-0.5 flex flex-wrap gap-x-1 gap-y-0">
            {hint.suggestions.map((phone) => (
              <button key={phone} type="button" onClick={() => onPick(phone)} className={chipHit}>
                <span className={chipPill}>{phone}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {hint.kind === 'warning' && (
        <p className={`mt-1 text-danger ${mobile ? 'text-xs' : 'text-sm'}`}>{hint.message}</p>
      )}
      {/* ไม่มีอะไรจะแนะนำ แต่กดบันทึกแล้วติด — ต้องได้เห็น error ของ Yup ตามเดิม */}
      {hint.kind === 'none' && errorMessage && (
        <p className={`mt-1 text-danger ${mobile ? 'text-xs' : 'text-sm'}`}>{errorMessage}</p>
      )}
    </div>
  )
}
