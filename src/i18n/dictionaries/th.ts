/**
 * คำแปลภาษาไทย — และเป็น "ต้นแบบของรายชื่อคีย์" ทั้งระบบ (feature 00047)
 *
 * 🛑 ไฟล์นี้คือ single source of truth ของ *โครงสร้างคีย์* ไม่ใช่แค่คำแปลชุดหนึ่ง
 * `Dictionary` ถูก derive จาก `typeof th` แล้ว en.ts ประกาศตัวเองเป็น `Dictionary`
 * ⇒ คีย์ที่ขาดหรือเกินฝั่งใดฝั่งหนึ่ง `tsc` แดงทันที (BR-I18N-11)
 *
 * 🛑 ห้ามใส่ `as const`
 * ถ้าใส่ ค่าจะกลายเป็น literal type ("บันทึก") แล้ว en.ts จะถูกบังคับให้ใส่ค่าไทยตัวเดียวกัน
 * ซึ่งเป็นไปไม่ได้ — ไม่ใส่ `as const` ค่าจึงเป็น `string` และสิ่งที่ถูกบังคับคือ "คีย์" ล้วน ๆ
 * ตามที่ต้องการพอดี
 *
 * 🛑 ห้ามใส่ฟังก์ชันลงใน dictionary
 * ใช้ placeholder `{name}` แล้วเรียกผ่าน `fmt()` แทน — เหตุผลคือค่าในนี้ต้อง serialize ได้
 * เสมอ เผื่อวันหนึ่งมีคนส่งข้ามเส้น RSC (ฟังก์ชันใน object ที่ข้ามเส้น = ล้มทั้งหน้า
 * ดู memory feedback_rsc_props_must_be_serializable) และ JSON-able ทำให้เขียนเทสเทียบคีย์ได้ง่าย
 *
 * 🛑 ห้ามใส่ข้อความที่เป็น "ข้อมูลของผู้ใช้" (BR-I18N-06)
 * ชื่อร้าน ชื่อสินค้า ข้อความแชท ชื่อลูกค้า ไม่ใช่ส่วนติดต่อผู้ใช้ของเรา — ห้ามแปล
 *
 * 🛑 ศัพท์ธุรกิจต้องตรวจนิยามในโค้ดก่อนตั้งคำแปล (BR-I18N-08 / Hard Rule 16)
 * เช่น "กำไรขั้นต้น" (GROSS_PROFIT_FORMULA) กับ "กำไรสุทธิ" (NET_PROFIT_FORMULA)
 * มีอยู่จริงทั้งคู่ใน src/lib/format-money.ts และคำนวณคนละสูตร — ห้ามแปลรวบเป็น "Profit"
 *
 * ข้อความไทยในไฟล์นี้ต้องเหมือนของเดิมที่อยู่ในหน้าจอ "ทุกตัวอักษร" รวมช่องว่างและวรรคตอน
 * (BR-I18N-10) — ผู้ใช้เดิมต้องไม่เห็นอะไรเปลี่ยน
 */

export const th = {
  common: {
    save: 'บันทึก',
    cancel: 'ยกเลิก',
    close: 'ปิด',
    confirm: 'ยืนยัน',
    delete: 'ลบ',
    edit: 'แก้ไข',
    back: 'ย้อนกลับ',
    loading: 'กำลังโหลด...',
    retry: 'ลองใหม่อีกครั้ง',
    home: 'หน้าหลัก',
    /** อยู่ที่ `common` เพราะเป็นคำกริยาทั่วไประดับเดียวกับ save/cancel และซ้ำอยู่หลายไฟล์ */
    signOut: 'ออกจากระบบ',
    somethingWentWrong: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
  },

  /**
   * ชื่อภาษา — ใช้ร่วมกันทั้งการ์ดใน /account และตัวสลับบนหน้าเข้าสู่ระบบ
   * (namespace ระดับบนสุด ไม่ผูกกับหน้าใดหน้าหนึ่ง เพราะมีผู้เรียก 2 ที่ที่ต่างบริบทกัน)
   */
  language: {
    /** ป้ายสำหรับโปรแกรมอ่านหน้าจอ — อ่านออกในทั้งสองภาษาเสมอ (FR-I18N-01) */
    buttonLabel: 'เปลี่ยนภาษา',
    /**
     * 🛑 ชื่อภาษาเขียนด้วยภาษาของตัวเองเสมอ ไม่แปลข้ามภาษา
     * คนที่อ่านไทยไม่ออกต้องหา "English" เจอ และคนที่อ่านอังกฤษไม่ออกต้องหา "ไทย" เจอ
     * ไม่ว่ากำลังอยู่โหมดไหน — ถ้าแปลข้ามกัน ผู้ใช้ที่กดผิดจะหาทางกลับไม่เจอ
     */
    th: 'ไทย',
    en: 'English',
    /** รหัสสั้นบนปุ่มสลับของหน้าเข้าสู่ระบบ — รหัสภาษาสากล ไม่ต้องแปล */
    thCode: 'TH',
    enCode: 'EN',
  },

  /**
   * ป้ายเมนูซ้าย — คีย์ตรงกับ `slug` ใน src/lib/seller-menu.ts (ตัดคำนำหน้า `seller:` ออก)
   * ใช้ slug เป็นคีย์เพราะเป็นตัวระบุที่เสถียรอยู่แล้ว มีเทส contract คุมอยู่ และไม่ผูกกับข้อความ
   *
   * 🛑 `orders` แยกตามประเภทร้าน 3 แบบ ห้ามยุบเหลือคำเดียว (BR-I18N-09)
   * ป้ายเมนูนี้ผันตาม `Shop.vertical` มาตั้งแต่ 2026-08-04 (ORDER_VOCAB.noun) — ร้านขายของเห็น
   * "คำสั่งซื้อ" ร้านบริการเห็น "การเข้ารับบริการ" บ้านพักเห็น "บิลเข้าพัก" ถ้าแปลรวบเป็น "Orders"
   * คำเดียว เท่ากับลบความแตกต่างที่ตั้งใจสร้างไว้ทิ้งในภาษาที่สอง
   */
  menu: {
    dashboard: 'ภาพรวมร้านค้า',
    sales: 'ภาพรวมกำไร/ขาดทุน',
    orders: {
      ONLINE_SALES: 'คำสั่งซื้อ',
      SERVICE_QUEUE: 'การเข้ารับบริการ',
      LODGING: 'บิลเข้าพัก',
    },
    auctions: 'การประมูล',
    products: 'สินค้า',
    inventory: 'จัดการสต็อก',
    queues: 'ตารางงาน',
    rooms: 'ห้องพัก',
    calendar: 'ปฏิทินการจอง',
    bookings: 'การจอง',
    housekeepers: 'แม่บ้าน',
    customers: 'ลูกค้า',
    expenses: 'ค่าใช้จ่าย',
    inbox: 'ข้อความ',
    settingsAutoReply: 'ตอบกลับอัตโนมัติ',
    settingsCommentReply: 'ตอบกลับคอมเมนต์',
    settingsChatbot: 'ผู้ช่วยอัตโนมัติ',
    reviews: 'รีวิว',
    verification: 'ระดับร้าน',
    badges: 'ความสำเร็จ',
    wallet: 'กระเป๋าเงิน',
    subscriptions: 'แพ็กเกจของฉัน',
    admins: 'พนักงาน',
    shop: 'ร้านค้า',
    publicProfile: 'ตั้งค่าหน้าร้าน',
    settings: 'การจัดส่ง',
    settingsChannels: 'ช่องทางการขาย',
    settingsJobTypes: 'ประเภทงาน',
    /** ป้ายบน badge ของเมนู — คนละฟิลด์กับ label จึงไม่ถูกแปลไปพร้อมชื่อเมนู (user เจอบน prod) */
    badgeLocked: 'ถูกล็อก',
    badgeChoosePlan: 'เลือกแพ็กเกจ',
  },

  /**
   * คำนามที่ผันตามประเภทกิจการ — เงาภาษาของ `ORDER_VOCAB`/`PRODUCT_VOCAB` ใน `src/lib/seller-menu.ts`
   *
   * 🛑 ทำไมต้องมีที่นี่ทั้งที่ SSOT อยู่ที่ `seller-menu.ts`
   * ไฟล์นั้นเก็บ `soldLine: (n) => ...` ซึ่งเป็น **ฟังก์ชัน** — ค่าใน dictionary ต้อง serialize ได้
   * เสมอ (ดูเหตุผลหัวไฟล์) จึงยกมาทั้งก้อนไม่ได้ ที่นี่เก็บเฉพาะ *คำ* ที่โผล่บนหน้าแรกของผู้ขาย
   * และใช้ `{n}` + `fmt()` แทนฟังก์ชัน
   *
   * โครงเป็น `Record<vertical, string>` ท่าเดียวกับ `menu.orders` ที่มีอยู่แล้ว — ผู้เรียกอ่านด้วย
   * คีย์ vertical แล้วถอยไป `ONLINE_SALES` เมื่อเจอค่าที่ไม่รู้จัก (fail-closed เหมือน seller-menu)
   */
  vocab: {
    /** ชื่อของ "หนึ่งใบ" — ORDER_VOCAB.noun */
    orderNoun: {
      ONLINE_SALES: 'คำสั่งซื้อ',
      SERVICE_QUEUE: 'การเข้ารับบริการ',
      LODGING: 'บิลเข้าพัก',
    },
    /**
     * คำเดียวกันแต่ใช้เป็น "หัวการ์ด" — ไทยใช้คำเดิมทุกตัวอักษร ส่วนอังกฤษต้องเป็นพหูพจน์
     * ขึ้นต้นด้วยตัวใหญ่ ("Orders" ไม่ใช่ "order") เพราะยืนเดี่ยวเป็นชื่อหัวข้อ ไม่ได้อยู่กลางประโยค
     */
    orderNounTitle: {
      ONLINE_SALES: 'คำสั่งซื้อ',
      SERVICE_QUEUE: 'การเข้ารับบริการ',
      LODGING: 'บิลเข้าพัก',
    },
    /**
     * รูปสั้นสำหรับที่แคบ — ORDER_VOCAB.nounShort / createLabelShort
     * bottom nav มี 5 ช่องบนจอ 320px และ pill ของปุ่มสร้างลอยกลางจอ ⇒ คำเต็มไม่พอที่
     */
    orderNounShort: {
      ONLINE_SALES: 'คำสั่งซื้อ',
      SERVICE_QUEUE: 'บริการ',
      LODGING: 'บิลเข้าพัก',
    },
    createLabelShort: {
      ONLINE_SALES: 'สร้างคำสั่งซื้อ',
      SERVICE_QUEUE: 'งานใหม่',
      LODGING: 'เปิดบิลเข้าพัก',
    },
    /** ปุ่ม/ประโยคชวนสร้างใบใหม่ — ORDER_VOCAB.createLabel */
    createLabel: {
      ONLINE_SALES: 'สร้างคำสั่งซื้อ',
      SERVICE_QUEUE: 'สร้างงาน',
      LODGING: 'สร้างบิลเข้าพัก',
    },
    bestSellerTitle: {
      ONLINE_SALES: 'สินค้าขายดี',
      SERVICE_QUEUE: 'บริการยอดนิยม',
      LODGING: 'ห้องพักยอดนิยม',
    },
    bestSellerViewAll: {
      ONLINE_SALES: 'ดูสินค้าทั้งหมด',
      SERVICE_QUEUE: 'ดูบริการทั้งหมด',
      LODGING: 'ดูห้องพักทั้งหมด',
    },
    bestSellerEmptyTitle: {
      ONLINE_SALES: 'ยังไม่มีสินค้าขายดี',
      SERVICE_QUEUE: 'ยังไม่มีบริการยอดนิยม',
      LODGING: 'ยังไม่มีห้องพักยอดนิยม',
    },
    bestSellerEmptyHint: {
      ONLINE_SALES: 'อันดับจะขึ้นทันทีที่มีคำสั่งซื้อเข้ามา ไม่ต้องรอยืนยัน',
      SERVICE_QUEUE: 'อันดับจะขึ้นทันทีที่มีการเข้ารับบริการเข้ามา ไม่ต้องรอยืนยัน',
      LODGING: 'อันดับจะขึ้นทันทีที่มีการเข้าพักเข้ามา ไม่ต้องรอยืนยัน',
    },
    /** หัวคอลัมน์ตาราง "ขายดี" — ชื่อสิ่งของ / จำนวน / ยอดเงินรวม */
    itemCol: {
      ONLINE_SALES: 'สินค้า',
      SERVICE_QUEUE: 'บริการ',
      LODGING: 'ห้องพัก',
    },
    countCol: {
      ONLINE_SALES: 'สั่งซื้อ',
      SERVICE_QUEUE: 'ใช้บริการ',
      LODGING: 'เข้าพัก',
    },
    amountCol: {
      ONLINE_SALES: 'ยอดสั่งซื้อ',
      SERVICE_QUEUE: 'ยอดใช้บริการ',
      LODGING: 'ยอดเข้าพัก',
    },
  },

  /**
   * หน้าแรกของผู้ขาย (`/dashboard`) ฝั่งเดสก์ท็อป
   *
   * เป็น **จอแรกที่ Meta App Reviewer เห็นทันทีหลังกด Sign in** — ใบยื่นรอบแรกตกด้วยเหตุผล
   * "Screencast Not Aligned with Use Case Details" ซึ่งรวมข้อบังคับให้ใช้ภาษาอังกฤษเป็นภาษาของ UI
   * (ดู `docs/20 - Features/00018 …/APP-REVIEW.md` §5.2)
   *
   * ข้อความที่ประกอบจากคำนามผันตาม vertical ใช้ `{noun}`/`{create}` + `fmt()` — ห้ามต่อสตริงในโค้ด
   * เพราะไทยวางคำขยายไว้หลัง ("คำสั่งซื้อล่าสุด") ส่วนอังกฤษวางไว้หน้า ("Recent orders")
   */
  dashboard: {
    metaTitle: 'แดชบอร์ด',
    pageTitle: 'ภาพรวมร้านค้า',
    breadcrumbOverview: 'ภาพรวม',
    shopFallback: 'ร้านค้าของคุณ',
    unknownContact: 'ไม่ระบุ',
    welcome: 'ยินดีต้อนรับ,',
    shopIllustrationAlt: 'ภาพประกอบร้านค้า',

    rangeToday: 'วันนี้',
    rangeMonth: 'เดือนนี้',
    /**
     * ชุดเดียวกันแต่ใช้ "กลางประโยค" — ไทยเป็นคำเดียวกันเป๊ะ แต่อังกฤษต้องเป็นตัวเล็ก
     * ("No orders today" ไม่ใช่ "No orders Today") ⇒ แยกคีย์ ไม่ใช่ lowercase ในโค้ด
     * เพราะภาษาที่ไม่มีตัวพิมพ์ใหญ่/เล็กจะถูกทำลายด้วยการ lowercase แบบเหมารวม
     */
    rangeTodayInline: 'วันนี้',
    rangeMonthInline: 'เดือนนี้',
    rangeAria: 'ช่วงเวลาที่แสดงในหน้านี้',
    rangeLoading: 'กำลังโหลดข้อมูล',
    /** ประกาศให้ screen reader ตอนสลับช่วง — {range} คือ rangeToday/rangeMonth */
    rangeAnnounce: 'แสดงข้อมูล{range}',

    statOrders: 'ออเดอร์',
    statRevenue: 'รายได้',
    vsLastMonth: 'เทียบเดือนที่แล้ว',

    channelsTitle: 'ช่องทางการขาย',
    /** {range} = "วันนี้"/"เดือนนี้" — ไทยเอาช่วงเวลาขึ้นก่อน อังกฤษเอาไว้ท้ายประโยค */
    channelsEmptyTitle: '{range}ยังไม่มีออเดอร์',
    channelsEmptyDesc: 'เมื่อมีคำสั่งซื้อ สัดส่วนช่องทางจะแสดงที่นี่',
    channelsOrdersUnit: '{n} ออเดอร์',

    salesTitle: 'รายงานยอดขาย',
    salesSubtitle: 'ยอดขายรายเดือน',
    salesEmptyTitle: 'ยังไม่มียอดขาย',
    salesEmptyDesc: 'กราฟจะแสดงเมื่อเริ่มมีออเดอร์',
    salesSeriesRevenue: 'รายได้รวม',
    salesSeriesOrders: 'ออเดอร์',
    salesSummaryRevenue: 'รายได้',
    salesSummaryOrders: 'ออเดอร์',
    salesSummaryGrowth: 'อัตราเติบโต',

    bestSellerLifetime: 'ตลอดชีพ',
    bestSellerPriceCol: 'ราคา',

    /** หัวการ์ด "สถานะคำสั่งซื้อ" — {noun} = vocab.orderNoun ของร้านนั้น */
    statusBandTitle: 'สถานะ{noun}',
    viewAll: 'ดูทั้งหมด',
    statusPending: 'รอดำเนินการ',
    statusShipped: 'กำลังจัดส่ง',
    statusConfirmed: 'สำเร็จ',
    statusCancelled: 'ยกเลิก',
    stageAwaitingParcel: 'รอเลขพัสดุ',
    stageAwaitingPickup: 'รอรับเข้า',
    stageInTransit: 'กำลังจัดส่ง',
    stageCodPending: 'รอเงิน COD',
    stageProblem: 'พัสดุมีปัญหา',
    appointmentToday: 'นัดวันนี้',

    /** หัวการ์ดตารางใบล่าสุด — {noun} = vocab.orderNoun */
    recentOrdersTitle: '{noun}ล่าสุด',
    recentOrdersExport: 'ส่งออก',
    recentOrdersImport: 'นำเข้า',
    recentOrdersEmptyTitle: 'ยังไม่มี{noun}',
    recentOrdersEmptyDesc: 'เมื่อมี{noun}เข้ามา จะแสดงที่นี่',
    recentOrdersNoMatch: 'ไม่พบ{noun}',
    colCode: 'รหัส',
    colBuyer: 'ผู้ซื้อ',
    colDate: 'วันที่',
    colAmount: 'ยอด',
    colType: 'ประเภท',
    colStatus: 'สถานะ',
    typePhysical: 'สินค้า',
    typeDigital: 'ดิจิทัล',
    typeService: 'บริการ',

    activityTitle: 'กิจกรรมล่าสุด',
    /** {create} = vocab.createLabel — ของเดิมคือ `${createLabel}แรกเลย` */
    activityEmptyTitle: '{create}แรกเลย',
    activityEmptyDesc: 'กิจกรรมจะปรากฏที่นี่เมื่อคุณเริ่มใช้งาน',
    /** ตัวมือถือ (ActivityTimeline) ใช้หัวข้อสั้นกว่า — ไม่มีปุ่ม CTA ใต้ข้อความ */
    activityEmptyNone: 'ยังไม่มีกิจกรรม',

    achievementTitle: 'ระดับความสำเร็จ',
    achievementEarned: 'ได้รับแล้ว',
    achievementInProgress: 'ใกล้ได้รับ',
    achievementNotStarted: 'ยังไม่เริ่ม',
    achievementNoneEarned: 'ยังไม่มีรางวัล — เริ่มขายเพื่อสะสม',
    achievementMoreCount: '+{n} รางวัล',
    achievementAllEarned: 'คุณได้รับทุกรางวัลแล้ว',

    /* ── Command Center (มือถือ, < lg) ───────────────────────────────────── */
    heroReviews: 'รีวิว',
    heroNotifications: 'การแจ้งเตือน',
    heroTopUp: 'เติมเงิน',
    heroPackageLocked: 'ต่ออายุไม่สำเร็จ',
    /** {tier} = ชื่อแพ็กเกจ · {state} = ' ต่ออายุไม่สำเร็จ' หรือว่าง */
    heroPackageAria: 'แพ็กเกจร้านค้า {tier}{state} ไปที่หน้าแพ็กเกจ',

    salesCardTitle: 'ยอดขาย',
    salesCardRangeAria: 'ช่วงเวลา',
    chartConfirmed: 'ยืนยันแล้ว',
    chartUnconfirmed: 'รอยืนยัน',
    chartToday: 'วันนี้',
    chartAvg: 'เฉลี่ย {n}',
    compareAvgDays: 'จากค่าเฉลี่ย {n} วัน',
    compareLastMonth: 'จากเดือนก่อน',
    /** ป้ายเสียงของการ์ดยอดขายทั้งใบ — {range}/{amount}/{count}/{noun}/{confirmed}/{unconfirmed} */
    salesCardAria:
      'ยอดขาย{range} {amount} บาท จาก {count} {noun} ยืนยันแล้ว {confirmed} บาท รอยืนยัน {unconfirmed} บาท กดเพื่อดูรายงานฉบับเต็ม',

    shortcutsTitle: 'เมนูลัด',
    shortcutsEmptyTitle: 'ยังไม่มีเมนูลัด',
    shortcutsEmptyDesc: 'เลือกเมนูที่ใช้บ่อยมาไว้ตรงนี้ เพื่อกดถึงได้ในคลิกเดียว',
    shortcutsSetup: 'ตั้งเมนูลัด',

    navMenuAria: 'เมนูหลัก',
    navHome: 'หน้าหลัก',
    navCreate: 'สร้าง',
    navChat: 'แชท',
    navShop: 'ร้านค้า',
    navCreateOpen: 'เปิดเมนูสร้าง',
    navCreateClose: 'ปิดเมนูสร้าง',
    navCreateCategory: 'สร้างหมวดหมู่',
    navCreateProduct: 'สร้างสินค้า',
    /** {n} = จำนวน — ป้ายเสียงของช่องออเดอร์/แชทบน bottom nav */
    navPendingAria: '{n} รายการรอดำเนินการ',
    navUnreadAria: '{n} ข้อความยังไม่อ่าน',

    checklistTitle: 'ตั้งค่าร้านค้าให้ครบ',
    checklistLoading: 'กำลังโหลด checklist',
    /** ป้ายรายข้อ — ประกอบที่ `GET /api/account/onboarding-checklist` ฝั่งเซิร์ฟเวอร์ */
    checklistSlug: 'URL ร้าน',
    checklistSalesChannels: 'ช่องทางการขาย',
    checklistCategories: 'หมวดหมู่',
    checklistAddress: 'ที่อยู่',
    checklistMapPin: 'ปักพิกัด',
    checklistFirstProduct: 'สร้างสินค้าแรก',
  },

  /**
   * แท็บ "ความคิดเห็น" ในกล่องแชท (`/inbox/comments`, feature 00029/00038)
   *
   * เป็นก้อนสุดท้ายของ feature 00047 ที่ยังไม่เคยมี `useT()` เลยสักบรรทัด — ผู้ใช้ที่ตั้งภาษา
   * อังกฤษจึงเห็นทั้งหน้าเป็นไทยขณะที่ส่วนอื่นของกล่องแชทแปลไปแล้ว (user เจอเองบน prod 2026-08-15)
   *
   * คำที่ใช้ร่วมกับที่อื่นแล้วไม่ mint ใหม่: `common.close/cancel/loading/edit` และ `inbox.filters`
   */
  comments: {
    metaTitle: 'ความคิดเห็น',
    noShopTitle: 'ไม่พบร้านที่กำลังใช้งาน',
    noShopMessage: 'ลองสลับร้านอีกครั้ง หรือรีเฟรชหน้านี้',
    loadErrorTitle: 'โหลดความคิดเห็นไม่สำเร็จ',
    loadErrorDesc: 'ลองรีเฟรชหน้านี้อีกครั้ง',
    loadingComments: 'กำลังโหลดความคิดเห็น...',

    /* ── แผงตัวกรอง ─────────────────────────────────────────────────────── */
    shopComments: 'คอมเมนต์ของร้าน',
    pageLabel: 'เพจ',
    allPages: 'ทุกเพจ',
    clearFilters: 'ล้างตัวกรอง',
    applyFilters: 'ใช้ตัวกรอง',
    channelFilterAria: 'ตัวกรองช่องทาง',
    filterChannelAria: 'กรองเฉพาะช่องทาง {name}',
    selectedPage: 'เพจที่เลือก',
    clearPageFilter: 'ล้างตัวกรองเพจ',
    statusFilterAria: 'สถานะการตอบ',
    all: 'ทั้งหมด',
    unanswered: 'ยังไม่ตอบ',
    unansweredN: 'ยังไม่ตอบ {n}',
    // แท็บ/ตัวกรอง "หมดอายุ" (user สั่ง 2026-08-19) = ยังไม่ตอบ ∧ พ้นหน้าต่างทักแชท 7 วัน
    // — คนละคำกับ windowExpired ('หมดเวลาทักแชท') ที่เป็นป้ายบนคอมเมนต์รายใบโดยตั้งใจ
    expired: 'หมดอายุ',
    expiredHint: 'ยังไม่ตอบ และพ้น 7 วันแล้ว — ทักแชทส่วนตัวไม่ได้ ตอบใต้คอมเมนต์ได้',

    /* ── หน้าต่างทักแชทส่วนตัว (7 วันของ Facebook) ────────────────────────── */
    windowExpired: 'หมดเวลาทักแชท',
    windowRemaining: 'คงเหลือ {remaining}',
    windowLeftShort: 'ทักแชทได้อีก {remaining}',
    unitDay: '{n} วัน',
    unitHour: '{n} ชั่วโมง',
    unitMinute: '{n} นาที',

    prTitleWithName: 'ทักแชทถึง {name}',
    prTitle: 'ทักแชทส่วนตัว',
    prScopeWithName: 'ข้อความนี้เห็นเฉพาะ {name} เป็นการส่วนตัว',
    prScope: 'ข้อความนี้เห็นเฉพาะคนที่คอมเมนต์ เป็นการส่วนตัว',
    prOnceOnly: 'ส่งได้ครั้งเดียว กดพลาดแล้วแก้ไม่ได้',
    prWindowNote: '{scope} ทักได้ภายใน 7 วันนับจากเวลาคอมเมนต์ และคุยต่อได้เมื่อเขาตอบกลับเข้ามา',
    prMessageLabel: 'ข้อความ',
    prPlaceholder: 'พิมพ์ข้อความส่วนตัว...',
    prTooLong: 'ยาวเกิน {n} ตัวอักษร กรุณาตัดให้สั้นลงก่อนส่ง',
    prSend: 'ส่งข้อความ',
    sending: 'กำลังส่ง...',

    /* ── toast / ข้อความผิดพลาด ─────────────────────────────────────────── */
    loadFailed: 'โหลดความคิดเห็นไม่สำเร็จ',
    loadFailedNetwork: 'โหลดความคิดเห็นไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่',
    uploadFailed: 'อัปโหลดรูปไม่สำเร็จ',
    replyFailed: 'ตอบความคิดเห็นไม่สำเร็จ',
    commentFailed: 'คอมเมนต์ไม่สำเร็จ',
    replySuccess: 'ตอบความคิดเห็นแล้ว',
    commentSuccess: 'คอมเมนต์แล้ว',
    replyFailedNetwork: 'ตอบความคิดเห็นไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่',
    errWindowExpired: 'เกิน 7 วันแล้ว ทักแชทไม่ได้อีก',
    errChannelNotActive: 'เพจนี้เชื่อมต่อไม่อยู่แล้ว ต้องเชื่อมต่อใหม่ก่อน',
    errUpstream: 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง',
    errValidation: 'พิมพ์ข้อความก่อนส่ง',
    prSentSuccess: 'ส่งข้อความสำเร็จ — เกิดห้องแชทใหม่แล้ว',
    prAlreadySent: 'คอมเมนต์นี้ถูกทักไปแล้ว',

    /* ── #10900 "เพจทักไปแล้วจากที่อื่น" (ส่วนขยาย 2026-08-19 FR-CR-16) ────────── */
    // 🛑 ห้ามมีคำว่า "ลองใหม่" — Meta ปฏิเสธถาวร กดกี่ครั้งก็ได้ผลเดิม (§8 ของ
    // EXTENSIONS-2026-08-19-resolve-comment.md)
    prAlreadyRepliedTitle: 'เพจนี้เคยทักแชทคนนี้ไปแล้ว',
    prAlreadyRepliedTextWithConv: 'มีคนทักแชทคอมเมนต์นี้ไปแล้วจาก Facebook โดยตรง\nระบบทำเครื่องหมายว่าจัดการแล้วให้',
    prAlreadyRepliedGoToChat: 'ไปที่ห้องแชท',
    prAlreadyRepliedTextNoConv:
      'มีคนทักแชทคอมเมนต์นี้ไปแล้วจาก Facebook โดยตรง\nตอบใต้คอมเมนต์แบบสาธารณะแทนได้',
    prAlreadyRepliedUnderstood: 'เข้าใจแล้ว',

    /* ── "ทำเครื่องหมายว่าจัดการแล้ว" (ส่วนขยาย 2026-08-19 FR-CR-15/17) ────────── */
    // markDone/markDoneTile ใช้ทั้งเป็นคำกริยา (เมนู/ปุ่ม/toast) และเป็นป้ายสถานะ (badge
    // resolvedReason ไม่ว่าเหตุผลไหน — หัวหน้าสั่ง 2026-08-19 ให้ชิปเดียวกันทั้งสองเหตุผล
    // "คำมั่นแปลก ก็แค่จัดการแล้ว ก็พอ" — ข้อความเดียวกัน ไม่แยกคีย์ซ้ำ (HR16)
    markDone: 'ทำเครื่องหมายว่าจัดการแล้ว',
    markDoneTile: 'จัดการแล้ว',
    markDoneUnavailable: 'คอมเมนต์นี้ตอบไปแล้ว ไม่ต้องทำเครื่องหมาย',
    unmarkDone: 'เลิกทำเครื่องหมาย',
    unmarkDoneToast: 'เลิกทำเครื่องหมายแล้ว',
    resolveActionFailed: 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง',
    commentMenuAria: 'ตัวเลือกของความคิดเห็น',

    /* ── ช่องเขียนคำตอบ ─────────────────────────────────────────────────── */
    replyingTo: 'ตอบ {name}',
    fbUser: 'ผู้ใช้ Facebook',
    pageFallback: 'เพจ',
    cancelReply: 'ยกเลิกการตอบ',
    removeImage: 'เอารูปออก',
    ariaReplyPublic: 'พิมพ์คำตอบสาธารณะ',
    ariaCommentAsPage: 'เขียนความคิดเห็นในนามเพจ',
    placeholderReply: 'พิมพ์คำตอบ...',
    placeholderComment: 'แสดงความคิดเห็นในนาม {page}...',
    pickEmoji: 'เลือกอิโมจิ',
    attachImage: 'แนบรูปในคำตอบ',
    sendReply: 'ส่งคำตอบ',
    sendComment: 'ส่งความคิดเห็น',
    publicWarning: 'คอมเมนต์นี้เป็นสาธารณะ — ห้ามพิมพ์เบอร์โทรหรือที่อยู่ลูกค้า',

    /* ── รายการโพสต์ / รายการคอมเมนต์ ───────────────────────────────────── */
    emptyFilteredTitle: 'ไม่พบความคิดเห็นตามตัวกรอง',
    emptyFilteredDesc: 'ลองเปลี่ยนช่องทาง/เพจ/สถานะ หรือล้างตัวกรองเพื่อดูทั้งหมด',
    emptyTitle: 'ยังไม่มีความคิดเห็น',
    emptyDesc: 'เมื่อมีคนคอมเมนต์ใต้โพสต์ของเพจ จะแสดงที่นี่',
    emptyInPost: 'ยังไม่มีความคิดเห็นในโพสต์นี้',
    postNoText: 'โพสต์ไม่มีข้อความ',
    commentCountN: '{n} ความคิดเห็น',
    reactionsN: '{n} รีแอ็กชัน',
    sharesN: 'แชร์ {n}',
    botAnswered: 'บอทตอบแล้ว',
    loadMore: 'โหลดโพสต์เก่ากว่านี้',
    backToPosts: 'กลับไปรายการโพสต์',
    commentListTitle: 'รายการความคิดเห็น',
    selectCommentTitle: 'เลือกความคิดเห็น',
    selectCommentDesc: 'เลือกโพสต์ทางซ้ายมือเพื่อเริ่มอ่านและตอบความคิดเห็น',
    openOnFacebook: 'เปิดโพสต์นี้บน Facebook',
    openPostOnFacebook: 'เปิดโพสต์บน Facebook',
    postVideo: 'วิดีโอของโพสต์',
    playVideo: 'เล่นวิดีโอ',
    seeMore: 'ดูเพิ่มเติม',
    collapse: 'ย่อลง',
    resizeAria: 'ปรับความสูงของรายการความคิดเห็น',
    sortRelevant: 'เกี่ยวข้องที่สุด',
    sortNewest: 'ใหม่สุด',

    /* ── คอมเมนต์รายอัน ─────────────────────────────────────────────────── */
    autoReply: 'ตอบอัตโนมัติ',
    pageAdmin: 'ผู้ดูแลเพจ',
    deleted: 'ความคิดเห็นถูกลบ',
    noText: '(ไม่มีข้อความ)',
    attachmentAlt: 'รูปแนบจาก {name}',
    edited: 'แก้ไขแล้ว',
    answered: 'ตอบแล้ว',
    reply: 'ตอบ',
    privateReply: 'ทักแชท',
    privateReplyTitle: 'ทักแชทส่วนตัวได้ภายใน 7 วันนับจากเวลาคอมเมนต์ ({time})',
    privateReplySentTitle: 'ทักแชทส่วนตัวไปแล้วเมื่อ {time}',
    privateReplySent: 'ทักแล้ว · {time}',
    openChat: 'เปิดห้องแชท',
    windowExpiredTitle:
      'Facebook ให้ทักแชทส่วนตัวจากคอมเมนต์ได้ภายใน 7 วันเท่านั้น — ตอบสาธารณะใต้คอมเมนต์ยังทำได้ตลอด',
  },

  /**
   * หน้า "ช่องทางการขาย" (`/settings/channels`) และหน้าเลือกเพจ
   * เป็นเส้นทางที่ Meta App Reviewer ต้องเดินผ่านในคลิป A และ B ทั้งคู่
   *
   * ข้อความที่มี `{n}` ต้องเรียกผ่าน `fmt()` — ห้ามต่อสตริงในโค้ด เพราะลำดับคำของสองภาษา
   * ไม่ตรงกัน ("เชื่อมต่อสำเร็จ {n} ช่องทาง" vs "Connected {n} channels")
   */
  channels: {
    pageTitle: 'ช่องทางแชท',
    breadcrumbSettings: 'ตั้งค่า',
    intro: 'เชื่อม Facebook Page เพื่อรับข้อความ Messenger และ Instagram เข้ามาที่ Deep โดยตรง',
    resync: 'ซิงก์การแจ้งเตือน',
    connectPage: 'เชื่อม Facebook Page',
    emptyTitle: 'ยังไม่ได้เชื่อมช่องทางแชท',
    connected: 'เชื่อมแล้ว',
    tokenExpired: 'โทเคนหมดอายุ',
    reconnect: 'เชื่อมต่อใหม่',
    disconnect: 'ถอด',
    tokenExpiredBanner: 'มี {n} ช่องทางที่โทเคนหมดอายุ ต้องเชื่อมต่อใหม่',

    disconnectTitle: 'ยกเลิกการเชื่อมต่อ {name}?',
    disconnectText: 'ข้อความเก่ายังอยู่ แต่จะไม่ได้รับข้อความใหม่จากเพจนี้อีก',
    disconnectConfirm: 'ยกเลิกการเชื่อมต่อ',
    disconnectCancel: 'ปิด',
    disconnectSuccess: 'ถอดการเชื่อมต่อ {provider} สำเร็จ',
    disconnectError: 'ถอดการเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่',

    connectSuccess: 'เชื่อมต่อสำเร็จ {n} ช่องทาง',
    connectSuccessMoved: 'เชื่อมต่อสำเร็จ {n} ช่องทาง (ย้ายมา {moved} เพจ)',
    connectNoNew: 'ไม่มีเพจใหม่ที่เชื่อมเพิ่ม',
    connectSubscribeFailed: 'บางเพจยังไม่ได้รับการแจ้งเตือน: {n} — ลองกด "ซิงก์การแจ้งเตือน"',

    resyncError: 'ซิงก์ไม่สำเร็จ กรุณาลองใหม่',
    resyncPartial: 'ซิงก์สำเร็จ {ok} เพจ · ไม่สำเร็จ {failed} เพจ (ลองเชื่อมเพจนั้นใหม่)',
    resyncSuccess: 'ซิงก์การแจ้งเตือนสำเร็จ {ok} เพจ',
    resyncSuccessShops: 'ซิงก์การแจ้งเตือนสำเร็จ {ok} เพจ จาก {shops} ร้าน',

    /** ข้อความผิดพลาดที่ callback ของ Facebook ส่งกลับมาทาง query string */
    errCancelled: 'ยกเลิกการเชื่อมต่อแล้ว',
    errStateMismatch: 'เซสชันหมดอายุ กรุณาลองใหม่',
    errNoShop: 'ไม่พบร้านค้าของคุณ',
    errNoEligiblePage: 'ไม่พบเพจที่คุณมีสิทธิ์จัดการข้อความ',
    errGeneric: 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่',

    selectPageTitle: 'เลือกเพจที่จะเชื่อม',
    selectBreadcrumb: 'เลือกเพจ',

    selectIntro: 'เลือกเพจที่จะเชื่อมเข้า',
    selectIntroThisShop: 'ร้านนี้',
    selectIntroTail: '— เฉพาะเพจที่เลือกเท่านั้นที่จะรับข้อความเข้ามาที่ Deep',
    selectAll: 'เลือกทั้งหมด',
    selectClear: 'ล้างที่เลือก',
    selectedCount: 'เลือกแล้ว {n} เพจ',
    selectConfirm: 'เชื่อมเพจที่เลือก',
    selectConfirming: 'กำลังเชื่อม',
    selectCancel: 'ยกเลิก',
    selectNoneChosen: 'กรุณาเลือกอย่างน้อย 1 เพจ',

    pageHasInstagram: 'มี Instagram',
    pageHasInstagramTitle: 'เพจนี้มี Instagram ผูกอยู่',
    pageAlreadyHere: 'เชื่อมกับร้านนี้อยู่แล้ว',
    pageInOtherShopNamed: 'เชื่อมกับร้าน {shop}',
    pageInOtherShop: 'เชื่อมกับร้านอื่น',

    moveOneTitle: 'ย้ายเพจนี้มาที่ร้านนี้?',
    moveManyTitle: 'ย้าย {n} เพจมาที่ร้านนี้?',
    moveBody: 'เพจต่อไปนี้เชื่อมอยู่กับร้านอื่น การเชื่อมที่ร้านเดิมจะถูกตัด (ข้อความเก่ายังอยู่ครบ):',
    moveShopSuffix: 'ร้าน {shop}',
    moveConfirm: 'ย้ายมาที่นี่',

    selectExpiredTitle: 'เซสชันหมดอายุ',
    selectExpiredDesc: 'ลิงก์เลือกเพจหมดอายุแล้ว กรุณาเริ่มเชื่อม Facebook Page ใหม่อีกครั้ง',
    selectExpiredAction: 'เริ่มเชื่อมใหม่',
    selectLoadErrorTitle: 'โหลดรายการเพจไม่สำเร็จ',
    selectLoadErrorDesc: 'เกิดข้อผิดพลาดในการดึงเพจจาก Facebook กรุณาลองใหม่อีกครั้ง',
    selectLoadErrorAction: 'ลองใหม่',
    selectEmptyTitle: 'ไม่พบเพจที่มีสิทธิ์จัดการข้อความ',
    /**
     * การ์ด "LINE Official Account" — เฉพาะสถานะยังไม่เชื่อม (คำอธิบาย + ปุ่ม)
     * ตัว wizard ข้างในยังเป็นไทยทั้งก้อน (หนี้ที่บันทึกไว้) — reviewer ไม่ได้เดินผ่าน
     */
    lineIntro: 'เชื่อม LINE OA ของร้านเพื่อรับและตอบข้อความ LINE จากอินบ็อกซ์เดียวกับช่องทางอื่น',
    lineConnect: 'เชื่อม LINE OA',
    selectEmptyDesc: 'บัญชี Facebook ของคุณต้องเป็นแอดมินของเพจ และเปิดสิทธิ์จัดการข้อความ (Messaging)',
  },

  /**
   * กล่องข้อความ (`/inbox`) — ฉากปิดของทั้งคลิป A และ B ที่ Meta reviewer ต้องเห็น
   * (เธรดเด้งเข้ามาสด ๆ แล้วผู้ขายพิมพ์ตอบ)
   *
   * แปลตามลำดับที่ reviewer เห็นจริงบนจอ — ข้อความยืนยัน/แจ้งเตือนที่ต้องกดหลายชั้นกว่าจะเจอ
   * ยังไม่แปลในรอบนี้ และคงเป็นภาษาไทยไว้ตามมติ D-I18N-1 (ไม่ต้องมีป้ายบอกผู้ใช้)
   */
  inbox: {
    tabMessages: 'ข้อความ',
    tabComments: 'ความคิดเห็น',
    unreadChats: 'ยังไม่อ่าน {n} แชท',
    unansweredComments: 'ยังไม่ตอบ {n} ความคิดเห็น',

    backToDashboard: 'กลับหน้าหลัก',
    soundOn: 'เปิดเสียงแจ้งเตือนข้อความใหม่',
    soundOff: 'ปิดเสียงแจ้งเตือนข้อความใหม่',

    searchPlaceholder: 'ค้นหาชื่อ ลูกค้า เบอร์ หรือข้อความในแชท',
    channelFilterLabel: 'ตัวกรองช่องทาง',
    channelAll: 'ทั้งหมด',

    /** แท็บย่อยสถานะเหนือรายการแชท + แผงตัวกรอง */
    filters: 'ตัวกรอง',
    statusResolved: 'ปิดงาน',
    statusSpam: 'สแปม',
    groups: 'กลุ่ม',

    /** จอว่างตรงกลางก่อนเลือกเธรด — ฉากแรกที่ reviewer เห็นเมื่อเปิดกล่องข้อความ */
    emptyTitle: 'เลือกข้อความ',
    emptyDesc: 'เลือกรายการแชททางซ้ายมือเพื่อเริ่มอ่านและตอบข้อความ',

    /** ห้องแชท — จังหวะที่ reviewer พิมพ์ตอบในคลิป */
    composerPlaceholder: 'พิมพ์ข้อความ หรือวางไฟล์ที่นี่...',
    composerCaptionPlaceholder: 'เพิ่มคำบรรยาย (ไม่บังคับ)',
    composerDisabled: 'ส่งข้อความไม่ได้ในตอนนี้',
    composerQuotaExhausted: 'โควตาข้อความหมดแล้ว ส่งไม่ได้ตอนนี้',
    send: 'ส่ง',
    sendWithNote: 'ส่ง — {note}',
    /**
     * แบนเนอร์หน้าต่างตอบกลับใกล้หมด — อยู่หัวเธรด ตัวใหญ่สีส้ม เห็นตลอดเวลาที่เปิดห้องแชท
     * (จุดที่ Meta App Reviewer เห็นแน่นอนตอนดูคลิป C)
     */
    windowClosingSoon: 'ใกล้หมดเวลาตอบ — เหลือ {remaining}',
    /** นับถอยหลังละเอียดถึงวินาที — ตัดชั่วโมงทิ้งเมื่อเป็น 0 ให้อ่านง่าย (จึงมี 2 รูป) */
    countdownHms: '{h} ชั่วโมง {m} นาที {s} วินาที',
    countdownMs: '{m} นาที {s} วินาที',
    /** ป้ายบนกล่องอ้างอิงข้อความที่กำลังตอบ — {name} = ชื่อผู้ส่ง หรือคำว่า "ข้อความของร้าน" */
    quotedReplyTo: 'ตอบกลับ{name}',
    quotedShopMessage: 'ข้อความของร้าน',
    /** คิวไฟล์แนบเหนือช่องพิมพ์ (2026-08-14) — ย้ายออกจากสตริงดิบใน ChatThread */
    attachUploading: 'กำลังอัปโหลด {done}/{total}',
    attachRemove: 'เอา {name} ออก',
    backToList: 'กลับรายการ',
    customerInfo: 'ข้อมูลลูกค้า',
    threadSoundTitle: 'เสียงแจ้งเตือนข้อความใหม่',
    threadChipCollapse: 'ย่อ',
    threadSoundAllApp: 'ทั้งแอป (ทุกแชท)',
    threadSoundThisChat: 'เฉพาะแชทนี้',
    threadSoundMutedHint: 'ปิดอยู่เพราะปิดเสียงทั้งแอป — เปิดสวิตช์ด้านบนก่อน',
    threadMoreMenu: 'ตัวเลือกเพิ่มเติม',
    libraryOpen: 'คลังไฟล์',

    /** ใช้ร่วมกัน 2 ที่: หัวข้อในแผงตัวกรอง และป้ายฟิลด์ในแผงข้อมูลลูกค้า — ของเดียวกัน */
    tagsLabel: 'แท็ก',
    /** ปุ่มในดรอปดาวน์ "กลุ่ม" ของรายการแชท (คีย์ `groups` คือชื่อปุ่มดรอปดาวน์เอง) */
    createGroup: 'สร้างกลุ่มใหม่',

    /**
     * แผงตัวกรองของกล่องข้อความ — popover ที่เปิดจากปุ่ม `filters` บนแถบเครื่องมือ
     * 🛑 ค่าตัวเลือกทั้ง 3 ชุดเคยเป็นค่าคงที่ระดับ module จึงค้างเป็นไทยตลอดไป ต้องย้ายเข้า component
     */
    filterPanel: {
      unread: 'ยังไม่อ่าน',
      read: 'อ่านแล้ว',
      linked: 'ผูกลูกค้าแล้ว',
      unlinked: 'ยังไม่ผูกลูกค้า',
      shipmentNone: 'ยังไม่สร้างพัสดุ',
      shipmentUnprinted: 'สร้างแล้ว ยังไม่พิมพ์',
      shipmentPrinted: 'พิมพ์แล้ว',
      shipmentProblem: 'พัสดุมีปัญหา',
      sectionChannel: 'ช่องทาง',
      /** คนละคำกับ `channelAll` ('ทั้งหมด') โดยตั้งใจ — อันนี้เป็นชิปเลือก "ทุกเพจ" */
      allChannels: 'ทุกช่องทาง',
      tagsHint: 'เลือกได้หลายอัน (ติดอันใดก็ได้)',
      sectionShipment: 'พัสดุ (iShip)',
      sectionRead: 'การอ่าน',
      sectionOther: 'อื่น ๆ',
      hiddenLabel: 'ที่ซ่อนไว้',
      clear: 'ล้างตัวกรอง',
      apply: 'ใช้ตัวกรอง',
    },

    /**
     * แผงขวาในห้องแชท — กระจายอยู่ 4 ไฟล์ (`CustomerPanel`, `CustomerCrmSection`,
     * `CustomerPanelSheet` ของมือถือ และ `src/lib/customer-behavior.ts` ที่เป็นฟังก์ชันบริสุทธิ์)
     *
     * 🛑 คำนามของ "ออเดอร์" ไม่มีคีย์ของตัวเองที่นี่ — ผันตาม `Shop.vertical` โดยดึงจาก
     * `menu.orders[vertical]` / `menu.bookings` ที่มีอยู่แล้ว (ค่าตรงกันทุกตัวอักษรกับ ORDER_VOCAB)
     */
    customerPanel: {
      tabNote: 'โน้ต',
      /**
       * 🛑 คำบนแถบแท็บต้องสั้นกว่าหัวข้อเต็ม — แผงกว้าง 384px มี 4 แท็บ ถ้าใช้คำเต็ม
       * ("ข้อมูลลูกค้า"/"คลังไฟล์") แถบจะตกบรรทัด (user เจอเองบน prod 2026-08-14)
       * ห้ามเอาไปใช้เป็นหัวข้อ/aria-label ที่อื่น — ที่นั่นใช้ `customerInfo`/`librarySectionTitle` คำเต็ม
       */
      tabCustomer: 'ข้อมูล',
      tabFiles: 'ไฟล์',
      statOrderCount: 'จำนวนออเดอร์',
      statTotalSpent: 'รวมยอดซื้อ',
      statCustomerSince: 'เป็นลูกค้ามา',
      linkStatusTitle: 'การเชื่อมกับลูกค้าในระบบ',
      /** คีย์ของตัวเอง ไม่ reuse `channels.connected` — คนละความหมาย (ผูกลูกค้า vs เชื่อมเพจ) */
      linked: 'เชื่อมแล้ว',
      notLinked: 'ยังไม่เชื่อม — จะเชื่อมอัตโนมัติเมื่อสร้าง{noun}ด้วยเบอร์ของลูกค้ารายนี้',
      adBadgeLabel: 'ป้ายกำกับจาก Meta',

      /** แท็บ "คำสั่งซื้อ" — `{noun}` ผันตาม vertical เช่นเดียวกับ `notLinked` */
      listHeading: 'รายการ{noun}',
      createCta: 'สร้าง{noun}',
      noHistory: 'ยังไม่มีประวัติ{noun}',
      notLinkedNoHistory:
        'ยังไม่เชื่อมกับลูกค้าในระบบ จึงยังไม่มีประวัติให้ดู — สร้าง{noun}ด้วยเบอร์ของลูกค้ารายนี้แล้วระบบจะเชื่อมให้เอง',

      aliasLabel: 'ชื่อในแชท',
      realNameLabel: 'ชื่อจริง',
      salesStatusLabel: 'สถานะการขาย',
      salesStatusUnspecified: 'ยังไม่ระบุ',
      salesStatusInterested: 'สนใจ',
      salesStatusNotInterested: 'ไม่สนใจ',
      phoneLabel: 'เบอร์โทร',
      addressLabel: 'ที่อยู่',
      externalOnlyNotice: 'แท็ก/สถานะการขาย ใช้ได้เฉพาะแชทช่องทางภายนอก (Messenger/Instagram)',
      crmLoading: 'กำลังโหลดข้อมูลลูกค้า',
      crmLoadError: 'โหลดข้อมูลลูกค้าไม่สำเร็จ',

      /** ป้ายพฤติกรรมลูกค้าเหนือแท็บ — โผล่เองไม่ต้องกด และโผล่ในรายการแชทกับหน้า /orders ด้วย */
      badgeNew: 'ลูกค้าใหม่',
      badgeRegular: 'ลูกค้าเก่า · {count} {noun}',
      badgeReturned: 'ตีกลับ {count} รายการ',
      badgeCancelled: 'ยกเลิก {count} รายการ',
      badgeCancelledDetail: 'ยกเลิก {count} รายการ (ลูกค้าขอเอง {byBuyer})',
    },

    /**
     * แถบ "ที่มาของแชท" ใต้หัวเธรด (ThreadContextBar + บล็อก contextItems ใน ChatThread)
     *
     * อยู่ใต้ `inbox` ไม่ใช่ namespace ของตัวเอง เพราะเป็นส่วนหนึ่งของหน้ากล่องข้อความ
     * และทั้งสองไฟล์อยู่ในเส้นทางเดียวกับคีย์ `composer*`/`send` ที่แปลไปแล้ว
     *
     * 🛑 เป็นฉากที่ Meta reviewer ต้องเห็นในคลิป C — คำอธิบาย permission
     * `pages_read_engagement` อ้างแบนเนอร์นี้ไว้ตรง ๆ ว่าเราอ่านโพสต์/โฆษณาต้นทางมาแสดง
     */
    contextBar: {
      /** บรรทัดยุบของแถวชื่อร้าน — ประโยคสมบูรณ์ในตัวเอง ไม่มีคำนำประเภท */
      shopReplyingShort: 'ตอบในนามร้าน {shop}',
      /** ตัวกาง — ต่อด้วยชื่อร้านตัวหนาแยกใน JSX จึงไม่ใช่ placeholder */
      shopReplyingPrefix: 'กำลังตอบในนามร้าน',

      commentLabel: 'จากคอมเมนต์',
      commentPostEmpty: 'โพสต์ไม่มีข้อความ',
      commentTextEmpty: 'คอมเมนต์ไม่มีข้อความ',
      commentImageOnly: 'ส่งรูปมาในคอมเมนต์',
      viewComment: 'ดูคอมเมนต์',

      adLabel: 'จากโฆษณา',
      adIdFallback: 'รหัสโฆษณา {adId}',
      adBannerTitle: 'แชทนี้ตอบกลับจากโฆษณาของคุณ',
      viewAd: 'ดูโฆษณา',
      /** ใช้ทั้ง title= และ aria-label= ของปุ่ม ✕ (คู่กันเสมอ — มือถือไม่มี hover) */
      dismissAdSource: 'ปิดป้ายที่มาของโฆษณา',

      collapse: 'ย่อที่มาของแชท',
      expandMultiple: 'ดูที่มาของแชททั้ง {n} รายการ',
      expandSingle: 'ดูรายละเอียดที่มาของแชท',
    },

    /**
     * คลังไฟล์ต่อลูกค้า (feature 00048) — section ท้ายแท็บ "ข้อมูลลูกค้า" + โมดัล + แถบใน Lightbox
     *
     * 🛑 ห้ามใช้คำว่า "บันทึก" กับการเก็บเข้าคลัง — ในเธรดเดียวกันมี "บันทึกวิดีโอ"/"บันทึกรูป"
     * ที่แปลว่าโหลดลงเครื่องอยู่แล้ว (มีเทส [blocker] กันไว้). `librarySave` ในภาษาอังกฤษจึงเป็น
     * "Save to library" ได้ เพราะฝั่ง EN ปุ่มโหลดลงเครื่องคือ "Download" ไม่ชนกัน
     */
    librarySave: 'เก็บเข้าคลัง',
    libraryUnsave: 'เอาออกจากคลัง',
    librarySectionTitle: 'คลังไฟล์',
    librarySavedToast: 'เก็บเข้าคลังแล้ว',
    libraryRemovedToast: 'เอาออกจากคลังแล้ว',
    librarySaveFailed: 'เก็บเข้าคลังไม่สำเร็จ ลองใหม่อีกครั้ง',
    libraryRemoveFailed: 'เอาออกจากคลังไม่สำเร็จ ลองใหม่อีกครั้ง',
    libraryLoadFailed: 'โหลดคลังไฟล์ไม่สำเร็จ',
    libraryRetry: 'ลองใหม่',
    libraryLoading: 'กำลังโหลด...',
    libraryEmptyTitle: 'ยังไม่มีไฟล์ในคลัง',
    /** ต้องครอบทั้งสองท่า — "กดค้าง" ไม่มีอยู่จริงบนเดสก์ท็อป (useLongPress รับ touch เท่านั้น) */
    libraryEmptyBody: 'ที่รูป วิดีโอ หรือไฟล์ในแชท เลือก "เก็บเข้าคลัง" — บนมือถือกดค้างที่ข้อความ บนคอมเลื่อนเมาส์ไปที่ข้อความ',
    libraryMissingFile: 'ไฟล์ถูกลบแล้ว',
    libraryOpenFile: 'เปิดไฟล์',
    libraryDownload: 'ดาวน์โหลด',
    libraryEdit: 'แก้ไข',
    librarySeeInChat: 'ดูในแชท',
    libraryEditTitle: 'แก้ไขไฟล์',
    libraryEditNameLabel: 'ชื่อไฟล์',
    libraryEditNoteLabel: 'โน้ต',
    libraryEditNotePlaceholder: 'จดไว้ว่าทำไมถึงเก็บไฟล์นี้...',
    /** คำว่า "บันทึก" ใช้ได้เฉพาะปุ่มยืนยันฟอร์มนี้ — คนละบริบทกับ download/เก็บเข้าคลัง */
    libraryEditSubmit: 'บันทึก',
    libraryEditSaved: 'บันทึกแล้ว',
    libraryCancel: 'ยกเลิก',
    librarySeeAll: 'ดูไฟล์ทั้งหมด ({n})',
    libraryModalTitle: 'คลังไฟล์ · {name}',
    libraryFileFallbackName: 'ไฟล์แนบ',
    /** ชื่อผู้ส่ง/ผู้เก็บที่ระบบไม่รู้ — ผูกกับ "ฝั่ง" ไม่ใช่คำว่า "ไม่ทราบ" */
    librarySenderBuyer: 'ลูกค้า',
    librarySenderShop: 'ร้าน',
    librarySavedByFallback: 'ทีมร้าน',
    /** aria-label ของช่องในกริด — ผันตามชนิดไฟล์จริง ห้าม hardcode "รูปจาก" ให้ทุกชนิด */
    libraryAriaImage: 'รูปจาก {who} · {when}',
    libraryAriaVideo: 'วิดีโอจาก {who} · {when}',
    libraryAriaFile: '{name} จาก {who} · {when}',
    librarySentBy: 'ส่งโดย {who} · {when}',
    librarySavedBy: 'เก็บโดย {who} · {when}',
  },

  /**
   * แผงสลับบัญชี/ร้าน — มุมขวาบนของทุกหน้าฝั่งผู้ขาย (`UserDropdownDetailed`), ชีตมือถือ
   * (`AccountSwitcherSheet` ที่ `<1024px`), ตัวสลับในห้องแชท (`ChatShopSwitcher`),
   * จอทับตอนกำลังสลับ (`ShopSwitchOverlay`) และ toast/confirm ของ hook ที่ปุ่มพวกนี้เรียก
   *
   * 🛑 namespace เดียวกันทั้งชุดโดยตั้งใจ — คำว่า "เจ้าของ/ผู้ดูแล/ส่วนตัว" ผูกกับค่าจริงในระบบ
   * (`ShopMember.role` = OWNER/ADMIN · `Shop.kind` = PERSONAL/BUSINESS) ถ้าแยกคีย์ตามหน้าจอ
   * จะได้คำแปลไม่ตรงกันสองจอโดยไม่มีอะไรฟ้อง (Hard Rule 16)
   *
   * Meta App Reviewer ต้องกดแผงนี้จริงถ้าเพจอยู่คนละร้านกับที่ล็อกอินมาเจอ และป้ายบทบาท
   * มุมขวาบนติดอยู่ทุกเฟรมของทั้ง 3 คลิปแม้ไม่กดเปิดแผงเลย
   */
  accountSwitcher: {
    roleOwner: 'เจ้าของ',
    roleAdmin: 'ผู้ดูแล',
    /** ใช้ทั้งป้ายบทบาทของร้านส่วนตัว และ badge ท้ายแถวในรายการ — คำเดียวความหมายเดียว */
    rolePersonal: 'ส่วนตัว',

    allAccounts: 'บัญชีทั้งหมด',
    switchAccount: 'สลับบัญชี',
    /** ชื่อที่ใช้เมื่อ user ยังไม่ตั้งชื่อ — ร้านที่ไม่มีชื่อใช้ `menu.shop` ที่มีอยู่แล้ว */
    fallbackUser: 'ผู้ใช้',

    loadError: 'โหลดรายการบัญชีไม่สำเร็จ ลองโหลดหน้านี้ใหม่อีกครั้ง',
    lockedError: 'บัญชีนี้ถูกล็อกชั่วคราว — ไม่สามารถสลับเข้าใช้งานได้',
    noAccessError: 'ไม่มีสิทธิ์เข้าถึงบัญชีนี้แล้ว',
    switchError: 'สลับบัญชีไม่สำเร็จ กรุณาลองใหม่',

    createPersonalTitle: 'สร้างร้านส่วนตัวของฉัน',
    createPersonalDesc: 'ขายของในนามตัวเอง',
    /**
     * ชีตมือถือมีหางต่อท้ายมาแต่เดิม — ต้นฉบับไทยสองที่ไม่ตรงกันอยู่ก่อนแล้ว
     * เก็บเป็นคนละคีย์ ไม่รวบให้เหมือนกัน เพราะ BR-I18N-10 บังคับว่าคำแปลต้องตรงกับของเดิม
     * ทุกตัวอักษร (การรวบคำเป็นการเปลี่ยน copy ซึ่งเป็นคนละงานและต้องผ่าน ux ของมันเอง)
     */
    createPersonalDescOnce: 'ขายของในนามตัวเอง — สร้างได้ครั้งเดียว',
    createBusinessTitle: 'สร้างธุรกิจใหม่',
    createBusinessDesc: 'ขายในนามร้าน เพิ่มทีมงานช่วยดูแลได้',

    confirmCreateTitle: 'สร้างร้านส่วนตัวของคุณ?',
    confirmCreateBody:
      'ร้านนี้ผูกกับตัวคุณโดยตรงและสร้างได้ครั้งเดียว — พอยืนยันแล้วเราจะพาไปตั้งค่าร้านต่อทันที',
    confirmCreateYes: 'สร้างร้านเลย',
    confirmCreateNo: 'ยังไม่สร้างตอนนี้',
    createError: 'เปิดร้านไม่สำเร็จ กรุณาลองใหม่',
    creatingLabel: 'กำลังเปิดร้านส่วนตัวให้คุณ…',
    creatingSubLabel: 'อีกสักครู่จะพาไปตั้งค่าร้านต่อ',

    /** จอทับเต็มจอตอนกำลังสลับ — เด้งทันทีที่กด ถ้าไม่แปลจะเป็นไทยเต็มจอคั่นกลางทันที */
    switchingTo: 'กำลังสลับไปที่ร้าน "{name}"',
    switchingGeneric: 'กำลังสลับบัญชี…',
    switchingSubLabel: 'กรุณารอสักครู่ ระบบกำลังโหลดข้อมูลใหม่',
    switchingAriaLabel: 'กำลังสลับร้าน',

    personalInfo: 'ข้อมูลส่วนตัว',
    /** ลิงก์ออกไปหน้าร้านจริง — คนละคำกับ `publicProfile.pageTitle` โดยตั้งใจ (สั้นกว่า) */
    storefront: 'โปรไฟล์',

    /** ตัวสลับในห้องแชท (`ChatShopSwitcher`) — มีโหมดมุมมองเพิ่มมาจากตัวอื่น */
    inboxView: 'มุมมองกล่องข้อความ',
    viewAllShops: 'ร้านทั้งหมด',
    viewThisShop: 'ร้านนี้',
    viewChangeError: 'เปลี่ยนมุมมองไม่สำเร็จ ลองใหม่อีกครั้ง',
    switcherAriaUnified: 'สลับร้าน — ขณะนี้ดูข้อความรวมทุกร้าน',
    switcherAriaSingle: 'สลับร้าน — ขณะนี้ดูข้อความร้าน {name}',
  },

  /**
   * หน้า "โปรไฟล์สาธารณะ" (`/public-profile`) — ฉากที่สองของคลิป C
   *
   * ตัวเลือกคลิปในหน้านี้คือจังหวะที่ `GET /{page-id}/video_reels` ทำงานจริง ซึ่งเป็นสิ่งที่
   * `pages_read_engagement` ต้องพิสูจน์ให้ reviewer เห็น (APP-REVIEW.md §6.1 คลิป C ข้อ 2)
   *
   * ไม่รวมหน้าร้านสาธารณะ (`/u/[username]`, `/b/[slug]`) ซึ่งอยู่ `(marketing)` นอก
   * LocaleProvider และ cookie `deep_locale` เป็นของ host `seller.` เท่านั้น (locale-cookie.ts
   * จงใจไม่ตั้ง `domain=`) — ผู้ใช้ตัดสิน 2026-08-13 ว่ารอบนี้แปลเฉพาะฝั่งผู้ขาย
   */
  publicProfile: {
    /** ใช้ทั้ง <title> ของแท็บและหัวข้อ breadcrumb — ของเดิมใช้คำเดียวกันทั้งคู่ */
    pageTitle: 'โปรไฟล์สาธารณะ',
    breadcrumbOverview: 'ภาพรวม',
    builderCta: 'จัดหน้าร้าน',

    visibleCardTitle: 'หน้าร้านที่คนนอกเห็น',
    visibleCardBody:
      'ชื่อร้าน โลโก้ ภาพหน้าปก และหมวดหมู่ ตั้งค่าได้ที่หน้าตั้งค่าร้านค้า ส่วนหน้านี้ใช้เลือกว่าจะเอาอะไรไปโชว์เพิ่ม',
    shopSettingsCta: 'ตั้งค่าร้านค้า',

    linkCardTitle: 'ลิงก์หน้าร้านของคุณ',
    copy: 'คัดลอก',
    /**
     * ต้องส่งเข้า `CopyLinkButton` เป็น prop — ค่า default ใน component เป็นไทยตายตัว
     * ไม่ส่ง = ปุ่มเป็นอังกฤษแต่ toast เป็นไทย ซึ่ง reviewer เห็นทันทีตอนกดคัดลอก
     */
    copiedToast: 'คัดลอกลิงก์แล้ว',
    viewMyStorefront: 'ดูหน้าร้านของฉัน',
    noLinkYet: 'ร้านยังไม่มีชื่อผู้ใช้/ลิงก์สำหรับหน้าร้าน — ตั้งค่าได้ที่หน้าตั้งค่าร้านค้า',

    mobileBuilderNoticeTitle: 'จัดเรียงบล็อกบนหน้าร้าน ใช้บนคอมพิวเตอร์',
    mobileBuilderNoticeBody:
      'การสลับลำดับและเลือกเนื้อหาที่จะโชว์ ต้องใช้พื้นที่จอกว้าง เปิดหน้านี้บนคอมพิวเตอร์เมื่อสะดวก — การตั้งค่าอื่นบนหน้านี้ใช้บนมือถือได้ตามปกติ',

    /** การ์ดสวิตช์เผยแพร่ (PublishToggleClient) */
    visibility: {
      cardTitle: 'การมองเห็นหน้าร้าน',
      switchLabel: 'เผยแพร่หน้าร้านสาธารณะ',
      descriptionOn: 'ลูกค้าทั่วไปเปิดดูหน้าร้านของคุณได้ตามปกติ',
      descriptionOff:
        'ผู้เยี่ยมชมทั่วไปจะเห็นข้อความว่าหน้านี้ปิดการแสดงผลชั่วคราว — คุณยังเปิดดูหน้าร้านของตัวเองได้เสมอ',
      hiddenBanner: 'หน้าร้านนี้ปิดการแสดงผลอยู่ ผู้เยี่ยมชมทั่วไปจะมองไม่เห็น',
      confirmTitle: 'ปิดการแสดงผลหน้าร้าน?',
      confirmBody:
        'ผู้เยี่ยมชมทั่วไปจะมองไม่เห็นหน้าร้านของคุณ จนกว่าคุณจะเปิดอีกครั้ง — เปิดกลับมาได้ทุกเมื่อในหน้านี้',
      confirmButton: 'ปิดการแสดงผล',
      saveError: 'ไม่สามารถเปลี่ยนสถานะการเผยแพร่ได้',
      publishedToast: 'เผยแพร่หน้าร้านแล้ว',
      unpublishedToast: 'ปิดการแสดงผลหน้าร้านแล้ว',
    },

    /** ตัวเลือกคลิป/รีลที่จะขึ้นหน้าร้าน (ShopVideosClient) */
    videos: {
      cardTitle: 'คลิปที่แสดงบนหน้าร้าน',
      subtitle: 'เลือกได้สูงสุด {max} คลิป จะแสดงตามลำดับที่เลือก',
      loading: 'กำลังโหลดคลิปจากบัญชีที่เชื่อมไว้...',
      loadError: 'โหลดรายการคลิปไม่สำเร็จ',
      partialWarning: 'บางช่องทางดึงคลิปไม่สำเร็จ รายการที่เห็นอาจไม่ครบ',
      loadException: 'เกิดข้อผิดพลาดขณะโหลด',
      prunedWarning: 'มี {n} คลิปที่ไม่พบในบัญชีแล้ว (อาจถูกลบไป) จึงเอาออกจากรายการที่เลือกไว้',
      emptyTitle: 'ยังไม่มีคลิปให้เลือก',
      emptyDescription:
        'คลิปจะดึงมาจากเพจ Facebook และบัญชี Instagram ที่เชื่อมไว้กับร้าน หากยังไม่ได้เชื่อม ให้ไปเชื่อมที่หน้าช่องทางแชทก่อน',
      emptyAction: 'ไปหน้าช่องทางแชท',
      channelsTabLabel: 'ช่องทาง',
      maxReachedWarning: 'เลือกได้สูงสุด {max} คลิป',
      selectedCount: 'เลือกแล้ว {n} จาก {max}',
      saving: 'กำลังบันทึก...',
      saveSuccess: 'บันทึกคลิปที่จะแสดงแล้ว',
      verifyUnavailable: 'ตรวจสอบไม่สำเร็จ กรุณาลองใหม่',
      saveError: 'บันทึกไม่สำเร็จ',
      saveException: 'เกิดข้อผิดพลาดขณะบันทึก',
    },
  },

  auth: {
    signIn: {
      /** title ของแท็บเบราว์เซอร์ — reviewer เห็นในคลิป */
      pageTitle: 'เข้าสู่ระบบผู้ขาย',
      title: 'ยินดีต้อนรับผู้ขาย',
      subtitle: 'กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าสู่ระบบ',
      loading: 'กำลังโหลด...',
      withApple: 'เข้าสู่ระบบด้วย Apple',
      withFacebook: 'เข้าสู่ระบบด้วย Facebook',
      withLine: 'เข้าสู่ระบบด้วย LINE',
      withInstagram: 'เข้าสู่ระบบด้วย Instagram',
      orUsername: 'หรือเข้าด้วย username',
      usernameLabel: 'ชื่อผู้ใช้',
      passwordLabel: 'รหัสผ่าน',
      showPassword: 'แสดงรหัสผ่าน',
      hidePassword: 'ซ่อนรหัสผ่าน',
      forgotPassword: 'ลืมรหัสผ่าน?',
      submit: 'เข้าสู่ระบบ',
      submitting: 'กำลังเข้าสู่ระบบ...',
      noAccount: 'ยังไม่มีบัญชี?',
      signUp: 'สมัครสมาชิก',
      errUsernameMin: 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร',
      errUsernameRequired: 'กรุณากรอกชื่อผู้ใช้',
      errPasswordRequired: 'กรุณากรอกรหัสผ่าน',
      /** generic โดยตั้งใจ — ไม่บอกว่า field ไหนผิด เพื่อกัน user enumeration */
      errInvalidCredentials: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      /**
       * เหตุผลที่ล็อกอินด้วย Apple/Facebook/LINE/Instagram ไม่ผ่าน — NextAuth ส่งมาใน `?error=`
       * 🛑 ต้องบอก "ทำอะไรต่อ" ไม่ใช่แค่บอกว่าล้มเหลว โดยเฉพาะ accountNotLinked ซึ่งมีทางออก
       * ที่ผู้ใช้ทำเองได้จริง (เข้าด้วยวิธีเดิม → ไปเชื่อมที่หน้าข้อมูลส่วนตัว)
       */
      oauthError: {
        oauthSignin: 'เริ่มเข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง',
        oauthCallback: 'เชื่อมต่อกับผู้ให้บริการไม่สำเร็จ ลองใหม่อีกครั้ง',
        oauthCreateAccount: 'สร้างบัญชีใหม่ไม่สำเร็จ ลองใหม่หรือสมัครด้วยเบอร์โทร',
        accountNotLinked: 'บัญชีนี้เคยเข้าสู่ระบบด้วยวิธีอื่น ให้เข้าด้วยวิธีเดิมก่อน แล้วไปเชื่อมบัญชีที่หน้า "ข้อมูลส่วนตัว"',
        accessDenied: 'บัญชีนี้ถูกปิดไปแล้ว เข้าสู่ระบบไม่ได้',
        configuration: 'ระบบตั้งค่าไม่ครบ กรุณาติดต่อผู้ดูแล',
        credentials: 'เข้าสู่ระบบไม่สำเร็จ ตรวจสอบข้อมูลแล้วลองใหม่',
        sessionRequired: 'กรุณาเข้าสู่ระบบก่อน',
        unknown: 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง',
      },
    },
  },

  account: {
    language: {
      cardTitle: 'ภาษา',
      description: 'เลือกภาษาที่ใช้แสดงผลในแอปผู้ขาย มีผลเฉพาะบัญชีของคุณ ไม่กระทบคนอื่นในร้าน',
      saveSuccess: 'เปลี่ยนภาษาแล้ว',
      saveError: 'เปลี่ยนภาษาไม่สำเร็จ กรุณาลองใหม่',
    },
  },
}

/**
 * โครงสร้างคีย์ที่ทุกภาษาต้องมีครบเท่ากัน
 * en.ts ประกาศ `const en: Dictionary` ⇒ ขาดคีย์ = tsc error, เกินคีย์ = tsc error
 */
export type Dictionary = typeof th
