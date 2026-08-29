// ==UserScript==
// @name         YouTube iOS 铺满
// @namespace    local.rokuon
// @version      6.2
// @description  v6 铺满逻辑不变。v6.1 加的进度条上移(避开 Home 指示条手势区)会导致进度条和底部控制条(时间显示/全屏恢复按钮)重叠、吃掉触摸事件,拖不动进度条——real Web Inspector 实测确认根因是 transform 只加在了进度条自己身上,没加在底部控制条上。v6.2 把同样的位移一起加到 .player-controls-bottom(左右两栏共用的 class),两者保持原有相对位置一起上移,不再重叠,拖动恢复正常。
// @match        https://m.youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CFG = { debug: true, cooldown: 400 };

  // 实测(m.youtube.com / iOS 26.4)
  const BOX_ID = 'player-container-id';   // 同时包含 video 与 #player-control-overlay
  const CTRL_ID = 'player-control-overlay';

  // ───────── 日志 ─────────
  const L = [];
  function log(s) {
    L.push(new Date().toISOString().slice(17, 23) + ' ' + s);
    if (L.length > 200) L.shift();
    try { console.log('[fsx] ' + s); } catch (_) {}
    paint();
  }

  // ───────── 状态 ─────────
  let active = false;
  let box = null, vid = null;
  let savedScrollY = 0, lastAct = 0;
  let backdrop = null;
  const timers = [];
  const saved = new Map();

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearLater = () => { while (timers.length) clearTimeout(timers.pop()); };

  const activeVideo = () => {
    const all = Array.prototype.slice.call(document.querySelectorAll('video'));
    all.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    return all[0] || null;
  };

  const vw = () => Math.round(window.visualViewport ? visualViewport.width : innerWidth);
  const vh = () => Math.round(window.visualViewport ? visualViewport.height : innerHeight);

  // ───────── 拦全屏入口 ─────────
  function patch() {
    const vp = window.HTMLVideoElement && HTMLVideoElement.prototype;
    if (!vp || vp.__fsxPatched) return;
    vp.__fsxPatched = true;

    ['requestFullscreen', 'webkitRequestFullscreen', 'webkitEnterFullscreen'].forEach((k) => {
      if (typeof vp[k] === 'function') {
        vp['__o' + k] = vp[k];
        vp[k] = function () { log('拦 ' + k); toggle(this); };
      }
    });
    if (typeof vp.webkitExitFullscreen === 'function') {
      vp.__owebkitExitFullscreen = vp.webkitExitFullscreen;
      vp.webkitExitFullscreen = function () {
        if (active) exit(); else { try { vp.__owebkitExitFullscreen.call(this); } catch (_) {} }
      };
    }
    document.addEventListener('webkitbeginfullscreen', function (e) {
      const v = e.target;
      try {
        if (typeof v.webkitSetPresentationMode === 'function') v.webkitSetPresentationMode('inline');
        else if (vp.__owebkitExitFullscreen) vp.__owebkitExitFullscreen.call(v);
      } catch (_) {}
      log('兜底弹回 inline');
      toggle(v);
    }, true);
  }

  // ───────── 样式 ─────────
  function injectCSS() {
    if (document.getElementById('fsx-style')) return;
    const s = document.createElement('style');
    s.id = 'fsx-style';
    s.textContent = `
html.fsx-on, html.fsx-on body { background:#000 !important; overscroll-behavior-y:contain !important; }
html.fsx-on body { -webkit-touch-callout:none !important; }
#fsx-backdrop { position:fixed; inset:0; background:#000; z-index:2147483000; pointer-events:none; }
#fsx-btn { position:fixed; left:6px; top:6px; z-index:2147483647; background:#000; color:#0f0;
  font:13px monospace; padding:3px 6px; border:1px solid #0f0; border-radius:3px; opacity:.5; }
#fsx-panel { position:fixed; inset:0; z-index:2147483646; background:#000; color:#0f0;
  display:none; padding:10px; overflow:auto; -webkit-overflow-scrolling:touch; }
#fsx-panel pre { font:11px/1.45 monospace; white-space:pre-wrap; word-break:break-all;
  margin:0; -webkit-user-select:text; user-select:text; }

/* 进度条 + 底部控制条(时间显示、全屏恢复按钮)一起上移,让出 Home 指示条手势区。
   选择器均为 real Web Inspector 实测确认:
   - yt-progress-bar.ytPlayerProgressBarHost 是进度条本体
   - .player-controls-bottom 是左右两栏控制条共用的 class(player-controls-bottom-left/right)
   两者必须用同一个位移量、直接加在各自身上(不能加在 .player-controls-bottom 的父级 0 高度
   包裹层 player-bottom-controls 上——那个包裹层的子元素是 position:fixed,一旦祖先带
   transform 就会变成它们的新定位基准,导致整栏错位到屏幕外/消失,已实测踩过)。
   用 transform 而非改 top,不干扰各自原有的 position 布局,也不会跟自身的 inline 样式打架。
   2 倍 Home 指示条触控宽度 = 2 * safe-area-inset-bottom;YouTube 页面 meta 已带 viewport-fit=cover,
   env() 直接可用,不需要额外注入 meta 标签。 */
html.fsx-on yt-progress-bar.ytPlayerProgressBarHost,
html.fsx-on .player-controls-bottom {
  transform: translateY(calc(-2 * env(safe-area-inset-bottom, 0px))) !important;
}
`;
    (document.head || document.documentElement).appendChild(s);
  }

  // ───────── 尺寸写入 ─────────
  function remember(el) {
    if (el && !saved.has(el)) saved.set(el, el.getAttribute('style') || '');
  }

  function layout() {
    if (!active || !box) return;
    const w = vw(), h = vh();
    const off = window.visualViewport ? Math.round(visualViewport.offsetTop) : 0;
    const left = window.visualViewport ? Math.round(visualViewport.offsetLeft) : 0;

    remember(box);
    box.style.setProperty('position', 'fixed', 'important');
    box.style.setProperty('top', off + 'px', 'important');
    box.style.setProperty('left', left + 'px', 'important');
    box.style.setProperty('width', w + 'px', 'important');
    box.style.setProperty('height', h + 'px', 'important');
    box.style.setProperty('max-width', 'none', 'important');
    box.style.setProperty('max-height', 'none', 'important');
    box.style.setProperty('margin', '0', 'important');
    box.style.setProperty('padding', '0', 'important');
    box.style.setProperty('transform', 'none', 'important');
    box.style.setProperty('background', '#000', 'important');
    box.style.setProperty('z-index', '2147483100', 'important');

    let n = vid && vid.parentElement;
    const chain = [];
    while (n && n !== box) { chain.push(n); n = n.parentElement; }
    chain.forEach((el) => {
      remember(el);
      el.style.setProperty('width', w + 'px', 'important');
      el.style.setProperty('height', h + 'px', 'important');
      el.style.setProperty('max-width', 'none', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      el.style.setProperty('top', '0', 'important');
      el.style.setProperty('left', '0', 'important');
    });

    if (vid) {
      remember(vid);
      vid.style.setProperty('position', 'absolute', 'important');
      vid.style.setProperty('top', '0', 'important');
      vid.style.setProperty('left', '0', 'important');
      vid.style.setProperty('width', w + 'px', 'important');
      vid.style.setProperty('height', h + 'px', 'important');
      vid.style.setProperty('max-width', 'none', 'important');
      vid.style.setProperty('max-height', 'none', 'important');
      vid.style.setProperty('object-fit', 'contain', 'important');
      vid.removeAttribute('controls');
    }

    const ctrl = document.getElementById(CTRL_ID);
    if (ctrl) { remember(ctrl); ctrl.style.setProperty('z-index', '10', 'important'); }
  }

  function restore() {
    saved.forEach((css, el) => {
      if (css) el.setAttribute('style', css);
      else el.removeAttribute('style');
    });
    saved.clear();
  }

  let guard = null;
  function startGuard() {
    stopGuard();
    guard = new MutationObserver(() => {
      if (!active || !vid) return;
      if (Math.abs(vid.clientHeight - vh()) > 2 || Math.abs(vid.clientWidth - vw()) > 2) {
        log('尺寸被改回,重写');
        layout();
      }
    });
    if (vid) guard.observe(vid, { attributes: true, attributeFilter: ['style', 'controls'] });
  }
  function stopGuard() { if (guard) { guard.disconnect(); guard = null; } }

  // ───────── 进出 ─────────
  function toggle(v) {
    const now = Date.now();
    if (now - lastAct < CFG.cooldown) return;
    lastAct = now;
    const run = () => (active ? exit() : enter(v));
    if (document.body) run();
    else document.addEventListener('DOMContentLoaded', run, { once: true });
  }

  function enter(v) {
    if (active) return;
    vid = v && v.tagName === 'VIDEO' ? v : activeVideo();
    box = document.getElementById(BOX_ID);
    if (!box || !vid) { log('缺 box 或 video'); return; }

    injectCSS();
    savedScrollY = window.scrollY;
    active = true;
    document.documentElement.classList.add('fsx-on');

    backdrop = document.createElement('div');
    backdrop.id = 'fsx-backdrop';
    document.body.appendChild(backdrop);

    layout();
    startGuard();
    log('进入,视口 ' + vw() + '×' + vh());

    later(() => { layout(); measure('0.3s'); }, 300);
    later(() => { layout(); measure('1.0s'); }, 1000);
    later(() => { layout(); measure('2.5s'); }, 2500);

    if (window.visualViewport) {
      visualViewport.addEventListener('resize', layout);
      visualViewport.addEventListener('scroll', layout);
    }
    window.addEventListener('orientationchange', onRotate);
  }

  function exit() {
    if (!active) return;
    active = false;
    clearLater();
    stopGuard();
    restore();
    document.documentElement.classList.remove('fsx-on');
    if (backdrop) backdrop.remove();
    backdrop = null;

    if (window.visualViewport) {
      visualViewport.removeEventListener('resize', layout);
      visualViewport.removeEventListener('scroll', layout);
    }
    window.removeEventListener('orientationchange', onRotate);
    window.scrollTo(0, savedScrollY);
    box = null;
    log('退出');
  }

  function onRotate() {
    layout();
    later(() => { layout(); measure('转屏'); }, 300);
    later(layout, 700);
  }

  // ───────── 测量 ─────────
  function measure(tag) {
    if (!box) { log(tag + ' 无 box'); return; }
    const r = box.getBoundingClientRect();
    const ctrl = document.getElementById(CTRL_ID);
    const cr = ctrl ? ctrl.getBoundingClientRect() : null;
    const pb = document.querySelector('yt-progress-bar.ytPlayerProgressBarHost');
    const pr = pb ? pb.getBoundingClientRect() : null;
    log(tag +
      ' box=' + Math.round(r.width) + '×' + Math.round(r.height) + '@' + Math.round(r.top) +
      ' 视口=' + vw() + '×' + vh() +
      ' video=' + (vid ? vid.clientWidth + '×' + vid.clientHeight : '-') +
      ' 控件=' + (cr ? Math.round(cr.width) + '×' + Math.round(cr.height) + '@' + Math.round(cr.top) : '-') +
      ' controls属性=' + (vid && vid.hasAttribute('controls') ? '✘有' : '✔无') +
      ' | 进度条距底=' + (pr ? Math.round(vh() - pr.top - pr.height) + 'px' : '-'));
  }

  // ───────── 面板 ─────────
  let panelEl, preEl;
  function paint() { if (preEl) preEl.textContent = L.join('\n'); }
  function buildUI() {
    if (!CFG.debug || document.getElementById('fsx-btn')) return;
    const b = document.createElement('div');
    b.id = 'fsx-btn'; b.textContent = '▣';
    document.documentElement.appendChild(b);
    panelEl = document.createElement('div');
    panelEl.id = 'fsx-panel';
    preEl = document.createElement('pre');
    panelEl.appendChild(preEl);
    document.documentElement.appendChild(panelEl);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = panelEl.style.display !== 'block';
      if (on) { measure('手动'); paint(); }
      panelEl.style.display = on ? 'block' : 'none';
    }, true);
    paint();
  }

  // ───────── 启动 ─────────
  patch();
  const boot = () => { injectCSS(); buildUI(); log('就绪'); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.__fsx = {
    enter: () => enter(null), exit, toggle: () => toggle(null),
    layout, measure, text: () => L.join('\n'),
    get active() { return active; }, CFG,
  };
})();
