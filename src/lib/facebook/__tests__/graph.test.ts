import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import {
  listManageablePages,
  sendTextMessage,
  exchangeCodeForToken,
  fetchThreadMessages,
  GraphApiError
} from '@/lib/facebook/graph'

const okJson = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response)
const failJson = (data: unknown, status = 400) =>
  Promise.resolve({ ok: false, status, json: () => Promise.resolve(data) } as Response)

describe('graph client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('listManageablePages กรองเฉพาะ Page ที่มี task MESSAGING และ MODERATE', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      okJson({
        data: [
          { id: '1', name: 'ร้านผ่าน', access_token: 'tok1', tasks: ['MESSAGING', 'MODERATE', 'ANALYZE'] },
          { id: '2', name: 'ร้านไม่ผ่าน', access_token: 'tok2', tasks: ['ANALYZE'] },
          {
            id: '3',
            name: 'ร้านมี IG',
            access_token: 'tok3',
            tasks: ['MESSAGING', 'MODERATE'],
            instagram_business_account: { id: 'IG9' }
          }
        ]
      })
    )

    const pages = await listManageablePages('user_token')
    expect(pages.map(p => p.id)).toEqual(['1', '3'])
    expect(pages[1]!.instagramBusinessAccountId).toBe('IG9')
    expect(pages[0]!.instagramBusinessAccountId).toBeNull()
  })

  it('sendTextMessage คืน mid เมื่อสำเร็จ', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      okJson({ recipient_id: 'PSID_1', message_id: 'mid.out.1' })
    )
    await expect(sendTextMessage('tok', 'PSID_1', 'สวัสดี')).resolves.toBe('mid.out.1')
  })

  it('error จาก Graph → โยน GraphApiError พร้อม code', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: { message: 'This message is sent outside of allowed window.', code: 10, error_subcode: 2018278 }
          })
      } as Response)
    )

    const err = await sendTextMessage('tok', 'PSID_1', 'สาย').catch(e => e)
    expect(err).toBeInstanceOf(GraphApiError)
    expect(err.code).toBe(10)
    expect(err.subcode).toBe(2018278)
  })

  it('ไม่ใส่ access token ลง query string ของ URL (กัน token หลุดเข้า log)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okJson({ message_id: 'm' }))
    await sendTextMessage('super_secret_token', 'PSID_1', 'hi')
    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('super_secret_token')
  })
})

// (S-3) exchangeCodeForToken ต้องแลกต่อเป็น long-lived token เสมอ — ไม่ใช่คืน short-lived
// จาก /oauth/access_token ตรง ๆ (spec §7.1)
describe('exchangeCodeForToken (long-lived exchange)', () => {
  beforeAll(() => {
    process.env.FB_CHAT_APP_ID = 'app_id_1'
    process.env.FB_CHAT_APP_SECRET = 'app_secret_1'
  })
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('เรียก Graph 2 ครั้ง (แลก code ก่อน แล้วแลกต่อเป็น long-lived) และคืน token ตัวหลัง', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(okJson({ access_token: 'short_lived_1' }))
      .mockReturnValueOnce(okJson({ access_token: 'long_lived_1' }))

    const token = await exchangeCodeForToken('auth_code_1', 'https://seller.deepthailand.app/cb')

    expect(fetch).toHaveBeenCalledTimes(2)
    const secondCallUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![0] as string
    expect(secondCallUrl).toContain('grant_type=fb_exchange_token')
    expect(secondCallUrl).toContain('fb_exchange_token=short_lived_1')
    expect(token).toBe('long_lived_1')
  })

  it('ขั้นแลก long-lived ล้มเหลว → คืน short-lived แทนการโยน (ใช้งานได้ชั่วคราวดีกว่าเชื่อมไม่ได้เลย)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(okJson({ access_token: 'short_lived_2' }))
      .mockReturnValueOnce(failJson({ error: { message: 'rate limited' } }, 400))

    const token = await exchangeCodeForToken('auth_code_2', 'https://seller.deepthailand.app/cb')
    expect(token).toBe('short_lived_2')
  })

  it('ขั้นแลก code แรกล้มเหลว → ยัง throw GraphApiError เหมือนเดิม (ไม่แตะพฤติกรรมนี้)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      failJson({ error: { message: 'invalid code' } }, 400)
    )
    await expect(exchangeCodeForToken('bad_code', 'https://seller.deepthailand.app/cb')).rejects.toBeInstanceOf(
      GraphApiError
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

// regression: bug จริง prod 2026-07-30 → 08-07 (542 แถวกลายเป็น placeholder)
// payload ด้านล่างคัดลอกจาก response จริงของเธรดบน prod ไม่ได้แต่งขึ้น
describe('fetchThreadMessages', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ขอ attachments แบบไม่ระบุซับฟิลด์ — ห้ามกลับไปขอ attachments{type} ที่ Graph ตัดทิ้งเงียบ ๆ', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okJson({ data: [] }))
    await fetchThreadMessages('PSID_1', 'tok', 50)

    const url = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0])
    const fields = decodeURIComponent(url)
    expect(fields).toContain('attachments}')
    expect(fields).not.toContain('attachments{')
  })

  it('การ์ด generic_template → ได้ title/subtitle/media_url ไม่ใช่ก้อนว่าง', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      okJson({
        data: [
          {
            messages: {
              data: [
                {
                  id: 'm_card_ad',
                  created_time: '2026-08-07T09:29:34+0000',
                  from: { id: 'PAGE_1' },
                  message: '',
                  attachments: {
                    data: [
                      {
                        generic_template: {
                          title: 'ราคานี้ฟรีปลายทาง',
                          subtitle: 'แจ้งรุ่นมอไซที่ใช้อยู่ได้เลย',
                          media_url: 'https://www.facebook.com/ads/image/?d=AQK6'
                        }
                      }
                    ]
                  }
                },
                {
                  id: 'm_card_call',
                  created_time: '2026-08-07T09:29:37+0000',
                  from: { id: 'PAGE_1' },
                  message: '',
                  attachments: {
                    data: [
                      {
                        generic_template: {
                          title: 'โทรหา ร้านตัวอย่าง',
                          subtitle: 'ส่งข้อความกระตุ้นให้โทรด้วยเสียงแล้ว'
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      })
    )

    const rows = await fetchThreadMessages('PSID_1', 'tok')
    expect(rows).toHaveLength(2)

    const ad = rows[0]!
    expect(ad.text).toBeNull()
    expect(ad.attachments[0]).toMatchObject({
      kind: 'template',
      title: 'ราคานี้ฟรีปลายทาง',
      subtitle: 'แจ้งรุ่นมอไซที่ใช้อยู่ได้เลย',
      mediaUrl: 'https://www.facebook.com/ads/image/?d=AQK6'
    })
    expect(rows[1]!.attachments[0]!.title).toBe('โทรหา ร้านตัวอย่าง')
  })

  it('ไฟล์แนบจริง → ได้ url/ชนิด/ขนาด สำหรับ mirror', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      okJson({
        data: [
          {
            messages: {
              data: [
                {
                  id: 'm_img',
                  created_time: '2026-08-07T09:30:00+0000',
                  from: { id: 'PSID_1' },
                  message: '',
                  attachments: {
                    data: [
                      {
                        id: '1007852132253637',
                        mime_type: 'image/jpeg',
                        name: 'image-1007852132253637',
                        size: 184288,
                        image_data: { url: 'https://scontent.fbkk7-2.fna.fbcdn.net/v/t1.15752-9/746791028.jpg' }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      })
    )

    const [msg] = await fetchThreadMessages('PSID_1', 'tok')
    expect(msg!.attachments[0]).toMatchObject({
      kind: 'image',
      mediaUrl: 'https://scontent.fbkk7-2.fna.fbcdn.net/v/t1.15752-9/746791028.jpg',
      mimeType: 'image/jpeg',
      size: 184288,
      isSticker: false
    })
  })
})
