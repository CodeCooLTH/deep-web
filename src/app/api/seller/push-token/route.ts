// push-token — ลงทะเบียน Expo push token ของแอปผู้ขาย (deep-seller-app)
//
// ทำไมต้องมีตัวนี้ทั้งที่ /api/app/push-token มีอยู่แล้ว: ตัวนั้น auth ด้วย Bearer
// (requireAppUser) สำหรับแอปผู้ซื้อที่ล็อกอินแบบ native. แอปผู้ขายเป็น WebView-first —
// ผู้ขายล็อกอินในเว็บด้วย username+password แล้ว cookie อยู่ใน WebView ฝั่ง native ไม่มี
// Bearer ให้ใช้เลย. หน้าเว็บจึงเป็นคนยิง POST นี้เอง (credentials: 'include') โดย native
// แค่ inject ค่า token เข้าไปให้ผ่าน injectedJavaScript
//
// 🛑 ทำไมวางที่ /api/seller/* ไม่ใช่ /api/app/*: proxy.ts ยกเว้น CSRF Origin-check ให้
// `/api/app/*` ทั้งก้อน เพราะแอปผู้ซื้อยิงแบบ native (ไม่มี Origin header) และ auth ด้วย
// Bearer จึงไม่มี CSRF surface. แต่ endpoint นี้ auth ด้วย "cookie" ซึ่งเบราว์เซอร์แนบให้
// อัตโนมัติ = มี CSRF surface เต็ม ๆ ถ้าเอาไปวางใต้ /api/app/ จะกลายเป็นรูให้เว็บอื่น
// ยิงลง token ปลอมใส่บัญชีเหยื่อได้ (แล้วดักอ่าน noti ของเขา). วางที่ /api/seller/* จึงได้
// Origin-check ของ proxy คุ้มให้ตามปกติ
//
// upsert ตาม token (unique) เหมือนฝั่ง buyer — เครื่องเดียวสลับหลายบัญชีได้ token ย้ายเจ้าของ
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// รูปแบบ token ของ Expo — กันคนยิงสตริงมั่วมาถมตาราง (sendExpoPush จะ error ทีหลังอยู่ดี)
const Body = v.object({
  token: v.pipe(v.string(), v.regex(/^Expo(nent)?PushToken\[[^\]]+\]$/)),
  platform: v.optional(v.picklist(['ios', 'android'])),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = v.safeParse(Body, await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'token ไม่ถูกต้อง' }, { status: 400 })

  // platform: แอปส่งมาให้ตั้งแต่วันแรกแต่เคยโยนทิ้งเพราะไม่มีคอลัมน์รองรับ (เพิ่มแล้ว
  // migration 20260808150000) — จำเป็นเพราะ subtitle ของ Expo Push ใช้ได้เฉพาะ iOS
  // `?? undefined` ไม่ใช่ null: แอปเวอร์ชันเก่าที่ไม่ส่งค่ามา ต้อง "ไม่แตะคอลัมน์" ไม่ใช่ล้างค่า
  // ที่เคยบันทึกไว้ทิ้ง (เครื่องเดิมยิงซ้ำทุก 5 นาที ถ้าเขียน null ทับจะลบของดีทิ้งทุกรอบ)
  const platform = parsed.output.platform ?? undefined
  await prisma.pushToken.upsert({
    where: { token: parsed.output.token },
    update: { userId, platform },
    create: { userId, token: parsed.output.token, platform },
  })

  return NextResponse.json({ ok: true })
}

// DELETE — ถอน token ออกตอนผู้ขายกดออกจากระบบ (ไม่งั้นเครื่องนี้จะยังได้ noti ของบัญชีเดิม
// หลังสลับบัญชีแล้ว). ลบเฉพาะ token ที่เป็นของ user ปัจจุบัน — กันคนลบ token ของคนอื่นทิ้ง
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = v.safeParse(Body, await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'token ไม่ถูกต้อง' }, { status: 400 })

  await prisma.pushToken.deleteMany({ where: { token: parsed.output.token, userId } })
  return NextResponse.json({ ok: true })
}
