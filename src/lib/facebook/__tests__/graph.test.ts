import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listManageablePages, sendTextMessage, GraphApiError } from '@/lib/facebook/graph'

const okJson = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response)

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
            id: '3', name: 'ร้านมี IG', access_token: 'tok3',
            tasks: ['MESSAGING', 'MODERATE'],
            instagram_business_account: { id: 'IG9' },
          },
        ],
      }),
    )

    const pages = await listManageablePages('user_token')
    expect(pages.map((p) => p.id)).toEqual(['1', '3'])
    expect(pages[1]!.instagramBusinessAccountId).toBe('IG9')
    expect(pages[0]!.instagramBusinessAccountId).toBeNull()
  })

  it('sendTextMessage คืน mid เมื่อสำเร็จ', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      okJson({ recipient_id: 'PSID_1', message_id: 'mid.out.1' }),
    )
    await expect(sendTextMessage('PAGE1', 'tok', 'PSID_1', 'สวัสดี')).resolves.toBe('mid.out.1')
  })

  it('error จาก Graph → โยน GraphApiError พร้อม code', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: { message: 'This message is sent outside of allowed window.', code: 10, error_subcode: 2018278 },
          }),
      } as Response),
    )

    const err = await sendTextMessage('PAGE1', 'tok', 'PSID_1', 'สาย').catch((e) => e)
    expect(err).toBeInstanceOf(GraphApiError)
    expect(err.code).toBe(10)
    expect(err.subcode).toBe(2018278)
  })

  it('ไม่ใส่ access token ลง query string ของ URL (กัน token หลุดเข้า log)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okJson({ message_id: 'm' }))
    await sendTextMessage('PAGE1', 'super_secret_token', 'PSID_1', 'hi')
    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('super_secret_token')
  })
})
