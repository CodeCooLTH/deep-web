/**
 * seed-service-queue-demo — สร้างร้านบริการ + งาน 3 ใบ สำหรับทดสอบ feature 00050 บนเครื่อง
 *
 * 🛑 **ห้ามรันกับฐาน prod เด็ดขาด** — สคริปต์นี้ *สร้าง* ข้อมูลอย่างเดียว (ไม่ลบอะไรเลย)
 * แต่ข้อมูลปลอมที่ไปโผล่ในร้านจริงคือความเสียหายเหมือนกัน · ตัวสคริปต์ **ตรวจเองว่าฐานที่ต่อ
 * อยู่เป็น localhost จริงไหม แล้ว throw ถ้าไม่ใช่** (Hard Rule 14 — เพดานที่บังคับไม่ได้
 * = เพดานที่ไม่มีอยู่จริง)
 *
 * วิธีรัน (ปักหมุด URL ในคำสั่ง ห้ามพึ่งค่าจาก .env ซึ่งชี้ prod):
 *
 *   DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *   DIRECT_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *   npx tsx scripts/seed-service-queue-demo.ts
 *
 * รันซ้ำได้ — ใช้ upsert ด้วย id คงที่ทั้งหมด (ไม่สร้างขยะเพิ่มทุกรอบ)
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

/** id คงที่ ขึ้นต้น `sq-demo-` ทั้งหมด — ตามหาและลบด้วยมือได้ง่ายถ้าต้องการ */
const ID = {
  user: "sq-demo-user",
  shop: "sq-demo-shop",
  resource: "sq-demo-resource",
  buyer: "sq-demo-buyer",
  customer: "sq-demo-customer",
  conversation: "sq-demo-conversation",
  orderWalkIn: "sq-demo-order-walkin",
  orderUnpaid: "sq-demo-order-unpaid",
  orderPartial: "sq-demo-order-partial",
  paymentPartial: "sq-demo-payment-partial",
} as const;

/**
 * 🛑 ต้องเป็นเบอร์ที่อยู่ใน `TEST_ACCOUNTS` ของ `src/lib/otp.ts` เท่านั้น (dev เท่านั้น — prod = {})
 * ไม่งั้น **ล็อกอินไม่ได้เลย** เพราะระบบจะพยายามส่ง SMS จริงซึ่งเครื่อง dev ไม่มีทางรับได้
 * 0000000001 ถูกใช้โดยผู้ใช้เดิมในฐาน local อยู่แล้ว (`User.phone` เป็น unique) จึงใช้ตัวถัดไป
 */
const PHONE = "0000000002";      // ผู้ขาย — OTP 123456
const BUYER_PHONE = "0000000003"; // ผู้ซื้อ (ไว้เปิดหน้า /o/[token] แบบล็อกอิน) — OTP 123456

function assertLocalhost() {
  const url = process.env.DATABASE_URL ?? "";
  const direct = process.env.DIRECT_URL ?? "";
  /**
   * allow-list ไม่ใช่ deny-list — ผ่านเฉพาะโฮสต์ที่รู้จักว่าเป็นเครื่องตัวเอง
   * (deny-list พลาดเมื่อมีโฮสต์รูปแบบใหม่ ส่วน allow-list พลาดไปทาง "ไม่ให้รัน" ซึ่งปลอดภัยกว่า)
   */
  const ok = (u: string) => /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(u);
  if (!ok(url) || !ok(direct)) {
    throw new Error(
      [
        "ปฏิเสธการรัน: DATABASE_URL/DIRECT_URL ไม่ได้ชี้ localhost",
        `  DATABASE_URL = ${url.replace(/:[^:@]+@/, ":***@") || "(ว่าง)"}`,
        `  DIRECT_URL   = ${direct.replace(/:[^:@]+@/, ":***@") || "(ว่าง)"}`,
        "",
        "หยุด: .env ของโปรเจกต์นี้ชี้ Supabase prod — ต้องปักหมุด URL ในคำสั่งเอง",
        '  DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" \\',
        '  DIRECT_URL="postgresql://safepay:safepay@localhost:5434/safepay" \\',
        "  npx tsx scripts/seed-service-queue-demo.ts",
      ].join("\n"),
    );
  }
}

/** วันนี้เวลา HH:00 ตามเวลาไทย → instant UTC */
function todayAtThai(hour: number): Date {
  const now = new Date(Date.now() + 7 * 3600_000);
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour) - 7 * 3600_000,
  );
}

async function main() {
  assertLocalhost();

  // ── ผู้ขาย ────────────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { id: ID.user },
    update: {},
    create: {
      id: ID.user,
      username: "sq_demo_seller",
      displayName: "ร้านบริการตัวอย่าง (ทดสอบ 00050)",
      phone: PHONE,
    },
  });

  const shop = await prisma.shop.upsert({
    where: { id: ID.shop },
    update: { vertical: "SERVICE_QUEUE" },
    create: {
      id: ID.shop,
      userId: user.id,
      shopName: "BT ตัวอย่าง — คิวงาน",
      // slug ต้องมี ไม่งั้น proxy บังคับไป /onboarding ทุก route
      slug: "sq-demo",
      vertical: "SERVICE_QUEUE",
      kind: "PERSONAL",
    },
  });

  const resource = await prisma.serviceResource.upsert({
    where: { id: ID.resource },
    update: {},
    create: { id: ID.resource, shopId: shop.id, name: "ช่างคนที่ 1", capacity: 2 },
  });

  // ── ลูกค้า + ห้องแชท (ให้การ์ดงานโผล่ในกล่องแชทได้) ──────────────────
  /**
   * 🛑 เธรด DEEP ผูกลูกค้าผ่าน `Conversation.buyerUserId → Customer.userId`
   * ไม่ใช่ `Conversation.customerId` (คอลัมน์นั้นไม่มีอยู่จริง) — เส้นทางที่ `page.tsx` ใช้
   * คือ `buyerUserId` สำหรับ DEEP และ `externalContact.customer` สำหรับช่องทางนอก
   * ถ้าผูกผิดเส้น การ์ดงานจะไม่โผล่ในแผงลูกค้าเลยทั้งที่ออเดอร์มีจริง
   */
  const buyer = await prisma.user.upsert({
    where: { id: ID.buyer },
    update: {},
    create: {
      id: ID.buyer,
      username: "sq_demo_buyer",
      displayName: "คุณลูกค้า ทดสอบ",
      phone: BUYER_PHONE,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { id: ID.customer },
    update: {},
    // `Customer` เก็บแค่ตัวระบุ (phone/email/userId) — ชื่อผู้ซื้ออยู่ที่ `Order.buyerName`
    create: { id: ID.customer, phone: BUYER_PHONE, userId: buyer.id },
  });

  await prisma.conversation.upsert({
    where: { id: ID.conversation },
    update: {},
    create: {
      id: ID.conversation,
      shopId: shop.id,
      channel: "DEEP",
      buyerUserId: buyer.id,
      alias: "คุณลูกค้า ทดสอบ",
      lastMessageAt: new Date(),
      lastMessagePreview: "สนใจล้างแอร์ครับ",
      lastSenderRole: "BUYER",
    },
  });

  const base = {
    shopId: shop.id,
    customerId: customer.id,
    conversationId: ID.conversation,
    buyerName: "คุณลูกค้า ทดสอบ",
    buyerContact: BUYER_PHONE,
    status: "PENDING",
    type: "SERVICE",
    fulfillmentMode: "NO_SHIPPING",
    salesChannel: "DEEP",
  } as const;

  // ① walk-in — ไม่มีเวลาเริ่ม ⇒ หายจากตารางงาน จนกว่าจะกด "เริ่มงานเลย"
  await prisma.order.upsert({
    where: { id: ID.orderWalkIn },
    update: {},
    create: {
      ...base,
      id: ID.orderWalkIn,
      publicToken: "11111111-1111-4111-8111-111111111111",
      totalAmount: new Prisma.Decimal("1500.00"),
      depositAmount: new Prisma.Decimal("300.00"),
      items: {
        create: [{ name: "ล้างแอร์ 2 เครื่อง", qty: 1, price: new Prisma.Decimal("1500.00") }],
      },
    },
  });

  // ② มีนัดวันนี้ ยังไม่ได้รับเงินสักบาท ⇒ เห็นทั้ง "แจ้งมัดจำ" และ "รับเงินแล้ว"
  await prisma.order.upsert({
    where: { id: ID.orderUnpaid },
    update: { serviceStart: todayAtThai(14), serviceEnd: todayAtThai(15) },
    create: {
      ...base,
      id: ID.orderUnpaid,
      publicToken: "22222222-2222-4222-8222-222222222222",
      totalAmount: new Prisma.Decimal("2000.00"),
      depositAmount: new Prisma.Decimal("500.00"),
      serviceResourceId: resource.id,
      serviceSeat: 1,
      serviceStart: todayAtThai(14),
      serviceEnd: todayAtThai(15),
      appointmentStatus: "SCHEDULED",
      items: { create: [{ name: "ติดตั้งแอร์", qty: 1, price: new Prisma.Decimal("2000.00") }] },
    },
  });

  // ③ มีนัดวันนี้ + รับมัดจำแล้ว 500 ⇒ ยังค้าง 2,500 (ทดสอบการ์ดเงิน/ประวัติ/ยกเลิกรายการ)
  await prisma.order.upsert({
    where: { id: ID.orderPartial },
    update: { serviceStart: todayAtThai(16), serviceEnd: todayAtThai(17) },
    create: {
      ...base,
      id: ID.orderPartial,
      publicToken: "33333333-3333-4333-8333-333333333333",
      totalAmount: new Prisma.Decimal("3000.00"),
      depositAmount: new Prisma.Decimal("500.00"),
      serviceResourceId: resource.id,
      serviceSeat: 2,
      serviceStart: todayAtThai(16),
      serviceEnd: todayAtThai(17),
      appointmentStatus: "SCHEDULED",
      items: { create: [{ name: "ย้ายแอร์ + เดินท่อใหม่", qty: 1, price: new Prisma.Decimal("3000.00") }] },
    },
  });

  await prisma.orderPayment.upsert({
    where: { id: ID.paymentPartial },
    update: {},
    create: {
      id: ID.paymentPartial,
      orderId: ID.orderPartial,
      shopId: shop.id,
      kind: "DEPOSIT",
      amount: new Prisma.Decimal("500.00"),
      method: "TRANSFER",
      receivedByUserId: user.id,
      note: "โอนมาตอนเช้า (ข้อมูลทดสอบ)",
      receivedAt: todayAtThai(9),
    },
  });

  // seller อยู่คนละ subdomain (proxy.ts) — /etc/hosts ชี้ deepth.local ทั้ง 3 ตัวไว้แล้ว
  const H = "http://deepth.local:3000";
  const S = "http://seller.deepth.local:3000";
  console.log(`
เสร็จแล้ว — ข้อมูลทดสอบพร้อม

  ร้าน      ${shop.shopName}  (vertical = SERVICE_QUEUE)
  ผู้ขาย     เบอร์ ${PHONE}   (OTP 123456)
  ผู้ซื้อ     เบอร์ ${BUYER_PHONE}   (OTP 123456 — ใช้เปิดหน้า /o/[token] แบบล็อกอิน)
  คิวงาน    ${resource.name} (รับได้ 2 คิวพร้อมกัน)

งาน 3 ใบ
  ① walk-in ไม่มีเวลาเริ่ม   ฿1,500 · มัดจำ 300 · ยังไม่รับเงิน
  ② นัดวันนี้ 14:00-15:00   ฿2,000 · มัดจำ 500 · ยังไม่รับเงิน
  ③ นัดวันนี้ 16:00-17:00   ฿3,000 · มัดจำ 500 · รับมัดจำแล้ว → ค้าง 2,500

หน้าที่ต้องเปิด
  [ร้าน]  แชท        ${S}/inbox/${ID.conversation}
  [ร้าน]  หน้าแรก     ${S}/dashboard
  [ร้าน]  ตารางงาน    ${S}/queues
  [ร้าน]  ออเดอร์ ③   ${S}/orders/33333333-3333-4333-8333-333333333333
  [ลูกค้า] หน้าออเดอร์ ③ ${H}/o/33333333-3333-4333-8333-333333333333
`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
