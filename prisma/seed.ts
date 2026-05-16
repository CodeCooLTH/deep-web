import { PrismaClient } from "@prisma/client";

// Seed ต้องใช้ DIRECT_URL (non-pooled) — pgbouncer transaction mode
// จะทำให้ FK ไม่ valid ถ้า parent row ถูก write บน session ที่ต่างกัน
// seed.ts ดึง DIRECT_URL แทน DATABASE_URL โดยอัตโนมัติถ้ามีใน env
// วิธีรัน: npm run seed:supabase (อ่าน docs/conventions/seed-and-env.md)
const connectionUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url: connectionUrl } },
});

type Addr = {
  name: string; phone: string; line1: string; line2?: string;
  district: string; amphoe: string; province: string; postalCode: string; note?: string;
}

const BKK_ADDR: Addr = {
  name: 'สมชาย ใจดี', phone: '0812345678',
  line1: '99/123 ถนนสุขุมวิท', line2: 'คอนโด Example Residence ห้อง 1505',
  district: 'คลองเตย', amphoe: 'คลองเตย', province: 'กรุงเทพมหานคร', postalCode: '10110',
  note: 'ฝากไว้กับ รปภ. ได้ครับ',
}
const UPCOUNTRY_ADDR: Addr = {
  name: 'วิภา สุวรรณ', phone: '0823456789',
  line1: '45 หมู่ 7 บ้านสวน',
  district: 'แม่เหียะ', amphoe: 'เมืองเชียงใหม่', province: 'เชียงใหม่', postalCode: '50100',
}
const SUBURB_ADDR: Addr = {
  name: 'ธีรพงษ์ รักษ์ดี', phone: '0834567890',
  line1: '222/34 หมู่บ้านเอ็มเมอรัลด์',
  district: 'บางบอน', amphoe: 'บางบอน', province: 'กรุงเทพมหานคร', postalCode: '10150',
}
const PHYSICAL_ADDRS: Addr[] = [BKK_ADDR, UPCOUNTRY_ADDR, SUBURB_ADDR];

async function main() {
  // Seed default badges \u2014 single source of truth, idempotent upsert keyed by nameEN.
  // audience: 'SELLER' = seller-only achievement badge, 'ANY' = applies to all users.
  // icon: nullable String \u2014 null \u0E2B\u0E21\u0E32\u0E22\u0E16\u0E36\u0E07 engine \u0E08\u0E30\u0E41\u0E2A\u0E14\u0E07 fallback icon \u0E41\u0E17\u0E19.
  const badges: Array<{
    name: string; nameEN: string; icon: string | null;
    type: string; audience: string; criteria: object;
  }> = [
    // \u2500\u2500 10 badges \u0E40\u0E14\u0E34\u0E21 (\u0E15\u0E2D\u0E19\u0E19\u0E35\u0E49\u0E21\u0E35 audience field) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    { name: "\u0E40\u0E1B\u0E34\u0E14\u0E2B\u0E19\u0E49\u0E32\u0E23\u0E49\u0E32\u0E19",       nameEN: "First Sale",         icon: "\uD83C\uDFEA", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "FIRST_ORDER" } },
    { name: "\u0E23\u0E49\u0E32\u0E19\u0E04\u0E49\u0E32\u0E02\u0E32\u0E22\u0E2D\u0E14\u0E19\u0E34\u0E22\u0E21",  nameEN: "Trusted Seller 50",  icon: "\u2B50", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 50 } },
    { name: "\u0E23\u0E49\u0E2D\u0E22\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C",        nameEN: "Century Club",       icon: "\uD83D\uDCAF", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 100 } },
    { name: "\u0E23\u0E49\u0E32\u0E19\u0E04\u0E30\u0E41\u0E19\u0E19\u0E40\u0E15\u0E47\u0E21",     nameEN: "Perfect Rating",     icon: "\uD83D\uDC8E", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "PERFECT_RATING", minReviews: 10 } },
    { name: "\u0E23\u0E49\u0E32\u0E19\u0E04\u0E30\u0E41\u0E19\u0E19\u0E2A\u0E39\u0E07",      nameEN: "Highly Rated",       icon: "\uD83C\uDF1F", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "HIGH_RATING", minRating: 4.8, minReviews: 20 } },
    { name: "\u0E44\u0E23\u0E49\u0E02\u0E49\u0E2D\u0E23\u0E49\u0E2D\u0E07\u0E40\u0E23\u0E35\u0E22\u0E19",   nameEN: "Zero Complaint",     icon: "\uD83D\uDEE1\uFE0F", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ZERO_COMPLAINT", minOrders: 50 } },
    { name: "\u0E23\u0E49\u0E32\u0E19\u0E04\u0E49\u0E32\u0E40\u0E01\u0E48\u0E32\u0E41\u0E01\u0E48",    nameEN: "Veteran",            icon: "\uD83C\uDFC6", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "VETERAN", minDays: 365 } },
    { name: "\u0E08\u0E31\u0E14\u0E2A\u0E48\u0E07\u0E2A\u0E32\u0E22\u0E1F\u0E49\u0E32",      nameEN: "Speed Demon",        icon: "\u26A1", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "FAST_SHIPPING", maxHours: 24, minOrders: 20 } },
    { name: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E04\u0E23\u0E1A\u0E16\u0E49\u0E27\u0E19",     nameEN: "Fully Verified",     icon: "\u2705", type: "VERIFICATION", audience: "ANY",    criteria: { type: "FULL_VERIFICATION" } },
    { name: "\u0E02\u0E27\u0E31\u0E0D\u0E43\u0E08\u0E0A\u0E38\u0E21\u0E0A\u0E19",       nameEN: "Community Favorite", icon: "\u2764\uFE0F", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "UNIQUE_REVIEWERS", count: 50 } },
    // \u2500\u2500 badge \u0E43\u0E2B\u0E21\u0E48 (Phase 3) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // icon: null \u2014 engine \u0E43\u0E0A\u0E49 fallback SVG/image \u0E41\u0E17\u0E19 emoji \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A badge \u0E1B\u0E35
    { name: "\u0E1B\u0E35 2026",            nameEN: "2026_BADGE",         icon: null, type: "ACHIEVEMENT",  audience: "ANY",    criteria: { type: "SIGNUP_YEAR", year: 2026 } },
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { nameEN: badge.nameEN },
      update: { name: badge.name, icon: badge.icon, type: badge.type, audience: badge.audience, criteria: badge.criteria },
      create: badge,
    });
  }
  console.log(`Seeded ${badges.length} badges`);

  // Seed admin user
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      displayName: "Admin",
      username: "admin",
      isAdmin: true,
      authAccounts: {
        create: { provider: "EMAIL", providerAccountId: "admin@safepay.co" },
      },
    },
  });
  console.log(`Seeded admin user: ${admin.id}`);

  // Seed user — phone 0920791649 (username testuser, isShop).
  // OTP bypass ถูกถอดแล้ว (user request 2026-05-16) — login ต้องใช้ SMS OTP จริง
  // ผ่าน apitel เหมือนเบอร์ปกติ ไม่มี OTP ตายตัว 123456 อีกต่อไป
  const testUser = await prisma.user.upsert({
    where: { username: "testuser" },
    update: { isShop: true },
    create: {
      phone: "0920791649",
      displayName: "ผู้ใช้ทดสอบ",
      username: "testuser",
      trustScore: 50,
      isShop: true,
      authAccounts: {
        create: { provider: "PHONE", providerAccountId: "0920791649" },
      },
    },
  });
  console.log(`Seeded test user: ${testUser.id}`);

  // Seed 2nd seller test account — phone 0000000001 / OTP 123456.
  // Separate shop + data, for parallel browser sessions or data-isolation demos.
  const testUser2 = await prisma.user.upsert({
    where: { username: "btpremium_suksawat" },
    update: { isShop: true },
    create: {
      phone: "0000000001",
      displayName: "BT Premium สุขสวัสดิ์",
      username: "btpremium_suksawat",
      trustScore: 65,
      isShop: true,
      authAccounts: {
        create: { provider: "PHONE", providerAccountId: "0000000001" },
      },
    },
  });
  console.log(`Seeded test user 2: ${testUser2.id}`);

  // Seed mock data for the primary test user — skip if already seeded (idempotent)
  const existingShop = await prisma.shop.findUnique({
    where: { userId: testUser.id },
  });
  if (!existingShop) {
    const shop = await prisma.shop.create({
      data: {
        userId: testUser.id,
        shopName: "BT Premium Auto Xeon - สาขาสุขสวัสดิ์",
        description:
          "ร้านทำไฟหน้ารถยนต์ครบวงจร รับอัพเกรด ซ่อมแซม ติดตั้งไฟซีนอน LED โปรเจคเตอร์ เดย์ไลท์ ทุกรุ่น",
        category: "ยานยนต์",
        address: "สาขาสุขสวัสดิ์ กรุงเทพมหานคร",
        businessType: "COMPANY",
      },
    });

    // ใช้ sequential loop แทน Promise.all — pgbouncer transaction mode
    // ไม่รับประกันว่า concurrent write จะ visible ข้าม session ก่อน FK ถูกเช็ก
    const productDefs = [
      { name: "หลอดไฟซีนอน HID 6000K (คู่)", price: 2500, type: "PHYSICAL", description: "หลอดไฟซีนอน แสงขาว 6000K รับประกัน 1 ปี ใช้ได้ H1/H4/H7/H11/9005/9006" },
      { name: "ชุด LED Headlight H4/H7 (คู่)", price: 3200, type: "PHYSICAL", description: "หลอด LED headlight ความสว่างสูง ระบายความร้อนด้วยพัดลม รับประกัน 2 ปี" },
      { name: "ไฟเดย์ไลท์ DRL LED (คู่)", price: 1800, type: "PHYSICAL", description: "ไฟ Daytime Running Light LED ติดตั้งง่าย รับประกัน 1 ปี" },
      { name: "บัลลาสซีนอน Slim Ballast (คู่)", price: 1500, type: "PHYSICAL", description: "บัลลาสไฟซีนอน slim 35W กันน้ำ IP67 รับประกัน 1 ปี" },
      { name: "โคมไฟหน้า Projector Bi-Xenon", price: 8900, type: "PHYSICAL", description: "โคมไฟหน้าโปรเจคเตอร์ Bi-Xenon พร้อม shroud angle eye สำหรับรถทุกรุ่น" },
      { name: "บริการติดตั้งไฟซีนอน", price: 800, type: "SERVICE", description: "บริการติดตั้งชุดไฟซีนอน HID ที่ร้าน ใช้เวลา 30-45 นาที" },
      { name: "บริการโมไฟหน้ารถ Projector", price: 3500, type: "SERVICE", description: "บริการโมไฟหน้าใส่โคมโปรเจคเตอร์ พร้อมงานประกอบ ใช้เวลา 1-2 วัน" },
      { name: "บริการซ่อมโคมไฟหน้าเบลอ/ขุ่น", price: 1200, type: "SERVICE", description: "ขัดและเคลือบโคมไฟหน้ารถที่เบลอหรือขุ่น คืนความใส เหมือนใหม่ ใช้เวลา 1-2 ชม." },
    ];
    const products: Awaited<ReturnType<typeof prisma.product.create>>[] = [];
    for (const p of productDefs) {
      const product = await prisma.product.create({
        data: { shopId: shop.id, ...p },
      });
      products.push(product);
    }

    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

    type OrderLine = { idx: number; qty: number };
    const orderRecipes: Array<{
      status: string;
      fulfillmentMode: string;
      type: string;
      buyerContact: string;
      lines: OrderLine[];
      createdDaysAgo: number;
      addr?: Addr;
      tracking?: { provider: string; trackingNo: string };
      review?: { rating: number; comment: string; reviewerContact: string };
    }> = [
      // ── Single-item PHYSICAL ──────────────────────────────────────────────────
      // CREATED → PENDING (spec mapping); มี PHYSICAL item → fulfillmentMode SHIPPED
      { status: "PENDING", fulfillmentMode: "SHIPPED", type: "PHYSICAL", buyerContact: "0812345678", lines: [{ idx: 0, qty: 1 }], createdDaysAgo: 0, addr: BKK_ADDR },
      // ── Single-item SERVICE ───────────────────────────────────────────────────
      // CREATED → PENDING; SERVICE-only → NO_SHIPPING
      { status: "PENDING", fulfillmentMode: "NO_SHIPPING", type: "SERVICE", buyerContact: "0823456789", lines: [{ idx: 7, qty: 1 }], createdDaysAgo: 1 },
      // ── Combo: product + installation service ────────────────────────────────
      // CONFIRMED + PHYSICAL item (fulfillmentMode SHIPPED) → PENDING (spec Q1: CONFIRMED+SHIPPED-fulfillment → PENDING)
      {
        status: "PENDING",
        fulfillmentMode: "SHIPPED",
        type: "PHYSICAL",
        buyerContact: "0834567890",
        lines: [
          { idx: 1, qty: 1 }, // ชุด LED Headlight H4/H7 (คู่)
          { idx: 5, qty: 1 }, // บริการติดตั้งไฟซีนอน
        ],
        createdDaysAgo: 2,
        addr: SUBURB_ADDR,
      },
      // CONFIRMED + SERVICE-only (NO_SHIPPING) → CONFIRMED terminal (spec Q1: CONFIRMED+NO_SHIPPING → CONFIRMED)
      { status: "CONFIRMED", fulfillmentMode: "NO_SHIPPING", type: "SERVICE", buyerContact: "0845678901", lines: [{ idx: 6, qty: 1 }], createdDaysAgo: 3 },
      {
        status: "SHIPPED",
        fulfillmentMode: "SHIPPED",
        type: "PHYSICAL",
        buyerContact: "0856789012",
        lines: [{ idx: 2, qty: 1 }],
        createdDaysAgo: 4,
        addr: UPCOUNTRY_ADDR,
        tracking: { provider: "Kerry Express", trackingNo: "KEX123456789TH" },
      },
      // ── Combo: projector headlight + custom-fitting service ──────────────────
      {
        status: "SHIPPED",
        fulfillmentMode: "SHIPPED",
        type: "PHYSICAL",
        buyerContact: "0867890123",
        lines: [
          { idx: 4, qty: 1 }, // โคมไฟหน้า Projector Bi-Xenon
          { idx: 6, qty: 1 }, // บริการโมไฟหน้ารถ Projector
        ],
        createdDaysAgo: 5,
        addr: BKK_ADDR,
        tracking: { provider: "Flash Express", trackingNo: "FL987654321TH" },
      },
      // COMPLETED → CONFIRMED (spec mapping); มี PHYSICAL item → SHIPPED
      {
        status: "CONFIRMED",
        fulfillmentMode: "SHIPPED",
        type: "PHYSICAL",
        buyerContact: "0878901234",
        lines: [{ idx: 1, qty: 1 }],
        createdDaysAgo: 7,
        addr: SUBURB_ADDR,
        tracking: { provider: "Thailand Post", trackingNo: "EY112233445TH" },
        review: { rating: 5, comment: "ไฟสว่างมาก ติดตั้งง่าย ร้านบริการดี!", reviewerContact: "0878901234" },
      },
      // ── Combo: completed physical + install, both invoiced together ─────────
      // COMPLETED → CONFIRMED; มี PHYSICAL item → SHIPPED
      {
        status: "CONFIRMED",
        fulfillmentMode: "SHIPPED",
        type: "PHYSICAL",
        buyerContact: "0889012345",
        lines: [
          { idx: 0, qty: 1 }, // หลอด HID
          { idx: 5, qty: 1 }, // บริการติดตั้ง
        ],
        createdDaysAgo: 9,
        addr: BKK_ADDR,
        tracking: { provider: "Kerry Express", trackingNo: "KEX555666777TH" },
        review: { rating: 5, comment: "ทีมช่างชำนาญ ติดตั้งเร็ว แนะนำเลย", reviewerContact: "0889012345" },
      },
      // COMPLETED → CONFIRMED; SERVICE-only → NO_SHIPPING
      {
        status: "CONFIRMED",
        fulfillmentMode: "NO_SHIPPING",
        type: "SERVICE",
        buyerContact: "0892345678",
        lines: [{ idx: 7, qty: 1 }],
        createdDaysAgo: 10,
        review: { rating: 4, comment: "โคมใสขึ้นเยอะ รอดูว่าจะอยู่ได้นานแค่ไหน", reviewerContact: "0892345678" },
      },
      // CANCELLED unchanged; PHYSICAL → SHIPPED; cancelInitiator unset (null) per spec Q3
      { status: "CANCELLED", fulfillmentMode: "SHIPPED", type: "PHYSICAL", buyerContact: "0890123456", lines: [{ idx: 3, qty: 2 }], createdDaysAgo: 1, addr: UPCOUNTRY_ADDR },
    ];

    let orderCount = 0;
    for (const r of orderRecipes) {
      const created = daysAgo(r.createdDaysAgo);
      const lineData = r.lines.map((ln) => {
        const product = products[ln.idx];
        return {
          product,
          qty: ln.qty,
          subtotal: Number(product.price) * ln.qty,
        };
      });
      const total = lineData.reduce((s, l) => s + l.subtotal, 0);
      const order = await prisma.order.create({
        data: {
          shopId: shop.id,
          type: r.type,
          status: r.status,
          fulfillmentMode: r.fulfillmentMode,
          buyerContact: r.buyerContact,
          totalAmount: total,
          shippingAddress: r.type === 'PHYSICAL' && r.addr ? (r.addr as object) : undefined,
          createdAt: created,
          updatedAt: created,
          items: {
            create: lineData.map((l) => ({
              productId: l.product.id,
              name: l.product.name,
              description: l.product.description,
              qty: l.qty,
              price: l.product.price,
            })),
          },
        },
      });
      if (r.tracking) {
        await prisma.shipmentTracking.create({
          data: {
            orderId: order.id,
            provider: r.tracking.provider,
            trackingNo: r.tracking.trackingNo,
            status: r.status === "SHIPPED" ? "SHIPPED" : "DELIVERED",
          },
        });
      }
      if (r.review) {
        await prisma.review.create({
          data: {
            orderId: order.id,
            rating: r.review.rating,
            comment: r.review.comment,
            reviewerContact: r.review.reviewerContact,
          },
        });
      }
      orderCount++;
    }
    console.log(
      `Seeded mock data: shop "${shop.shopName}" + ${products.length} products + ${orderCount} orders`,
    );
  } else {
    console.log(`Mock data already present for test user — skipping`);
  }

  // ── 2nd seller test account's shop ───────────────────────────────────────
  // Skip if already seeded — separate id-space from primary testuser shop.
  const existingShop2 = await prisma.shop.findUnique({
    where: { userId: testUser2.id },
  });
  if (!existingShop2) {
    const shop2 = await prisma.shop.create({
      data: {
        userId: testUser2.id,
        shopName: "BT premium auto xenon สาขา สุขสวัสดิ์",
        description:
          "สาขาสุขสวัสดิ์ — ทำไฟหน้ารถทุกยี่ห้อ โปรเจคเตอร์ ซีนอน LED Daylight ติดตั้งหน้าร้าน",
        category: "ยานยนต์",
        address: "ถนนสุขสวัสดิ์ เขตราษฎร์บูรณะ กรุงเทพมหานคร",
        businessType: "COMPANY",
      },
    });

    // Sequential loop — เหตุผลเดียวกับ shop 1: หลีกเลี่ยง concurrent write FK race
    const productDefs2 = [
      { name: "ชุดไฟหน้า LED Premium (คู่)", price: 4500, type: "PHYSICAL", description: "LED ความสว่าง 8000lm ใช้ได้ทุกรุ่น รับประกัน 2 ปี" },
      { name: "ไฟซีนอน HID Slim Kit", price: 2800, type: "PHYSICAL", description: "หลอดซีนอน + บัลลาส slim 35W รับประกัน 1 ปี" },
      { name: "ไฟ Daylight Signature", price: 2400, type: "PHYSICAL", description: "DRL พร้อมไฟเลี้ยววิ่ง รับประกัน 1 ปี" },
      { name: "บริการติดตั้งไฟหน้า", price: 900, type: "SERVICE", description: "ติดตั้งไฟหน้าทุกประเภท ใช้เวลา 30-60 นาที" },
      { name: "บริการโมไฟหน้า Full Custom", price: 4500, type: "SERVICE", description: "โมโคมไฟหน้าตามแบบ พร้อมติดตั้ง ใช้เวลา 2-3 วัน" },
    ];
    const products2: Awaited<ReturnType<typeof prisma.product.create>>[] = [];
    for (const p of productDefs2) {
      const product = await prisma.product.create({
        data: { shopId: shop2.id, ...p },
      });
      products2.push(product);
    }

    // A small set of orders for the second shop — includes one product+service combo.
    const daysAgo2 = (n: number) => new Date(Date.now() - n * 86_400_000);
    const recipes2: Array<{
      status: string;
      fulfillmentMode: string;
      type: string;
      buyerContact: string;
      lines: { idx: number; qty: number }[];
      createdDaysAgo: number;
      addr?: Addr;
      tracking?: { provider: string; trackingNo: string };
    }> = [
      // CREATED → PENDING; PHYSICAL → SHIPPED
      { status: "PENDING", fulfillmentMode: "SHIPPED", type: "PHYSICAL", buyerContact: "0901234567", lines: [{ idx: 0, qty: 1 }], createdDaysAgo: 0, addr: BKK_ADDR },
      // CONFIRMED + PHYSICAL item (fulfillmentMode SHIPPED) → PENDING (spec Q1)
      {
        status: "PENDING",
        fulfillmentMode: "SHIPPED",
        type: "PHYSICAL",
        buyerContact: "0912345678",
        lines: [
          { idx: 1, qty: 1 }, // ซีนอน HID
          { idx: 3, qty: 1 }, // บริการติดตั้ง
        ],
        createdDaysAgo: 2,
        addr: SUBURB_ADDR,
      },
      {
        status: "SHIPPED",
        fulfillmentMode: "SHIPPED",
        type: "PHYSICAL",
        buyerContact: "0923456789",
        lines: [{ idx: 2, qty: 1 }],
        createdDaysAgo: 4,
        addr: UPCOUNTRY_ADDR,
        tracking: { provider: "Kerry Express", trackingNo: "KEX998877665TH" },
      },
      // COMPLETED → CONFIRMED; มี PHYSICAL item → SHIPPED
      {
        status: "CONFIRMED",
        fulfillmentMode: "SHIPPED",
        type: "PHYSICAL",
        buyerContact: "0934567890",
        lines: [
          { idx: 0, qty: 1 }, // LED Premium
          { idx: 3, qty: 1 }, // บริการติดตั้ง
        ],
        createdDaysAgo: 7,
        addr: BKK_ADDR,
        tracking: { provider: "Flash Express", trackingNo: "FL111222333TH" },
      },
    ];

    let orderCount2 = 0;
    for (const r of recipes2) {
      const created = daysAgo2(r.createdDaysAgo);
      const lineData = r.lines.map((ln) => {
        const product = products2[ln.idx];
        return { product, qty: ln.qty, subtotal: Number(product.price) * ln.qty };
      });
      const total = lineData.reduce((s, l) => s + l.subtotal, 0);
      const order = await prisma.order.create({
        data: {
          shopId: shop2.id,
          type: r.type,
          status: r.status,
          fulfillmentMode: r.fulfillmentMode,
          buyerContact: r.buyerContact,
          totalAmount: total,
          shippingAddress: r.type === 'PHYSICAL' && r.addr ? (r.addr as object) : undefined,
          createdAt: created,
          updatedAt: created,
          items: {
            create: lineData.map((l) => ({
              productId: l.product.id,
              name: l.product.name,
              description: l.product.description,
              qty: l.qty,
              price: l.product.price,
            })),
          },
        },
      });
      if (r.tracking) {
        await prisma.shipmentTracking.create({
          data: {
            orderId: order.id,
            provider: r.tracking.provider,
            trackingNo: r.tracking.trackingNo,
            status: r.status === "SHIPPED" ? "SHIPPED" : "DELIVERED",
          },
        });
      }
      orderCount2++;
    }
    console.log(
      `Seeded shop 2: "${shop2.shopName}" + ${products2.length} products + ${orderCount2} orders`,
    );
  } else {
    console.log(`Mock data already present for test user 2 — skipping`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
