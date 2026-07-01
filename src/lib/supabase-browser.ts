/**
 * supabase-browser — Supabase client สำหรับฝั่ง browser เท่านั้น (Batch E#12 — realtime subscription)
 *
 * ใช้ `NEXT_PUBLIC_SUPABASE_ANON_KEY` เท่านั้น (ไม่ใช่ service role) — anon key ถูกออกแบบให้
 * expose ใน client bundle ได้อยู่แล้ว (Supabase RLS/Realtime authorization คุมฝั่ง server)
 * ห้าม import service-role key ในไฟล์นี้เด็ดขาด
 *
 * singleton กันสร้าง WebSocket connection ซ้ำซ้อนเวลา component ไหนก็ตามเรียกซ้ำ (React re-render/
 * strict-mode double-invoke ฯลฯ) — คืน instance เดิมเสมอ
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

/** คืน singleton Supabase browser client — เรียกได้เฉพาะฝั่ง client component ('use client') */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (cachedClient) return cachedClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY ไม่ได้ตั้งค่า')
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey)
  return cachedClient
}
