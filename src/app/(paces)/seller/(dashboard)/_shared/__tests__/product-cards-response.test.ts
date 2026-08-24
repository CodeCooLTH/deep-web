/**
 * [blocker] 207 ("ส่งได้บางส่วน") ต้องถูกอ่านจริง ไม่ใช่ตกไปเข้ากิ่งสำเร็จ
 *
 * ที่มา (รีวิวทั้ง branch ก่อน merge, 2026-08-23): `sendProductCards` วางกิ่ง 207 ไว้ **ข้างใน**
 * `if (!res.ok)` — แต่ `Response.ok` เป็น `true` ตลอดช่วง 200–299 ซึ่งรวม 207 ⇒ กิ่งนั้นไม่มีวัน
 * ถูกเดินเข้าไปสักครั้งตั้งแต่วันแรก. ผลที่ผู้ขายเห็น: ส่งการ์ดได้บางส่วน แต่จอเงียบสนิท แผงปิด
 * เหมือนส่งครบทุกใบ แล้วเขากดส่งซ้ำทั้งชุด = ลูกค้าได้การ์ดซ้ำ และบน LINE รอบสองตกไปใช้ push
 * ซึ่งนับโควตา = เงินร้าน
 *
 * 🛑 `tsc`/`eslint`/build เขียวหมดทุกด่าน เพราะโค้ดถูกทุกตัวอักษร — สิ่งที่ผิดคือ *ลำดับ* ของ
 * เงื่อนไข ซึ่งไม่มีเครื่องมือไหนของโปรเจกต์ตรวจได้ ต้องมีเทสที่เดินเส้นทางจริงเท่านั้น
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const toastError = vi.fn()

vi.mock('@/lib/paces-toast', () => ({
  pacesToast: { error: (m: string) => toastError(m), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }))
vi.mock('@/lib/supabase-browser', () => ({ getSupabaseBrowserClient: () => null }))
vi.mock('@/lib/chat-sound', () => ({ playChatBeep: vi.fn() }))
vi.mock('@/lib/upload-client', () => ({ uploadToStorage: vi.fn() }))

const { readProductCardsResponse } = await import('../useSellerChatThread')

/** คำตอบจริงที่ route ส่งมาเมื่อชุดแรกเข้าคิวได้ ชุดถัดไปล้ม (route.ts เส้นทาง PRODUCT) */
const PARTIAL_BODY = {
  error: 'เข้าคิวส่งแล้ว 1 จาก 3 ข้อความ — กดส่งอีกครั้งเพื่อส่งส่วนที่เหลือ',
  sentMessages: 1,
  totalMessages: 3,
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => vi.clearAllMocks())

describe('[blocker] readProductCardsResponse — 207 ต้องเดินถึงได้จริง', () => {
  it('ข้อสมมติที่ทั้งเรื่องตั้งอยู่บนมัน: 207 ให้ res.ok === true', () => {
    // ถ้าวันหนึ่งข้อนี้ไม่จริง เหตุผลของ `if (res.status === 207)` ที่วางไว้ก่อน `!res.ok` หมดความหมาย
    expect(json({}, 207).ok).toBe(true)
  })

  it('207 ⇒ ok:false + คืนจำนวนที่ออกไปแล้ว + ขึ้น toast + refetch', async () => {
    const refetch = vi.fn(async () => {})
    const out = await readProductCardsResponse(json(PARTIAL_BODY, 207), refetch)

    expect(
      out,
      'คืน ok:true เมื่อไหร่ = แผงปิดทิ้งเหมือนส่งครบ ผู้ขายกดส่งซ้ำ ลูกค้าได้การ์ดซ้ำ',
    ).toEqual({ ok: false, sentMessages: 1 })
    expect(toastError).toHaveBeenCalledWith(PARTIAL_BODY.error)
    expect(refetch, 'ต้อง refetch ด้วย ไม่งั้นเธรดไม่มีบับเบิลของที่ส่งไปแล้วจริงให้เห็น').toHaveBeenCalledTimes(1)
  })

  it('207 ที่ body ไม่มี sentMessages ⇒ 0 (ไม่ติ๊กอะไรออก = ถอยไปพฤติกรรมที่ปลอดภัยกว่า)', async () => {
    const out = await readProductCardsResponse(json({ error: 'พัง' }, 207), vi.fn(async () => {}))
    expect(out).toEqual({ ok: false, sentMessages: 0 })
  })

  it('207 ที่ body ไม่ใช่ JSON ⇒ ไม่ throw และยังคืน ok:false', async () => {
    const res = new Response('<html>proxy</html>', { status: 207 })
    const out = await readProductCardsResponse(res, vi.fn(async () => {}))
    expect(out).toEqual({ ok: false, sentMessages: 0 })
    expect(toastError).toHaveBeenCalledWith('ส่งการ์ดสินค้าไม่สำเร็จ')
  })

  it('202 (เข้าคิวครบทุกใบ) ⇒ ok:true + refetch + ไม่มี toast', async () => {
    const refetch = vi.fn(async () => {})
    const out = await readProductCardsResponse(json({}, 202), refetch)

    expect(out).toEqual({ ok: true, sentMessages: 0 })
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(toastError).not.toHaveBeenCalled()
  })

  it('400 ⇒ ok:false, sentMessages:0, ขึ้น toast, **ไม่** refetch', async () => {
    const refetch = vi.fn(async () => {})
    const out = await readProductCardsResponse(json({ error: 'ไม่พบสินค้านี้ในร้าน' }, 400), refetch)

    expect(out).toEqual({ ok: false, sentMessages: 0 })
    expect(toastError).toHaveBeenCalledWith('ไม่พบสินค้านี้ในร้าน')
    expect(refetch).not.toHaveBeenCalled()
  })

  it('ถ้อยคำมาจาก route ทั้งหมด — ไม่มีคำใหม่ถูกพิมพ์ฝั่งจอ (HR16)', async () => {
    await readProductCardsResponse(json(PARTIAL_BODY, 207), vi.fn(async () => {}))
    // ข้อความที่ผู้ขายเห็นต้องเป็นสตริงเดียวกับที่ route ส่งมา ไม่ใช่เวอร์ชันที่ฝั่งจอเรียบเรียงใหม่
    expect(toastError.mock.calls[0]?.[0]).toBe(PARTIAL_BODY.error)
  })
})
