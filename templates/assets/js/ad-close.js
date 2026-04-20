/**
 * 广告关闭按钮 · 会话级版本（v2 · since v1.5.1-next.13）
 *
 * 工作方式：
 * 1. 所有广告容器带 data-ad-slot 属性（slot = 广告唯一 ID · URL 或 code 前缀）
 * 2. 每个广告容器内有 .joe_advert__close 按钮（× 符号）
 * 3. 点击 × → 记录 slot 到 sessionStorage.joe_ads_closed（数组）
 * 4. 同 tab 内刷新 / 翻到下一篇 → 读 sessionStorage → 匹配 slot 的广告容器 display:none
 * 5. 关 tab / 关浏览器 → sessionStorage 自动清 → 下次打开广告回来
 *
 * 设计取舍：
 * - 为什么不用 localStorage（持久）：上一版本踩坑——访客/站主点一次×就永远丢失该广告
 *   访问，站主连自测都不能。改为 session 级后，同一阅读会话内不被同一广告烦扰，
 *   关 tab 后广告自然恢复，最接近 Web 通用的"临时忽略"体验。
 * - 为什么不用纯 DOM 隐藏：同一 tab 内连续翻多篇文章时，每篇广告都会重新出现，
 *   访客感受到"怎么关了又来"。session 记忆解决这个烦扰。
 *
 * 不依赖 jQuery · 原生 DOM + IIFE · 安全独立。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'joe_ads_closed';

  // 一次性清理：上一版本（next.11/12）写入 localStorage 的旧持久化数据
  // 这行保证升级后用户不再被老数据锁定
  try {
    if (localStorage.getItem(STORAGE_KEY)) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    /* privacy mode · ignore */
  }

  function loadClosedSet() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set();
      var arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveClosedSet(set) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {
      /* quota exceeded or privacy mode · silently fail */
    }
  }

  function hideClosedAds() {
    var closed = loadClosedSet();
    if (closed.size === 0) return;
    var ads = document.querySelectorAll('[data-ad-slot]');
    for (var i = 0; i < ads.length; i++) {
      var slot = ads[i].getAttribute('data-ad-slot');
      if (slot && closed.has(slot)) {
        ads[i].style.display = 'none';
      }
    }
  }

  function onDocumentClick(e) {
    var btn = e.target.closest && e.target.closest('.joe_advert__close');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    var ad = btn.closest('[data-ad-slot]');
    if (!ad) return;

    var slot = ad.getAttribute('data-ad-slot');
    if (!slot) {
      ad.style.display = 'none'; // 无 slot 也至少本次关掉
      return;
    }

    var closed = loadClosedSet();
    closed.add(slot);
    saveClosedSet(closed);
    ad.style.display = 'none';
  }

  // DOM ready 之后绑定（body 末尾引入无 DOMContentLoaded 也 OK，但保险）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      hideClosedAds();
      document.addEventListener('click', onDocumentClick);
    });
  } else {
    hideClosedAds();
    document.addEventListener('click', onDocumentClick);
  }
})();
