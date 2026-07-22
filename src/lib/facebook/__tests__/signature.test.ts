import { describe, it, expect, beforeAll } from 'vitest'
import { createHmac } from 'crypto'

const SECRET = 'test_app_secret'
const sign = (body: string) => 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')

beforeAll(() => {
  process.env.FB_CHAT_APP_SECRET = SECRET
})

describe('verifyWebhookSignature', () => {
  it('ลายเซ็นถูกต้อง → true', async () => {
    const { verifyWebhookSignature } = await import('@/lib/facebook/signature')
    const body = JSON.stringify({ object: 'page', entry: [] })
    expect(verifyWebhookSignature(body, sign(body))).toBe(true)
  })

  it('body ถูกแก้หลังเซ็น → false', async () => {
    const { verifyWebhookSignature } = await import('@/lib/facebook/signature')
    const sig = sign('{"object":"page"}')
    expect(verifyWebhookSignature('{"object":"evil"}', sig)).toBe(false)
  })

  it('ไม่มี header → false', async () => {
    const { verifyWebhookSignature } = await import('@/lib/facebook/signature')
    expect(verifyWebhookSignature('{}', null)).toBe(false)
  })

  it('header ผิดรูปแบบ (ไม่มี prefix sha256=) → false', async () => {
    const { verifyWebhookSignature } = await import('@/lib/facebook/signature')
    expect(verifyWebhookSignature('{}', 'deadbeef')).toBe(false)
  })

  it('ลายเซ็นยาวไม่เท่ากัน → false ไม่ throw', async () => {
    const { verifyWebhookSignature } = await import('@/lib/facebook/signature')
    expect(verifyWebhookSignature('{}', 'sha256=abc')).toBe(false)
  })
})
