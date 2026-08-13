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
    backToList: 'กลับรายการ',
    customerInfo: 'ข้อมูลลูกค้า',

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
