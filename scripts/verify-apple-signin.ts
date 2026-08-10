/**
 * verify-apple-signin — ตรวจว่าค่า Sign in with Apple ที่ตั้งไว้ใช้งานได้จริง (READ-ONLY)
 *
 * รัน: npx tsx scripts/verify-apple-signin.ts
 *
 * ทำไมต้องมี: ถ้าค่าใดค่าหนึ่งผิด Apple จะตอบแค่ `invalid_client` โดยไม่บอกว่าอะไรผิด —
 * ตรวจจากฝั่งเราก่อนได้ว่าอย่างน้อย "เซ็น JWT สำเร็จและโครงสร้างถูก" ก่อนไปนั่งเดาที่หน้าจอล็อกอิน
 *
 * 🛑 ไม่พิมพ์ค่าคีย์หรือ JWT เต็มออกมาเด็ดขาด — แสดงแค่ผลตรวจ
 */
import { createAppleClientSecret } from '../src/lib/apple-client-secret'

const required = ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'] as const

function main() {
  const missing = required.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.log('ยังไม่ได้ตั้งค่า:', missing.join(', '))
    console.log('→ Sign in with Apple จะไม่เปิดใช้งาน (ปุ่มยังโผล่ แต่ provider ไม่ทำงาน)')
    process.exit(1)
  }

  const clientId = process.env.APPLE_CLIENT_ID!
  try {
    const jwt = createAppleClientSecret({
      clientId,
      teamId: process.env.APPLE_TEAM_ID!,
      keyId: process.env.APPLE_KEY_ID!,
      privateKey: process.env.APPLE_PRIVATE_KEY!,
    })
    const [header, payload, signature] = jwt.split('.')
    const h = JSON.parse(Buffer.from(header!, 'base64url').toString())
    const p = JSON.parse(Buffer.from(payload!, 'base64url').toString())

    console.log('เซ็น client secret สำเร็จ')
    console.log('  alg          :', h.alg, h.alg === 'ES256' ? 'ถูก' : '← ต้องเป็น ES256')
    console.log('  kid (Key ID) :', h.kid)
    console.log('  iss (Team ID):', p.iss)
    console.log('  sub (Services ID):', p.sub)
    console.log('  aud          :', p.aud)
    console.log('  หมดอายุอีก   :', Math.round((p.exp - p.iat) / 86400), 'วัน')
    console.log(
      '  ลายเซ็น      :',
      Buffer.from(signature!, 'base64url').length,
      'ไบต์',
      Buffer.from(signature!, 'base64url').length === 64 ? '(P1363 ถูก)' : '← ต้องเป็น 64 (ลืม ieee-p1363)',
    )

    if (!clientId.endsWith('.web')) {
      console.log('\nเตือน: APPLE_CLIENT_ID ไม่ลงท้ายด้วย .web — ต้องเป็น **Services ID** ไม่ใช่ bundle id ของแอป')
    }
  } catch (e) {
    console.error('เซ็นไม่สำเร็จ — ตรวจ APPLE_PRIVATE_KEY:', e instanceof Error ? e.message : e)
    process.exit(1)
  }
}

main()
