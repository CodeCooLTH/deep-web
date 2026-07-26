/**
 * Unit tests — src/lib/shop-video.ts
 *
 * ตัวนี้เป็นด่านกันลิงก์หลอกลวงบนหน้าที่ผู้ซื้อใช้ตัดสินใจโอนเงิน เทสจึงเน้นทุกทางที่ควรถูก
 * ปฏิเสธมากกว่า happy path — ถ้าหลุดแม้ทางเดียว ร้านจะแปะ iframe อะไรก็ได้ลงหน้าตัวเอง
 */
import { describe, it, expect } from 'vitest'

import { parseVideoUrl, buildEmbedUrl, buildWatchUrl } from './shop-video'

describe('parseVideoUrl — ลิงก์ที่ต้องผ่าน', () => {
  it('TikTok รูปแบบเต็ม (ลิงก์จริงที่ user ให้มา)', () => {
    expect(parseVideoUrl('https://www.tiktok.com/@bk_shopss/video/7543138483917917458')).toEqual({
      provider: 'TIKTOK',
      videoId: '7543138483917917458',
    })
  })

  it('YouTube Shorts', () => {
    expect(parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      provider: 'YOUTUBE',
      videoId: 'dQw4w9WgXcQ',
    })
  })

  it('YouTube watch + youtu.be', () => {
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.videoId).toBe('dQw4w9WgXcQ')
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')?.videoId).toBe('dQw4w9WgXcQ')
  })

  it('Instagram reel / reels / p', () => {
    expect(parseVideoUrl('https://www.instagram.com/reel/CxYz123abc/')).toEqual({
      provider: 'INSTAGRAM',
      videoId: 'CxYz123abc',
    })
    expect(parseVideoUrl('https://instagram.com/reels/CxYz123abc')?.provider).toBe('INSTAGRAM')
    expect(parseVideoUrl('https://instagram.com/p/CxYz123abc/')?.provider).toBe('INSTAGRAM')
  })

  it('มี query string ติดมา (ลิงก์แชร์จริงมักมี) ยังผ่าน', () => {
    expect(
      parseVideoUrl('https://www.tiktok.com/@bk_shopss/video/7543138483917917458?is_from_webapp=1&sender_device=pc')
        ?.videoId,
    ).toBe('7543138483917917458')
  })
})

describe('parseVideoUrl — ลิงก์ที่ต้องถูกปฏิเสธ', () => {
  it('โดเมนอื่นทั้งหมด', () => {
    for (const bad of [
      'https://evil.com/video/123',
      'https://tiktok.com.evil.com/@a/video/123',
      'https://notyoutube.com/shorts/abc123',
      'https://vimeo.com/12345',
    ]) {
      expect(parseVideoUrl(bad)).toBeNull()
    }
  })

  it('http ธรรมดา (ถูกดักแก้ระหว่างทางได้)', () => {
    expect(parseVideoUrl('http://www.youtube.com/shorts/dQw4w9WgXcQ')).toBeNull()
  })

  it('ลิงก์ย่อที่ต้องยิงตามไปถึงจะรู้ปลายทาง — กัน SSRF', () => {
    expect(parseVideoUrl('https://vm.tiktok.com/ZSAbc123/')).toBeNull()
    expect(parseVideoUrl('https://vt.tiktok.com/ZSAbc123/')).toBeNull()
  })

  it('รหัสคลิปมีอักขระที่ทำให้หลุดออกนอก path ที่ตั้งใจ', () => {
    expect(parseVideoUrl('https://www.youtube.com/shorts/..%2F..%2Fadmin')).toBeNull()
    expect(parseVideoUrl('https://www.tiktok.com/@a/video/123abc')).toBeNull()
    expect(parseVideoUrl('https://www.instagram.com/reel/a b c/')).toBeNull()
  })

  it('ค่าที่ไม่ใช่ URL', () => {
    for (const bad of ['', 'ไม่ใช่ลิงก์', 'javascript:alert(1)', 'data:text/html,<script>']) {
      expect(parseVideoUrl(bad)).toBeNull()
    }
  })
})

describe('buildEmbedUrl / buildWatchUrl', () => {
  it('ประกอบ URL ฝังจากรหัสที่ผ่านการตรวจแล้วเท่านั้น', () => {
    const tt = parseVideoUrl('https://www.tiktok.com/@bk_shopss/video/7543138483917917458')!
    expect(buildEmbedUrl(tt)).toBe('https://www.tiktok.com/embed/v2/7543138483917917458')
    expect(buildWatchUrl(tt)).toBe('https://www.tiktok.com/video/7543138483917917458')
  })

  it('YouTube ใช้โดเมน nocookie — ไม่ตั้ง cookie ติดตามจนกว่าจะกดเล่น', () => {
    const yt = parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')!
    expect(buildEmbedUrl(yt)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })

  it('URL ที่ประกอบออกมาอยู่ในโดเมนที่ตั้งใจเสมอ', () => {
    const hosts = ['https://www.youtube.com/shorts/dQw4w9WgXcQ',
                   'https://www.tiktok.com/@a/video/7543138483917917458',
                   'https://www.instagram.com/reel/CxYz123abc/']
      .map((u) => new URL(buildEmbedUrl(parseVideoUrl(u)!)).hostname)
    expect(hosts).toEqual(['www.youtube-nocookie.com', 'www.tiktok.com', 'www.instagram.com'])
  })
})
