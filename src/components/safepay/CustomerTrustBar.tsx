/**
 * CustomerTrustBar — แถบสัดส่วน "รับของ / ตีกลับ / ยังไม่จบ" ของลูกค้า 1 คน (feature 00057)
 *
 * user สั่ง 2026-08-25: *"อยากให้เน้นสถิติความน่าเชื่อถือ เช่น อัตราปฏิเสธรับของ อัตราคืนของ"*
 * ⇒ แถบนี้คือคำตอบหลัก — **อ่านได้จากการกวาดตาโดยไม่ต้องอ่านตัวเลขสักตัว** ซึ่งเป็นสิ่งที่
 * ตัวเลขเปล่า ๆ ทำไม่ได้บนลิสต์ที่มีลูกค้าหลายร้อยคน
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx (`MultipleBar` — แถบหลายสี
 * `bg-default-100 flex h-1.25 w-full overflow-hidden` แล้วลูกแต่ละตัวกินสัดส่วนของตัวเอง)
 *
 * 🛑 **ขอบเขตของตัวเลขไม่ได้อยู่ในไฟล์นี้** — component นี้แสดงสิ่งที่ป้อนเข้ามาเฉย ๆ
 * ผู้เรียกต้องเขียนป้ายกำกับเองว่าเป็น "กับร้านนี้" หรือ "ทั้งระบบ" เพราะระบบมีทั้งสองชั้น
 * และ **ภาพเดียวกันที่แปลสองความหมายคือรอยที่โปรเจกต์นี้เคยเจ็บมาแล้ว** (HR16)
 *
 * 🛑 **ห้ามใช้ `role="progressbar"` ตามตัวอย่างดิบของธีม** — progressbar สื่อว่า "งานกำลังคืบหน้า
 * ไปสู่ 100%" ซึ่งไม่ตรงความหมายเลย (นี่คือสัดส่วนคงที่ ไม่ใช่ความคืบหน้า) และถ้าใส่ต่อ segment
 * ทั้ง 3 อัน screen reader จะอ่านค่า 3 ค่าคนละความหมายปนกัน
 *
 * 🛑 สีตามกติกาที่ระบบตั้งไว้แล้ว: เขียว = ข้อเท็จจริงที่ยืนยันแล้ว (ของถึงมือจริง) ·
 * เหลือง = ควรระวัง · **ห้ามแดง** — ป้ายกลุ่มนี้ "เตือน ไม่ตัดสิน" ร้านยังตัดสินใจเองได้เสมอ
 * (`src/lib/customer-behavior.ts`)
 */
import type { BuyerReputation } from '@/lib/buyer-reputation'
import { MIN_SHIPPED_FOR_RATE } from '@/lib/buyer-reputation'

type Props = {
  /**
   * `null` = ลูกค้ารายนี้ยังไม่ผูกกับ `Customer` กลาง จึงไม่มีประวัติข้ามร้านให้ดูเลย
   *
   * 🛑 **คนละความหมายกับ "เปิดพัสดุ 0 ใบ"** — อันนั้นคือมีตัวตนแล้วแต่ยังไม่มีอะไรให้วัด
   * ส่วนอันนี้คือยังไม่มีตัวตนข้ามร้าน สองอย่างนี้ผู้ขายทำอะไรต่อไม่เหมือนกัน จึงต้องพูดคนละประโยค
   * (บน prod เคสนี้หายากมาก — `Order.customerId` เป็น null แค่ 3 แถวจาก 533)
   */
  reputation: BuyerReputation | null
  /** `sm` = ในลิสต์ (บาง) · `lg` = ในหน้าโปรไฟล์ (หนา อ่านเป็นพระเอก) */
  size?: 'sm' | 'lg'
}

/**
 * ใบที่ "ยังไม่จบ" = เปิดพัสดุแล้วแต่ยังไม่ถึงมือและยังไม่ตีกลับ (อยู่ระหว่างทาง)
 * — ต้องมีช่องของตัวเอง ไม่ใช่ปัดเข้าฝั่งใดฝั่งหนึ่ง เพราะมันคือ "ยังไม่รู้ผล"
 * ซึ่งเป็นคนละเรื่องกับ "สำเร็จ" และ "ล้มเหลว"
 */
function segments(rep: BuyerReputation) {
  const pending = Math.max(0, rep.shipped - rep.received - rep.returned)
  const total = rep.received + rep.returned + pending
  if (total === 0) return null
  return {
    pending,
    total,
    receivedPct: (rep.received / total) * 100,
    returnedPct: (rep.returned / total) * 100,
    pendingPct: (pending / total) * 100,
  }
}

export default function CustomerTrustBar({ reputation, size = 'sm' }: Props) {
  if (!reputation) {
    return <p className="text-default-400 text-2xs mb-0">ยังไม่มีประวัติข้ามร้าน</p>
  }

  const seg = segments(reputation)

  /**
   * ยังไม่เคยเปิดพัสดุเลย (รับหน้าร้าน/สินค้าดิจิทัล/บริการ ล้วน) → **ไม่ render แถบ**
   * แถบเปล่าอ่านว่า "มีข้อมูลแต่แย่" ซึ่งไม่จริง — ความจริงคือ "ยังไม่มีอะไรให้วัด"
   */
  if (!seg) {
    return (
      <p className="text-default-400 mb-0 text-2xs">ยังไม่เคยเปิดพัสดุ — ยังวัดการรับของไม่ได้</p>
    )
  }

  const rate = reputation.returnRate
  const enoughBase = reputation.shipped >= MIN_SHIPPED_FOR_RATE

  return (
    <>
      <div
        // role="img" + aria-label บังคับ: `<div>` เปล่าไม่รองรับ "ชื่อจากผู้เขียน" — แถบสีล้วน
        // ที่ไม่มีข้อความจะเงียบสนิทกับ screen reader (aria-name-requires-supporting-role.md)
        role="img"
        aria-label={`เปิดพัสดุ ${reputation.shipped} ใบ · รับของแล้ว ${reputation.received} · ตีกลับ ${reputation.returned} · ยังไม่จบ ${seg.pending}`}
        className={`bg-default-100 my-1.5 flex w-full overflow-hidden rounded-full ${size === 'lg' ? 'h-2.5' : 'h-1.25'}`}>
        {seg.receivedPct > 0 && (
          <span className="bg-success block h-full" style={{ width: `${seg.receivedPct}%` }} />
        )}
        {seg.returnedPct > 0 && (
          <span className="bg-warning block h-full" style={{ width: `${seg.returnedPct}%` }} />
        )}
        {seg.pendingPct > 0 && (
          <span className="bg-default-200 block h-full" style={{ width: `${seg.pendingPct}%` }} />
        )}
      </div>

      <div className="text-2xs flex flex-wrap items-center gap-x-2.5 gap-y-0.5" aria-hidden="true">
        <span className="text-default-600 inline-flex items-center gap-1">
          <span className="bg-success size-1.5 shrink-0 rounded-full" />
          รับของ <b className="text-default-900 font-semibold tabular-nums">{reputation.received}</b>
        </span>
        {reputation.returned > 0 && (
          <span className="text-default-600 inline-flex items-center gap-1">
            <span className="bg-warning size-1.5 shrink-0 rounded-full" />
            ตีกลับ{' '}
            <b className="text-warning-ink font-semibold tabular-nums">{reputation.returned}</b>
          </span>
        )}
        {/*
          🛑 อัตราโผล่เฉพาะตอนฐานพอ — `returnRate === null` **ไม่ใช่ 0**
          "ส่ง 1 ตีกลับ 1 = 100%" อ่านว่าเลวร้ายที่สุดในระบบทั้งที่บอกอะไรไม่ได้เลย
          และลูกค้าส่วนใหญ่ของทุกร้านซื้อครั้งเดียว ⇒ ข้อความนี้จะเป็นเคสปกติ ไม่ใช่เคสขอบ
        */}
        {enoughBase && rate !== null ? (
          <span className="text-default-400">
            อัตราตีกลับ{' '}
            <b className={rate > 0 ? 'text-warning-ink font-semibold' : 'font-semibold'}>
              {Math.round(rate * 100)}%
            </b>
          </span>
        ) : (
          <span className="text-default-400">ยังบอกอัตราไม่ได้</span>
        )}
      </div>
    </>
  )
}
