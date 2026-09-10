/**
 * จำ **ตำแหน่ง** ของรายการแชทข้ามการเปิด/ปิดห้อง — ไม่ใช่จำ "ข้อมูล"
 *
 * 🛑 v2 (2026-09-10): เลิกเก็บ `items` ลง sessionStorage เด็ดขาด
 *
 * v1 เก็บทั้งชุดเพื่อคืนความสูงให้เลื่อนกลับได้ แต่ `items` มี `lastMessagePreview` /
 * `unreadCount` / เวลาติดไปด้วย ⇒ ตอนคืนค่ามัน **เขียนทับข้อมูลสดที่ RSC เพิ่งส่งมา ด้วยของเก่า**
 * ผู้ใช้เห็น "ข้อความล่าสุด" ที่ไม่ล่าสุด (user ทัก 2026-09-10 แล้วสั่งว่า "ข้อมูลต้อง realtime")
 *
 * บทเรียน: **ตำแหน่งเก่าไม่เป็นไร แต่ข้อมูลเก่าคือการโกหกผู้ใช้** — สองอย่างนี้ต้องแยกกัน
 * ห้ามเอา "ความสะดวกของการคืนตำแหน่ง" ไปแลกกับความถูกต้องของสิ่งที่แสดง
 *
 * v2 จึงเก็บแค่ 2 ตัวเลข: เคยโหลดมากี่แถว และเลื่อนไปถึงไหน — ตอนกลับมาให้ **โหลดสดใหม่**
 * จนได้จำนวนแถวเท่าเดิมแล้วค่อยเลื่อนกลับ ⇒ ทุกแถวที่ผู้ใช้เห็นมาจากเซิร์ฟเวอร์เสมอ
 * (แถวเก่าที่เกินหน้าแรกโหลดเพิ่มเองอัตโนมัติ ไม่ต้องให้ผู้ใช้เลื่อนซ้ำ)
 */

/** ผู้เลือกกล่องที่เลื่อนของโซนแชท — ประกาศที่เดียว ห้าม querySelector ด้วยคลาสดิบที่อื่น */
export const CHAT_SCROLLER_SELECTOR = '[data-chat-scroller]'

const KEY = 'deep:inbox-restore'
/** เกินนี้ถือว่าเป็นการกลับมาใหม่ ไม่ใช่การสลับไป-กลับ — ไม่ต้องไล่โหลดแถวเก่าให้เสียเที่ยว */
const TTL_MS = 3 * 60 * 1000
/** เพดานการไล่โหลดย้อน — กันกรณีผู้ใช้เคยเลื่อนไปไกลมากแล้วกลับมาเจอการยิง API รัว */
export const MAX_RESTORE_ROWS = 200

type Snapshot = {
  v: 2
  /** ลายเซ็นตัวกรอง (`listSignature` ตัวเดียวกับที่ InboxList ใช้กัน merge ข้ามตัวกรอง — HR16) */
  fp: string
  at: number
  scrollTop: number
  /** จำนวนแถวที่โหลดไว้ตอนออกจากหน้า — ใช้เป็น "เป้า" ให้โหลดสดกลับมาให้ครบ */
  loadedCount: number
}

export function saveInboxSnapshot(fp: string, data: { scrollTop: number; loadedCount: number }) {
  // ยังไม่เคยเลื่อนและยังไม่เคยโหลดเพิ่ม = ไม่มีอะไรต้องคืน อย่าเขียนทับของเดิมด้วยค่าเปล่า
  if (data.scrollTop <= 0 && data.loadedCount <= 20) return
  try {
    const snap: Snapshot = {
      v: 2,
      fp,
      at: Date.now(),
      scrollTop: data.scrollTop,
      loadedCount: Math.min(data.loadedCount, MAX_RESTORE_ROWS),
    }
    sessionStorage.setItem(KEY, JSON.stringify(snap))
  } catch {
    // โควตาเต็ม/โหมดส่วนตัว — การจำตำแหน่งไม่ใช่ของที่ควรทำให้หน้าจอพัง เงียบไว้
  }
}

/**
 * คืนเป้าหมายที่ต้องโหลด/เลื่อนกลับ — **ไม่ตรงลายเซ็น = ทิ้ง** เพราะตัวกรองคนละชุดมีจำนวนแถว
 * และลำดับคนละอย่าง การไล่โหลดตามเป้าเก่าจะได้ตำแหน่งที่ไม่มีความหมาย
 */
export function readInboxSnapshot(fp: string): { scrollTop: number; loadedCount: number } | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as Snapshot
    if (snap?.v !== 2 || snap.fp !== fp) return null
    if (Date.now() - snap.at > TTL_MS) return null
    if (!(snap.loadedCount > 0)) return null
    return { scrollTop: snap.scrollTop, loadedCount: snap.loadedCount }
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
