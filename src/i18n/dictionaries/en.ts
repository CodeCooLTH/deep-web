/**
 * คำแปลภาษาอังกฤษ (feature 00047)
 *
 * 🛑 `const en: Dictionary` คือด่านจริงของ BR-I18N-11 — ไม่ใช่คอมเมนต์นี้
 * ขาดคีย์ที่ th.ts มี → tsc แดง · ใส่คีย์ที่ th.ts ไม่มี → tsc แดง (excess property)
 * ห้ามเปลี่ยนเป็น `Partial<Dictionary>` หรือ `Record<string, unknown>` ไม่ว่าด้วยเหตุผลใด
 * เพราะนั่นคือการถอดด่านออกทั้งอัน แล้วคำแปลที่หายจะไปโผล่ที่หน้าจอผู้ใช้แทน
 *
 * 🛑 ห้ามเพิ่ม fallback ที่ไหนก็ตามที่ยอมให้คีย์หายแล้วระบบยังผ่านได้ (BR-I18N-12)
 * คำแปลที่หายไปไม่ทำให้ระบบพัง มันแค่ทำให้ผู้ใช้เห็นของแปลก = ไม่มีอะไรฟ้อง
 * (docs/conventions/rule-must-be-enforced-not-described.md)
 *
 * แนวทางการเลือกคำ:
 * - ใช้คำที่ Meta/แพลตฟอร์มใช้เองเมื่อพูดถึงของของเขา (Page, Messenger, Instagram)
 *   ไม่คิดคำใหม่ — reviewer ต้องจับคู่สิ่งที่เห็นบนจอกับคำอธิบายในใบยื่นได้ทันที
 * - ศัพท์ธุรกิจยึดนิยามในโค้ด ไม่แปลตามตัวอักษร (BR-I18N-08)
 * - สั้นเข้าไว้ — อังกฤษยาวกว่าไทยเป็นปกติ และของยาวจะไปปลุกบั๊กในกล่องขนาดคงที่
 *   (BR-I18N-17 / docs/conventions/flex-header-truncation.md)
 */
import type { Dictionary } from './th'

export const en: Dictionary = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    back: 'Back',
    loading: 'Loading…',
    retry: 'Try again',
    home: 'Home',
    somethingWentWrong: 'Something went wrong. Please try again.',
  },

  language: {
    buttonLabel: 'Change language',
    // 🛑 ค่านี้เป็นภาษาไทยโดยตั้งใจ ไม่ใช่คำที่ลืมแปล — อยู่ใน THAI_ALLOWED_IN_EN ของเทส
    // ชื่อภาษาต้องเขียนด้วยภาษาของตัวเองเสมอ ไม่งั้นผู้ใช้ที่กดผิดจะหาทางกลับไม่เจอ
    th: 'ไทย',
    en: 'English',
    thCode: 'TH',
    enCode: 'EN',
  },

  menu: {
    dashboard: 'Shop overview',
    // "ภาพรวมกำไร/ขาดทุน" — ใช้ P&L ซึ่งเป็นศัพท์บัญชีสากล สั้นกว่า "Profit and loss" มาก
    // และเมนูซ้ายกว้างคงที่ 245px (BR-I18N-17)
    sales: 'P&L overview',
    orders: {
      ONLINE_SALES: 'Orders',
      // ไม่ใช่ "Services" เฉย ๆ — ของเดิมคือ "การเข้ารับบริการ" ซึ่งหมายถึงใบงานที่ลูกค้าเข้ามารับ
      // บริการ ไม่ใช่รายการบริการที่ร้านมีขาย (อันหลังคือเมนู "ประเภทงาน")
      SERVICE_QUEUE: 'Service visits',
      LODGING: 'Stay bills',
    },
    auctions: 'Auctions',
    products: 'Products',
    inventory: 'Stock',
    queues: 'Schedule',
    rooms: 'Rooms',
    calendar: 'Booking calendar',
    bookings: 'Bookings',
    housekeepers: 'Housekeepers',
    customers: 'Customers',
    expenses: 'Expenses',
    inbox: 'Messages',
    settingsAutoReply: 'Auto-reply',
    settingsCommentReply: 'Comment replies',
    settingsChatbot: 'AI assistant',
    reviews: 'Reviews',
    verification: 'Shop level',
    badges: 'Achievements',
    wallet: 'Wallet',
    subscriptions: 'My plan',
    admins: 'Staff',
    shop: 'Shop',
    publicProfile: 'Storefront',
    // "การจัดส่ง" — เมนูนี้ตั้งค่าการจัดส่งของร้าน ไม่ใช่หน้าตั้งค่าทั่วไป (ชื่อ slug เป็น
    // seller:settings ด้วยเหตุผลทางประวัติศาสตร์ ป้ายถูกเปลี่ยนเป็น "การจัดส่ง" ไปแล้ว)
    settings: 'Shipping',
    settingsChannels: 'Sales channels',
    settingsJobTypes: 'Service types',
    badgeLocked: 'Locked',
    badgeChoosePlan: 'Choose a plan',
  },

  channels: {
    pageTitle: 'Chat channels',
    breadcrumbSettings: 'Settings',
    intro: 'Connect a Facebook Page to receive Messenger and Instagram messages directly in Deep.',
    resync: 'Sync notifications',
    // ชื่อ "Facebook Page" เป็นคำของ Meta เอง ห้ามแปล — reviewer ต้องจับคู่ปุ่มบนจอกับ
    // คำอธิบาย permission ในใบยื่นได้ทันที
    connectPage: 'Connect Facebook Page',
    emptyTitle: 'No chat channels connected yet',
    connected: 'Connected',
    tokenExpired: 'Token expired',
    reconnect: 'Reconnect',
    disconnect: 'Remove',
    tokenExpiredBanner: '{n} channel(s) have an expired token and need to be reconnected',

    disconnectTitle: 'Disconnect {name}?',
    disconnectText: 'Past messages stay, but this Page will no longer send new messages here.',
    disconnectConfirm: 'Disconnect',
    disconnectCancel: 'Close',
    disconnectSuccess: 'Disconnected {provider}',
    disconnectError: "Couldn't disconnect. Please try again.",

    connectSuccess: 'Connected {n} channel(s)',
    connectSuccessMoved: 'Connected {n} channel(s) ({moved} page(s) moved here)',
    connectNoNew: 'No new pages were connected',
    connectSubscribeFailed: 'Some pages are not receiving notifications yet: {n} — try "Sync notifications"',

    resyncError: "Couldn't sync. Please try again.",
    resyncPartial: 'Synced {ok} page(s) · {failed} failed (try reconnecting those pages)',
    resyncSuccess: 'Synced notifications for {ok} page(s)',
    resyncSuccessShops: 'Synced notifications for {ok} page(s) across {shops} shop(s)',

    errCancelled: 'Connection cancelled',
    errStateMismatch: 'Your session expired. Please try again.',
    errNoShop: 'We could not find your shop',
    errNoEligiblePage: 'No Page found where you can manage messages',
    errGeneric: "Couldn't connect. Please try again.",

    selectPageTitle: 'Choose pages to connect',
    selectBreadcrumb: 'Choose pages',

    selectIntro: 'Choose the pages to connect to',
    selectIntroThisShop: 'this shop',
    selectIntroTail: '— only the pages you select will send messages into Deep',
    selectAll: 'Select all',
    selectClear: 'Clear selection',
    selectedCount: '{n} page(s) selected',
    selectConfirm: 'Connect selected pages',
    selectConfirming: 'Connecting',
    selectCancel: 'Cancel',
    selectNoneChosen: 'Please select at least one page',

    pageHasInstagram: 'Has Instagram',
    pageHasInstagramTitle: 'This Page has an Instagram account linked',
    pageAlreadyHere: 'Already connected to this shop',
    pageInOtherShopNamed: 'Connected to {shop}',
    pageInOtherShop: 'Connected to another shop',

    moveOneTitle: 'Move this Page to this shop?',
    moveManyTitle: 'Move {n} pages to this shop?',
    moveBody: 'These pages are connected to another shop. That connection will be removed (past messages are kept):',
    moveShopSuffix: '{shop}',
    moveConfirm: 'Move here',

    selectExpiredTitle: 'Session expired',
    selectExpiredDesc: 'This page-selection link has expired. Please start connecting your Facebook Page again.',
    selectExpiredAction: 'Start again',
    selectLoadErrorTitle: "Couldn't load your pages",
    selectLoadErrorDesc: 'Something went wrong while fetching pages from Facebook. Please try again.',
    selectLoadErrorAction: 'Try again',
    selectEmptyTitle: 'No Page found where you can manage messages',
    // ยืนยันว่าคำอธิบายตรงกับเงื่อนไขจริงในโค้ด: เราคัดเพจด้วย tasks ที่มี MESSAGING และ MODERATE
    selectEmptyDesc: 'Your Facebook account must be an admin of the Page with the Messaging permission enabled.',
  },

  inbox: {
    tabMessages: 'Messages',
    tabComments: 'Comments',
    unreadChats: '{n} unread chat(s)',
    unansweredComments: '{n} comment(s) awaiting reply',

    backToDashboard: 'Back to dashboard',
    soundOn: 'Turn on new-message sound',
    soundOff: 'Turn off new-message sound',

    searchPlaceholder: 'Search by name, customer, phone, or message',
    channelFilterLabel: 'Filter by channel',
    channelAll: 'All',

    filters: 'Filters',
    statusResolved: 'Resolved',
    statusSpam: 'Spam',
    groups: 'Groups',

    emptyTitle: 'Select a conversation',
    emptyDesc: 'Pick a chat from the list on the left to start reading and replying',

    composerPlaceholder: 'Type a message, or paste a file here…',
    composerCaptionPlaceholder: 'Add a caption (optional)',
    composerDisabled: "You can't send messages right now",
    composerQuotaExhausted: 'Message quota used up — sending is unavailable',
    send: 'Send',
    sendWithNote: 'Send — {note}',
    backToList: 'Back to list',
    customerInfo: 'Customer info',

    contextBar: {
      shopReplyingShort: 'Replying as {shop}',
      shopReplyingPrefix: "You're replying as",

      commentLabel: 'From comment',
      commentPostEmpty: 'Post has no caption',
      commentTextEmpty: 'Comment has no text',
      commentImageOnly: 'Sent a photo in the comment',
      viewComment: 'View comment',

      adLabel: 'From ad',
      // "Ad ID" เป็นศัพท์ที่ Meta ใช้เองใน Ads Manager — reviewer จับคู่กับ ad_id ในใบยื่นได้ทันที
      adIdFallback: 'Ad ID {adId}',
      adBannerTitle: 'This chat replied to your ad',
      viewAd: 'View ad',
      dismissAdSource: 'Dismiss ad source',

      collapse: 'Hide chat context',
      expandMultiple: 'View all {n} context items',
      expandSingle: 'View chat context details',
    },

    /** Customer file library (feature 00048) — see th.ts for why "Save" is safe here */
    librarySave: 'Save to library',
    libraryUnsave: 'Remove from library',
    librarySectionTitle: 'File library',
    librarySavedToast: 'Saved to library',
    libraryRemovedToast: 'Removed from library',
    librarySaveFailed: "Couldn't save to library. Please try again.",
    libraryRemoveFailed: "Couldn't remove from library. Please try again.",
    libraryLoadFailed: "Couldn't load the file library",
    libraryRetry: 'Try again',
    libraryLoading: 'Loading...',
    libraryEmptyTitle: 'No files saved yet',
    libraryEmptyBody: 'On any photo, video or file in the chat, choose "Save to library" — press and hold on mobile, or hover over the message on desktop.',
    libraryMissingFile: 'File was deleted',
    libraryOpenFile: 'Open file',
    libraryDownload: 'Download',
    libraryEdit: 'Edit',
    librarySeeInChat: 'View in chat',
    libraryEditTitle: 'Edit file',
    libraryEditNameLabel: 'File name',
    libraryEditNoteLabel: 'Note',
    libraryEditNotePlaceholder: 'Note why you saved this file...',
    libraryEditSubmit: 'Save',
    libraryEditSaved: 'Saved',
    libraryCancel: 'Cancel',
    librarySeeAll: 'View all files ({n})',
    libraryModalTitle: 'File library · {name}',
    libraryFileFallbackName: 'Attachment',
    librarySenderBuyer: 'the customer',
    librarySenderShop: 'the shop',
    librarySavedByFallback: 'a team member',
    libraryAriaImage: 'Photo from {who} · {when}',
    libraryAriaVideo: 'Video from {who} · {when}',
    libraryAriaFile: '{name} from {who} · {when}',
    librarySentBy: 'Sent by {who} · {when}',
    librarySavedBy: 'Saved by {who} · {when}',
  },

  publicProfile: {
    pageTitle: 'Public profile',
    breadcrumbOverview: 'Overview',
    builderCta: 'Customize storefront',

    visibleCardTitle: 'What visitors see',
    visibleCardBody:
      'Your shop name, logo, cover photo, and category are set on the shop settings page. This page is for choosing what else to show.',
    shopSettingsCta: 'Shop settings',

    linkCardTitle: 'Your storefront link',
    copy: 'Copy',
    copiedToast: 'Link copied',
    viewMyStorefront: 'View my storefront',
    noLinkYet: "Your shop doesn't have a username or storefront link yet — set one up on the shop settings page",

    mobileBuilderNoticeTitle: 'Arrange storefront blocks on a computer',
    mobileBuilderNoticeBody:
      'Reordering and choosing what to show needs a wider screen. Open this page on a computer when you can — the other settings here work fine on mobile.',

    visibility: {
      cardTitle: 'Storefront visibility',
      switchLabel: 'Publish your storefront',
      descriptionOn: 'Anyone can view your storefront as usual',
      descriptionOff:
        "Visitors will see a message that this page is temporarily unpublished — you can still view your own storefront anytime",
      hiddenBanner: "This storefront is unpublished. Visitors can't see it.",
      confirmTitle: 'Unpublish storefront?',
      confirmBody:
        "Visitors won't be able to see your storefront until you publish it again — you can turn it back on anytime from this page",
      confirmButton: 'Unpublish',
      saveError: "Couldn't change the publish status",
      publishedToast: 'Storefront published',
      unpublishedToast: 'Storefront unpublished',
    },

    videos: {
      cardTitle: 'Videos shown on your storefront',
      subtitle: "You can select up to {max} clip(s). They'll show in the order you pick them.",
      loading: 'Loading clips from your connected accounts…',
      loadError: "Couldn't load the clip list",
      partialWarning: 'Some channels failed to load clips — the list may be incomplete',
      loadException: 'Something went wrong while loading',
      prunedWarning:
        'Removed {n} clip(s) that are no longer in your account (they may have been deleted) from your selection',
      emptyTitle: 'No clips to choose from yet',
      emptyDescription:
        "Clips are pulled from the Facebook Pages and Instagram accounts connected to your shop. If you haven't connected one yet, go to chat channels first.",
      // ตรงกับ `channels.pageTitle` = 'Chat channels' ซึ่งเป็นหน้าปลายทางจริงของปุ่มนี้
      emptyAction: 'Go to chat channels',
      channelsTabLabel: 'Channels',
      maxReachedWarning: 'You can select up to {max} clip(s)',
      selectedCount: 'Selected {n} of {max}',
      saving: 'Saving…',
      saveSuccess: 'Saved the clips to show',
      verifyUnavailable: 'Verification failed. Please try again.',
      saveError: "Couldn't save",
      saveException: 'Something went wrong while saving',
    },
  },

  auth: {
    signIn: {
      pageTitle: 'Seller sign-in',
      title: 'Welcome, seller',
      subtitle: 'Enter your username and password to sign in',
      loading: 'Loading…',
      // ชื่อผู้ให้บริการเป็นชื่อแบรนด์ ห้ามแปล — reviewer ต้องจับคู่กับคำอธิบายในใบยื่นได้ทันที
      withApple: 'Sign in with Apple',
      withFacebook: 'Sign in with Facebook',
      withLine: 'Sign in with LINE',
      withInstagram: 'Sign in with Instagram',
      orUsername: 'Or use your username',
      usernameLabel: 'Username',
      passwordLabel: 'Password',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      forgotPassword: 'Forgot password?',
      submit: 'Sign in',
      submitting: 'Signing in…',
      noAccount: "Don't have an account?",
      signUp: 'Sign up',
      errUsernameMin: 'Username must be at least 3 characters',
      errUsernameRequired: 'Please enter your username',
      errPasswordRequired: 'Please enter your password',
      errInvalidCredentials: 'Incorrect username or password',
    },
  },

  account: {
    language: {
      cardTitle: 'Language',
      description: 'Choose the display language for the seller app. This affects only your account, not others in your shop.',
      saveSuccess: 'Language changed',
      saveError: "Couldn't change the language. Please try again.",
    },
  },
}
