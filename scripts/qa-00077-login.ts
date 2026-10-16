/** พิมพ์ NextAuth session cookie (JWT) ของ user ที่ระบุ: npx tsx scripts/qa-00077-login.ts <userId> [activeShopId] */
import { encode } from 'next-auth/jwt'
import { readFileSync } from 'node:fs'
const secret = readFileSync('.env.local', 'utf8').match(/^NEXTAUTH_SECRET=["']?([^"'\n]+)/m)?.[1] ?? ''
const [userId, activeShopId] = process.argv.slice(2)
encode({ token: { userId, needsRegistration: false, needsOnboarding: false, ...(activeShopId ? { activeShopId } : {}) }, secret }).then((t) => console.log(t))
