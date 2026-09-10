/**
 * จำตำแหน่งรายการแชทข้ามการเปิด/ปิดห้อง (user สั่ง 2026-09-10)
 *
 * 🛑 ทำไมจำแค่ `scrollTop` ไม่พอ — `/inbox/[conversationId]` เป็น **route จริง ไม่ใช่ modal**
 * บนมือถือ `{children}` ของ `(chat)/layout.tsx` ถูกสลับ ⇒ `InboxList` unmount ทั้งตัว ⇒
 * `useState(initialItems)` กลับไปเป็น "หน้าแรก 20 แถว" ⇒ แถวที่ผู้ใช้เลื่อนโหลดมาหายหมด
 * ต่อให้จำตัวเลข scroll ได้ก็เลื่อนกลับไปไม่ได้เพราะ **เนื้อหายังไม่มีให้เลื่อน**
 * ⇒ ต้องจำ `items` + `nextCursor` คู่กันเสมอ ห้ามแยกจำอย่างใดอย่างหนึ่ง
 *
 * เดสก์ท็อปไม่มีอาการนี้เพราะรายการอยู่ใน `ChatRailColumn` ระดับ layout ซึ่งไม่ unmount —
 * ตัวจำนี้จึงเปิดเฉพาะ `railMode === false` (ดูผู้เรียกใน InboxList)
 *
 * ตัวกล่องที่เลื่อนจริงคือ `div` ใน `(chat)/layout.tsx` ซึ่ง **อยู่ระดับ layout จึงไม่ unmount**
 * (สลับแค่เนื้อข้างใน) — หมายเหตุนี้สำคัญ: ที่ scroll หายไม่ใช่เพราะกล่องถูกสร้างใหม่ แต่เพราะ
 * เนื้อในหดลงจนเบราว์เซอร์บีบ scrollTop ลงมาเอง
 */

/** ผู้เลือกกล่องที่เลื่อนของโซนแชท — ประกาศที่เดียว ห้าม querySelector ด้วยคลาสดิบที่อื่น */
export const CHAT_SCROLLER_SELECTOR = '[data-chat-scroller]'

const KEY = 'deep:inbox-restore'
/** เกินนี้ถือว่าเป็นการกลับมาใหม่ ไม่ใช่การสลับไป-กลับ — โหลดสดดีกว่าคืนของเก่าที่อาจเพี้ยนไปแล้ว */
const TTL_MS = 15 * 60 * 1000
/** กันไม่ให้ sessionStorage บวม — ผู้ใช้ที่เลื่อนไป 300 แถวแล้วยังต้องการตำแหน่งเป๊ะมีน้อยมาก */
const MAX_ITEMS = 300

type Snapshot<T> = {
  v: 1
  /** ลายเซ็นตัวกรอง (`listSignature` ตัวเดียวกับที่ InboxList ใช้กัน merge ข้ามตัวกรอง — HR16) */
  fp: string
  at: number
  scrollTop: number
  nextCursor: string | null
  items: T[]
}

export function saveInboxSnapshot<T>(fp: string, data: { scrollTop: number; nextCursor: string | null; items: T[] }) {
  // ไม่มีอะไรให้คืน (ยังไม่เคยเลื่อน + ยังไม่เคยโหลดเพิ่ม) = อย่าเขียนทับของเดิมด้วยค่าเปล่า
  if (data.scrollTop <= 0 && data.items.length <= 20) return
  try {
    const snap: Snapshot<T> = {
      v: 1,
      fp,
      at: Date.now(),
      scrollTop: data.scrollTop,
      nextCursor: data.nextCursor,
      items: data.items.slice(0, MAX_ITEMS),
    }
    sessionStorage.setItem(KEY, JSON.stringify(snap))
  } catch {
    // โควตาเต็ม/โหมดส่วนตัว — การจำตำแหน่งไม่ใช่ของที่ควรทำให้หน้าจอพัง เงียบไว้
  }
}

/**
 * คืนของที่จำไว้ถ้ายังใช้ได้จริง — **ไม่ตรงลายเซ็น = ทิ้ง** เพราะคืนแถวของตัวกรองอื่นมาแสดง
 * แย่กว่าเลื่อนใหม่เยอะ (คลาสเดียวกับเหตุผลที่ `refreshFirstPage` ต้องเช็คลายเซ็นก่อน merge)
 */
export function readInboxSnapshot<T>(fp: string): { scrollTop: number; nextCursor: string | null; items: T[] } | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as Snapshot<T>
    if (snap?.v !== 1 || snap.fp !== fp) return null
    if (Date.now() - snap.at > TTL_MS) return null
    if (!Array.isArray(snap.items) || snap.items.length === 0) return null
    return { scrollTop: snap.scrollTop, nextCursor: snap.nextCursor, items: snap.items }
  } catch {
    return null
  }
}

export function clearInboxSnapshot() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* เหตุผลเดียวกับ save */
  }
}
