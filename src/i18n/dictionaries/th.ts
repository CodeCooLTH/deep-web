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
    selectEmptyDesc: 'บัญชี Facebook ของคุณต้องเป็นแอดมินของเพจ และเปิดสิทธิ์จัดการข้อความ (Messaging)',
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
