import { describe, it, expect } from 'vitest'
import { systemNoticeLabelKey } from '@/lib/system-notice-label'

describe('systemNoticeLabelKey', () => {
  it('การ์ด ORDER → สรุป{noun} · ข้อความตัวอักษร → ถ้อยคำกลาง', () => {
    expect(systemNoticeLabelKey({ type: 'ORDER' })).toBe('sentBySystemOrder')
    expect(systemNoticeLabelKey({ type: 'TEXT' })).toBe('sentBySystem')
    expect(systemNoticeLabelKey({ type: 'IMAGE' })).toBe('sentBySystem')
  })
})
