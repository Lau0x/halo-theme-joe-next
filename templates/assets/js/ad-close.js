/**
 * 广告关闭按钮 · 持久化版
 *
 * 工作方式：
 * 1. 所有广告容器带 data-ad-slot 属性（slot = 广告唯一 ID · 一般是 URL 或 code 前缀）
 * 2. 每个广告容器内有 .joe_advert__close 按钮（× 符号）
 * 3. 点击 × → 记录 slot 到 localStorage.joe_ads_closed（数组）
 * 4. 下次加载页面 → 读 localStorage → 匹配 slot 的广告容器设 display:none
 *
 * 不依赖 jQuery · 原生 DOM + IIFE · 安全独立。
 *
 * 恢复被关闭的广告：清 localStorage.joe_ads_closed（手动）或换浏览器。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'joe_ads_closed';

  function loadClosedSet() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set();
      var arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveClosedSet(set) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
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
