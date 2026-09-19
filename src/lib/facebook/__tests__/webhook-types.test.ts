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

  // [blocker] prod 2026-09-19: message ไม่มี mid ทำให้ทั้ง request ตก = event อื่นใน batch หายด้วย
  it('[blocker] message ที่ไม่มี mid ไม่ทำให้ทั้ง batch ตก', () => {
    const body = structuredClone(TEXT_EVENT)
    body.entry[0].messaging.push({
      sender: { id: 'PSID_2' },
      recipient: { id: '111222333' },
      timestamp: 1750000000001,
      message: { text: 'ไม่มี mid' } as { mid: string; text: string },
    })
    const parsed = v.safeParse(WebhookBodySchema, body)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(extractMessagingEvents(parsed.output)).toHaveLength(2)
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
