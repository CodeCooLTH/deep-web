import { describe, it, expect } from 'vitest'
import * as v from 'valibot'
import { WebhookBodySchema, extractMessagingEvents } from '@/lib/facebook/webhook-types'

const TEXT_EVENT = {
  object: 'page',
  entry: [
    {
      id: '111222333',
      time: 1750000000000,
      messaging: [
        {
          sender: { id: 'PSID_1' },
          recipient: { id: '111222333' },
          timestamp: 1750000000000,
          message: { mid: 'mid.abc', text: 'สนใจสินค้าตัวนี้ครับ' },
        },
      ],
    },
  ],
}

describe('WebhookBodySchema', () => {
  it('รับ payload ข้อความปกติได้', () => {
    const parsed = v.safeParse(WebhookBodySchema, TEXT_EVENT)
    expect(parsed.success).toBe(true)
  })

  it('ปฏิเสธ payload ที่ไม่มี entry', () => {
    expect(v.safeParse(WebhookBodySchema, { object: 'page' }).success).toBe(false)
  })

  it('รับ payload ที่มีรูปแนบได้', () => {
    const withImage = {
      object: 'page',
      entry: [
        {
          id: '111', time: 1,
          messaging: [
            {
              sender: { id: 'PSID_1' }, recipient: { id: '111' }, timestamp: 1,
              message: {
                mid: 'mid.img',
                attachments: [{ type: 'image', payload: { url: 'https://cdn.fb/x.jpg' } }],
              },
            },
          ],
        },
      ],
    }
    expect(v.safeParse(WebhookBodySchema, withImage).success).toBe(true)
  })
})

describe('extractMessagingEvents', () => {
  it('แบน entry[].messaging[] ให้เป็นลิสต์เดียวพร้อม pageId', () => {
    const body = v.parse(WebhookBodySchema, TEXT_EVENT)
    const events = extractMessagingEvents(body)
    expect(events).toHaveLength(1)
    expect(events[0]!.pageId).toBe('111222333')
    expect(events[0]!.object).toBe('page')
    expect(events[0]!.event.message?.text).toBe('สนใจสินค้าตัวนี้ครับ')
  })

  it('entry ที่ไม่มี messaging เลย → ข้ามไม่พัง', () => {
    const body = v.parse(WebhookBodySchema, { object: 'page', entry: [{ id: '1', time: 1 }] })
    expect(extractMessagingEvents(body)).toEqual([])
  })
})
