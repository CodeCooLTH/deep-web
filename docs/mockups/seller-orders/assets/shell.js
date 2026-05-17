/* ==========================================================================
 * Paces seller shell — DOM injector for static mockup
 *
 * Mirrors the real app DOM:
 *   .wrapper
 *     > header.app-header > .container-fluid (left MenuToggler / right widgets)
 *     > aside.app-menu  (.logo-box + .sidenav-scroll > ul.side-nav)
 *     > .page-content > main > .container-fluid  ← #app-content moves here
 *
 * Menu data = exact copy of src/app/(paces)/seller/(dashboard)/_seller-menu.ts
 * (section title isTitle + children; tabler icons via iconify-icon).
 *
 * Body attributes:
 *   data-page   → slug to highlight active leaf (e.g. "orders")
 *   data-title  → page-main-title text (e.g. "คำสั่งซื้อ")
 *   data-crumb  → breadcrumb tail after "หน้าหลัก", " / "-separated
 *                 (e.g. "Business / คำสั่งซื้อ" or "Business / คำสั่งซื้อ / รายละเอียด")
 * ========================================================================== */
(function () {
  'use strict';

  var body = document.body;
  var activePage = body.dataset.page || '';
  var pageTitle = body.dataset.title || document.title.replace(/ ·.*$/, '');
  var crumbRaw = body.dataset.crumb || '';

  // ---- Seller menu (1:1 with _seller-menu.ts) ----
  var sellerMenu = [
    {
      label: 'Analytics', isTitle: true,
      children: [
        { slug: 'dashboard',  label: 'ภาพรวมร้านค้า', icon: 'tabler:dashboard',     href: '#' },
        { slug: 'sales',      label: 'ภาพรวมยอดขาย',  icon: 'tabler:chart-line',    href: '#' },
        { slug: 'badges',     label: 'ความสำเร็จ',     icon: 'tabler:award',         href: '#' }
      ]
    },
    {
      label: 'Business', isTitle: true,
      children: [
        { slug: 'orders',     label: 'คำสั่งซื้อ',     icon: 'tabler:receipt-2',     href: 'list.html' },
        { slug: 'products',   label: 'สินค้า',         icon: 'tabler:package',       href: '#' },
        { slug: 'categories', label: 'หมวดหมู่สินค้า', icon: 'tabler:category',      href: '#' },
        { slug: 'reviews',    label: 'รีวิว',          icon: 'tabler:star',          href: '#' }
      ]
    },
    {
      label: 'Buyer', isTitle: true,
      children: [
        { slug: 'customers',  label: 'ผู้ซื้อ',        icon: 'tabler:user-circle',   href: '#' }
      ]
    },
    {
      label: 'Setting', isTitle: true,
      children: [
        { slug: 'shop',         label: 'ตั้งค่าร้าน',      icon: 'tabler:building-store', href: '#' },
        { slug: 'verification', label: 'การยืนยันตัวตน',  icon: 'tabler:shield-check',  href: '#' }
      ]
    }
  ];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- Build menu HTML (mirrors AppMenu.tsx structure) ----
  var menuHtml = '';
  sellerMenu.forEach(function (section) {
    if (section.isTitle) {
      menuHtml += '<li class="menu-title"><span>' + esc(section.label) + '</span></li>';
    }
    (section.children || []).forEach(function (item) {
      var isActive = item.slug === activePage;
      menuHtml +=
        '<li class="menu-item' + (isActive ? ' active' : '') + '">' +
          '<a href="' + esc(item.href) + '" class="menu-link' + (isActive ? ' active' : '') + '">' +
            '<span class="menu-icon"><iconify-icon icon="' + esc(item.icon) + '"></iconify-icon></span>' +
            '<span class="menu-text">' + esc(item.label) + '</span>' +
          '</a>' +
        '</li>';
    });
  });

  // ---- Breadcrumb: "หน้าหลัก" + crumb tail ----
  var crumbParts = crumbRaw.split('/').map(function (s) { return s.trim(); }).filter(Boolean);
  var crumbHtml = '<a href="list.html">หน้าหลัก</a>';
  crumbParts.forEach(function (part, i) {
    var last = i === crumbParts.length - 1;
    crumbHtml += '<span class="sep">›</span>';
    crumbHtml += last
      ? '<span class="current">' + esc(part) + '</span>'
      : '<span>' + esc(part) + '</span>';
  });

  // ---- Shell markup ----
  var wrapper = document.createElement('div');
  wrapper.className = 'wrapper';
  wrapper.innerHTML =
    '<header class="app-header">' +
      '<div class="container-fluid">' +
        '<div style="display:flex;align-items:center;gap:.625rem">' +
          '<button id="button-toggle-menu" type="button" aria-label="เมนู">' +
            '<iconify-icon icon="tabler:menu-2" style="font-size:22px"></iconify-icon>' +
          '</button>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:.75rem">' +
          '<button class="topbar-link" type="button" aria-label="การแจ้งเตือน" style="position:relative">' +
            '<iconify-icon class="topbar-link-icon" icon="tabler:bell"></iconify-icon>' +
            '<span class="topbar-badge">5</span>' +
          '</button>' +
          '<button class="topbar-link" type="button" aria-label="สลับธีม">' +
            '<iconify-icon class="topbar-link-icon" icon="tabler:moon"></iconify-icon>' +
          '</button>' +
          '<button class="topbar-link" type="button" aria-label="เต็มจอ">' +
            '<iconify-icon class="topbar-link-icon" icon="tabler:maximize"></iconify-icon>' +
          '</button>' +
          '<div class="topbar-user">' +
            '<img src="https://i.pravatar.cc/64?img=8" alt="" ' +
              'onerror="this.outerHTML=\'&lt;span style=&quot;width:36px;height:36px;border-radius:9999px;background:#7b70ef26;color:#7b70ef;display:flex;align-items:center;justify-content:center;font-weight:600&quot;&gt;ผ&lt;/span&gt;\'">' +
            '<div style="line-height:1">' +
              '<div class="pro-username">ผู้ใช้ทดสอบ</div>' +
              '<div class="pro-subtitle">@testuser</div>' +
            '</div>' +
            '<iconify-icon icon="tabler:chevron-down" style="font-size:14px;color:#a1a9b1"></iconify-icon>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</header>' +

    '<aside id="app-menu" class="app-menu">' +
      '<a href="list.html" class="logo-box">' +
        '<span class="logo-mark">' +
          '<span class="logo-glyph">D</span>' +
          '<span>Deep <span class="logo-sub">Seller</span></span>' +
        '</span>' +
      '</a>' +
      '<div class="sidenav-scroll" id="sidenav-menu">' +
        '<ul class="side-nav">' + menuHtml + '</ul>' +
      '</div>' +
    '</aside>' +

    '<div id="mk-overlay"></div>' +

    '<div class="page-content">' +
      '<main>' +
        '<div class="container-fluid">' +
          '<div class="page-title-head">' +
            '<h4 class="page-main-title">' + esc(pageTitle) + '</h4>' +
            '<nav class="breadcrumb" aria-label="breadcrumb">' + crumbHtml + '</nav>' +
          '</div>' +
          '<div id="shell-slot"></div>' +
        '</div>' +
      '</main>' +
    '</div>';

  // ---- Mount: move existing #app-content into the shell slot ----
  var content = document.getElementById('app-content');
  body.insertBefore(wrapper, content);
  var slot = wrapper.querySelector('#shell-slot');
  slot.parentNode.replaceChild(content, slot);
  content.hidden = false;
  content.removeAttribute('hidden');

  // ---- Mobile offcanvas toggle ----
  var burger = document.getElementById('button-toggle-menu');
  var overlay = document.getElementById('mk-overlay');
  function openNav() { body.classList.add('sidenav-open'); }
  function closeNav() { body.classList.remove('sidenav-open'); }
  if (burger) burger.addEventListener('click', function () {
    body.classList.contains('sidenav-open') ? closeNav() : openNav();
  });
  if (overlay) overlay.addEventListener('click', closeNav);
})();
