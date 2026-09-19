import { compareMessages } from '@/lib/chat-message-merge'

/**
 * chat-thread-scroll — การตัดสินใจเรื่องจอของห้องแชท (ส่วนขยาย 00018, 2026-09-14)
 *
 * ทำไมต้องยกออกมาเป็นฟังก์ชัน: boolean ที่ตัดสินว่า UI จะทำหรือไม่ทำอะไร ต้องมีที่ให้เทสจับ
 * (docs/conventions/ui-boolean-needs-a-testable-home.md) — เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม"
 * แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" ซึ่งเคยพลาดมาแล้วกับปุ่มย่อกลับที่เขียน
 * กลับด้านแล้วผ่านทุก gate (2026-08-09)
 */

/**
 * ข้อความใหม่เข้ามาแล้วควรเลื่อนจอตามไหม — ตามเฉพาะตอนอยู่ล่างสุด (R9, 2026-09-14)
 *
 * 🛑 ไม่มีกิ่ง "ร้านส่งเองให้ตามเสมอ" โดยตั้งใจ — แถว SHOP ใหม่มาจากบอท เพื่อนร่วมทีม echo ของ
 *    Business Suite และ Meta AI ด้วย ถ้าตามทุกใบ คนที่เลื่อนขึ้นไปอ่านของเก่าจะถูกกระชากลงล่าง
 *    ทุกครั้งที่ใครในร้านตอบ · การกดส่งของเราเองเลื่อนลงล่างใน handleSend อยู่แล้ว
 */
export function shouldFollowNewMessages(input: {
  /** จออยู่ล่างสุด (หรือใกล้ล่างสุดในระยะที่ถือว่ากำลังอ่านของล่าสุดอยู่) */
  atBottom: boolean
}): boolean {
  return input.atBottom
}

/**
 * delta คืนครบเพดาน (อาจมีแถวที่ไม่ได้มา) — ต้องโหลดหน้าแรกใหม่แทนที่จอ แต่ **ทำตอนนี้ได้ไหม** (R16)
 *
 * 🛑 ผู้ใช้เลื่อนขึ้นไปอ่านของเก่าอยู่ = เลื่อนการแทนที่ออกไป ห้ามทำทันที — การแทนด้วย 30 ใบใหม่สุด
 *    ลบ DOM ที่ผู้ใช้กำลังอ่านทิ้ง scrollHeight หด scrollTop ถูกบีบ จอเด้ง (ผิด spec §5.4 "ห้ามเด้ง")
 *    และ sentinel บนสุดอาจโผล่แล้วโหลดของเก่าเอง · ขึ้นปุ่ม "ข้อความใหม่" แทน แล้วแทนที่ตอนผู้ใช้
 *    ลงมาถึงล่างสุดเองหรือกดปุ่ม · เคสจริง: กลับมาที่แท็บหลังพักนาน (poll หยุดตอนแท็บซ่อน)
 */
export function shouldDeferFullDeltaReplace(input: { atBottom: boolean }): boolean {
  return !input.atBottom
}

/** sentinel บนสุดถูกมองเห็นแล้ว — โหลดของเก่าต่อได้ไหม */
export function canAutoLoadOlder(input: {
  /**
   * ผู้ใช้เคยเลื่อนจอด้วยตัวเองแล้วอย่างน้อยหนึ่งครั้งในห้องนี้
   * 🛑 ถ้าไม่มีเงื่อนไขนี้ IntersectionObserver จะยิง loadOlder ทันทีที่ mount เมื่อเนื้อหา
   *    ไม่สูงพอจะดัน sentinel ให้พ้นจอ (เธรดสั้น / จอสูง) = โหลดของเก่าเองโดยผู้ใช้ไม่ได้ขอ
   */
  userHasScrolled: boolean
  hasCursor: boolean
  loading: boolean
}): boolean {
  return input.userHasScrolled && input.hasCursor && !input.loading
}

/**
 * แถวที่ "ใหม่จริง" ในชุดที่เพิ่งเข้ามา (R10) — ที่เดียวที่ตัดสินเรื่องนี้ ใช้ทั้งตัวนับปุ่ม "ข้อความใหม่"
 * เสียงเตือน (แถว BUYER ในนี้) และการเลื่อนตาม
 *
 * ใหม่จริง = ไม่เคยอยู่บนจอ **และ** อยู่หลังใบล่าสุดบนจอตามลำดับของเธรด (createdAt แล้ว seq)
 * 🛑 delta คืนแถวเดิมที่ถูกแก้ (รีแอ็กชัน/สถานะส่ง) — นับเข้าไปปุ่มจะชวนเลื่อนลงไปหาของที่ไม่มี
 * 🛑 แถวที่ไล่ดึงย้อนหลังจาก Meta ได้ seq ใหม่แต่เวลาเก่า แทรกกลางเธรด — ไม่ใช่ข้อความใหม่
 *    (นับแล้ว widget จะดังเสียงให้ข้อความลูกค้าเมื่อหลายเดือนก่อน)
 * บับเบิล optimistic (`local-*`) ไม่ใช้เป็นเส้นแบ่ง — เวลาของมันเป็นนาฬิกาเครื่อง client
 */
export function pickNewIncoming<T extends { id: string; createdAt: string; seq?: number }>(
  prev: T[],
  incoming: T[],
): T[] {
  const ids = new Set<string>()
  let newest: T | undefined
  for (const m of prev) {
    ids.add(m.id)
    if (m.id.startsWith('local-')) continue
    if (!newest || compareMessages(m, newest) > 0) newest = m
  }
  return incoming.filter((m) => !ids.has(m.id) && (!newest || compareMessages(m, newest) > 0))
}

/**
 * ตัวเลขบนปุ่ม "ข้อความใหม่" ต้องบวกเพิ่มเท่าไรจากชุดแถวใหม่จริง (R24, user ตัดสิน 2026-09-14)
 *
 * นับเฉพาะข้อความของ **ลูกค้า** (`senderRole === 'BUYER'`) — แถว SHOP ที่เข้ามาใหม่คือบอท/เพื่อนร่วมทีม/
 * echo ของ Business Suite/Meta AI ไม่ใช่สิ่งที่ผู้ขายต้องเลื่อนลงไปตอบ · ใช้ทั้งทางปกติและทาง R16
 * (delta ครบเพดาน) — 🛑 ทาง R16 ไม่มีขั้นต่ำ 1 แล้ว: ไม่มีข้อความลูกค้า = ไม่ขึ้นปุ่ม การแทนที่จอยังเกิด
 * ตอนผู้ใช้เลื่อนลงถึงล่างสุดเอง · เงื่อนไขเดียวกับเสียงเตือน (BUYER) ⇒ ปุ่มกับเสียงไม่มีวันขัดกัน
 */
export function countUnseenIncrement(fresh: { senderRole: string }[]): number {
  let n = 0
  for (const m of fresh) if (m.senderRole === 'BUYER') n += 1
  return n
}

type Row = { id: string; createdAt: string; seq?: number }

/** ใบเก่าสุดบนจอที่ไม่ใช่บับเบิล optimistic (นาฬิกาเครื่อง client ห้ามเป็นเส้นแบ่ง) */
function oldestReal<T extends Row>(rows: T[]): T | undefined {
  let oldest: T | undefined
  for (const m of rows) {
    if (m.id.startsWith('local-')) continue
    if (!oldest || compareMessages(m, oldest) < 0) oldest = m
  }
  return oldest
}

/**
 * delta ที่เพิ่งกลับมาควรทำอะไรกับจอ (R13 + R28 + R31) — แทนที่ด้วยหน้าแรก หรือ merge แถวไหนบ้าง
 *
 * server เรียง delta ใหม่→เก่าตาม createdAt แล้วตัดที่ `take` ⇒ แถวที่ไม่ได้มาคือแถวที่ **เก่ากว่า**
 * ใบเก่าสุดที่ได้มาเสมอ ⇒ "อาจมีช่องว่างบนจอ" แปลว่าตัดเต็มเพดาน **และ** ใบเก่าสุดที่ได้มายังอยู่ใน
 * หน้าต่างของจอ (ไม่เก่ากว่าใบเก่าสุดที่โหลดไว้) — ถ้าใบเก่าสุดที่ได้มาเก่ากว่าหน้าต่างแล้ว แถวที่ถูกตัด
 * ก็เก่ากว่าหน้าต่างทั้งหมด ไม่มีอะไรหายจากจอ
 *
 * 🛑 ห้ามตัดสินจาก `incoming.length >= take` อย่างเดียว (แบบเดิม): หลังแทนที่จอเหลือหน้าแรก 30 ใบ
 *    แถวที่ไล่ดึงย้อนหลังจาก Meta (createdAt เก่า · updatedAt ในช่วง 5 วิ ของ R31 เดียวกัน) ถูกคืนซ้ำ
 *    ≥100 ใบทุกรอบ poll ⇒ แทนที่จอซ้ำทุก 12 วิไม่มีวันจบ = บั๊ก C1 กลับมาทางระยะเผื่อ
 * 🛑 แถวที่เก่ากว่าหน้าต่างของจอห้ามเข้าจอ (`inWindow` กรองออก) เมื่อยังมีของเก่ากว่าใน DB — merge เข้าไป
 *    จะวางไว้บนสุดของจอโดยมีช่องว่างคั่นกับใบที่โหลดไว้ · loadOlder ดึงแถวพวกนั้นจาก DB ตรงอยู่แล้ว
 *    (ผู้เรียกยังต้องส่ง `incoming` ทั้งชุดเป็น `fetched` ให้ watermark)
 */
export function planDeltaApply<T extends Row>(input: {
  /** ข้อความบนจอตอนนี้ */
  screen: T[]
  /** ยังมีข้อความเก่ากว่าที่ยังไม่ได้โหลด (oldestCursor !== null) */
  hasOlder: boolean
  /** แถวจาก delta */
  incoming: T[]
  /** เพดานที่ขอไป */
  take: number
}): { replace: boolean; inWindow: T[] } {
  const edge = input.hasOlder ? oldestReal(input.screen) : undefined
  const inWindow = edge ? input.incoming.filter((m) => compareMessages(m, edge) >= 0) : input.incoming
  return { replace: input.incoming.length >= input.take && inWindow.length === input.incoming.length, inWindow }
}

/**
 * ไม่มี watermark ใน store (TTL หมดตอนแท็บซ่อน / ถูกไล่ออก) ⇒ poll ขอหน้าแรกแทน delta — หน้านั้น merge
 * ต่อกับจอได้ไหม หรือต้องแทนที่ (R33)
 *
 * 🛑 ยังมีของเก่ากว่าหน้านั้น (`nextCursor !== null`) และใบเก่าสุดของหน้านั้นใหม่กว่าใบล่าสุดบนจอ =
 *    ระหว่างสองชุดมีข้อความที่ไม่มีใครถืออยู่ merge แล้วได้ช่องว่างกลางเธรดที่ loadOlder ไม่มีวันเติม
 *    (cursor บนจออยู่เหนือช่องนั้น) ⇒ ต้องแทนที่ · จอไม่มีแถวจริงเลยก็แทนที่ (ได้ cursor ของหน้านั้นมาด้วย)
 */
export function firstPageLeavesGap<T extends Row>(input: {
  screen: T[]
  /** หน้าแรกจาก API — เรียงใหม่→เก่า */
  pageDesc: T[]
  nextCursor: string | null
}): boolean {
  if (input.nextCursor === null) return false
  let newest: T | undefined
  for (const m of input.screen) {
    if (m.id.startsWith('local-')) continue
    if (!newest || compareMessages(m, newest) > 0) newest = m
  }
  const oldestPage = oldestReal(input.pageDesc)
  if (!newest || !oldestPage) return true
  return compareMessages(oldestPage, newest) > 0
}
