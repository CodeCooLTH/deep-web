import { describe, it, expect } from 'vitest'
import { isAllowedOrigin } from './csrf-origin'

describe('isAllowedOrigin (prod)', () => {
  const prod = true
  it('allow root deepthailand.app', () => {
    expect(isAllowedOrigin('https://deepthailand.app', prod)).toBe(true)
  })
  it('allow subdomain seller/admin', () => {
    expect(isAllowedOrigin('https://seller.deepthailand.app', prod)).toBe(true)
    expect(isAllowedOrigin('https://admin.deepthailand.app', prod)).toBe(true)
  })
  it('deny suffix-spoof deepthailand.app.evil.com', () => {
    expect(isAllowedOrigin('https://deepthailand.app.evil.com', prod)).toBe(false)
  })
  it('deny prefix-spoof notdeepthailand.app', () => {
    expect(isAllowedOrigin('https://notdeepthailand.app', prod)).toBe(false)
  })
  it('deny unrelated origin', () => {
    expect(isAllowedOrigin('https://evil.com', prod)).toBe(false)
  })
  it('deny null/empty/garbage', () => {
    expect(isAllowedOrigin(null, prod)).toBe(false)
    expect(isAllowedOrigin('', prod)).toBe(false)
    expect(isAllowedOrigin('not-a-url', prod)).toBe(false)
  })
  it('deny dev origin บน prod', () => {
    expect(isAllowedOrigin('http://seller.deepth.local:3001', prod)).toBe(false)
  })
})

describe('isAllowedOrigin (dev)', () => {
  const dev = false
  it('allow *.deepth.local ทุก port', () => {
    expect(isAllowedOrigin('http://seller.deepth.local:3001', dev)).toBe(true)
    expect(isAllowedOrigin('http://deepth.local:4000', dev)).toBe(true)
  })
  it('ยัง allow prod domain ใน dev', () => {
    expect(isAllowedOrigin('https://deepthailand.app', dev)).toBe(true)
  })
  it('ยัง deny evil ใน dev', () => {
    expect(isAllowedOrigin('https://evil.com', dev)).toBe(false)
  })
})
