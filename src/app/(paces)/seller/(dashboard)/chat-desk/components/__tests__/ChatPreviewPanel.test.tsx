import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatPreviewView, type PreviewData } from '../ChatPreviewPanel'
import type { DeskCustomer } from '@/lib/chat-desk/types'

const customer: DeskCustomer = {
  id: 'c1111111-1111-4111-8111-111111111111',
  name: 'คุณเอ',
  platform: 'MESSENGER',
  pageId: 'p1',
  status: 'WAITING',
  since: '2026-10-16T07:00:00.000Z',
}
const data: PreviewData = {
  room: { id: customer.id, name: 'คุณเอ', platform: 'MESSENGER', pageName: 'เพจหลัก' },
  truncated: false,
  messages: [
    { id: 'm1', senderRole: 'BUYER', by: null, type: 'TEXT', body: 'สนใจสินค้าครับ', isDeleted: false, createdAt: '2026-10-16T07:00:00.000Z' },
    { id: 'm2', senderRole: 'SHOP', by: { kind: 'EXTERNAL' }, type: 'TEXT', body: 'ตอบนอกระบบ', isDeleted: false, createdAt: '2026-10-16T07:01:00.000Z' },
    { id: 'm3', senderRole: 'SHOP', by: { kind: 'ADMIN', name: 'Palmy' }, type: 'TEXT', body: null, isDeleted: true, createdAt: '2026-10-16T07:02:00.000Z' },
  ],
}
const render = (phase: 'ok' | 'loading' | 'error') =>
  renderToStaticMarkup(
    <ChatPreviewView customer={customer} now={Date.parse('2026-10-16T07:05:00.000Z')} phase={phase} data={phase === 'ok' ? data : null} onRetry={() => {}} onClose={() => {}} />,
  )

describe('ChatPreviewPanel (อ่านอย่างเดียว)', () => {
  for (const phase of ['ok', 'loading', 'error'] as const) {
    it(`${phase}: ไม่มีช่องพิมพ์/ปุ่มส่ง และมีลิงก์ไป /inbox/{id}`, () => {
      const html = render(phase)
      expect(html).not.toMatch(/<textarea|<input|type="submit"/)
      expect(html).not.toContain('ส่งข้อความ')
      expect(html).toContain(`href="/inbox/${customer.id}"`)
      expect(html).toContain('อ่านอย่างเดียว')
    })
  }

  it('แสดงข้อความถูกลบ, ตอบจากนอกระบบ และชื่อแอดมิน', () => {
    const html = render('ok')
    expect(html).toContain('ข้อความถูกลบ')
    expect(html).toContain('ตอบจากนอกระบบ')
    expect(html).toContain('Palmy')
    expect(html).toContain('เพจหลัก')
  })

  it('error มีปุ่มลองใหม่', () => {
    expect(render('error')).toContain('ลองใหม่')
  })
})
