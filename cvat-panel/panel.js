/* SmartReview Scan QA panel, injected into CVAT by the proxy (see nginx.conf).
   Talks to SmartReview through /smartreview/api/ on the same origin. Read-only: it never
   writes to CVAT. Jump-to-frame reloads the job URL with ?frame=N. */
(() => {
  if (window.__smartreviewPanel) return;
  window.__smartreviewPanel = true;
  const API = '/smartreview/api';
  const SEV = { high: '#ff6b81', medium: '#ffb454', low: '#8b95a8' };

  async function api(path, options = {}) {
    const res = await fetch(API + path, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok) {
      const err = new Error((data && data.error) || `Lỗi ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  // /tasks/1/jobs/1  ->  1
  const jobFromUrl = () => {
    const m = location.pathname.match(/\/jobs\/(\d+)/);
    return m ? Number(m[1]) : null;
  };
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const host = document.createElement('div');
  host.id = 'smartreview-panel-root';
  host.style.cssText = 'position:relative; z-index:2147483647;';
  if (document.body) {
    document.body.appendChild(host);
  } else {
    window.addEventListener('DOMContentLoaded', () => document.body.appendChild(host));
  }
  const root = host.attachShadow({ mode: 'open' });
  // CVAT's shortcuts listen on the document and let a key through only when its target is an
  // input. A key typed in this shadow root reaches them retargeted to the host div, so they took
  // every letter as a shortcut and cancelled it. Keys from the panel stop at the window instead;
  // typing is the browser's default action, so the inputs still get them, and Enter submits the forms.
  for (const type of ['keydown', 'keypress', 'keyup'])
    window.addEventListener(type, (e) => e.composedPath().includes(host) && e.stopImmediatePropagation(), true);
  root.innerHTML = `
  <style>
    :host { all: initial; }
    * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
    }
    .panel {
      position: fixed;
      left: 52px;
      top: 54px;
      z-index: 2147483000;
      width: 420px;
      max-height: calc(100vh - 74px);
      display: none;
      flex-direction: column;
      color: #262626;
      background: #ffffff;
      border: 1px solid #d9d9d9;
      border-radius: 8px;
      box-shadow: 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 9px 28px 8px rgba(0, 0, 0, 0.05);
      overflow: hidden;
      font-size: 13px;
    }
    .panel.open {
      display: flex;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: #fafafa;
      border-bottom: 1px solid #f0f0f0;
    }
    header b {
      font-size: 14px;
      font-weight: 600;
      color: #262626;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    header small {
      color: rgba(0, 0, 0, 0.45);
      font-size: 12px;
      font-weight: normal;
      display: block;
      margin-top: 2px;
    }
    .badge-cvat {
      font-size: 11px;
      font-weight: 500;
      padding: 1px 6px;
      border-radius: 4px;
      background: #e6f7ff;
      color: #1890ff;
      border: 1px solid #91d5ff;
    }
    .x {
      background: none;
      border: 0;
      color: rgba(0, 0, 0, 0.45);
      font-size: 16px;
      cursor: pointer;
      line-height: 1;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .x:hover {
      color: rgba(0, 0, 0, 0.85);
      background: rgba(0, 0, 0, 0.06);
    }
    .body {
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: 1;
      min-height: 0;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
    }
    .meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .meta .tag {
      margin-left: 4px;
    }
    .body::-webkit-scrollbar {
      width: 6px;
    }
    .body::-webkit-scrollbar-thumb {
      background: #d9d9d9;
      border-radius: 3px;
    }
    .body::-webkit-scrollbar-thumb:hover {
      background: #bfbfbf;
    }
    label {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.65);
      font-weight: 500;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    input {
      width: 100%;
      height: 32px;
      padding: 4px 11px;
      border-radius: 4px;
      border: 1px solid #d9d9d9;
      background: #ffffff;
      color: #262626;
      font-size: 13px;
      outline: none;
      transition: all 0.2s;
    }
    input:hover {
      border-color: #40a9ff;
    }
    input:focus {
      border-color: #40a9ff;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
    }
    .row {
      display: flex;
      flex-direction: row;
      gap: 8px;
      align-items: flex-end;
    }
    .row > * {
      flex: 1;
    }
    .row .btn {
      flex: 0 0 auto;
    }
    .btn {
      height: 32px;
      padding: 4px 15px;
      border-radius: 4px;
      border: 1px solid #1890ff;
      background: #1890ff;
      color: #ffffff;
      font-weight: 500;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
      box-shadow: 0 2px 0 rgba(0, 0, 0, 0.045);
      white-space: nowrap;
    }
    .btn:hover {
      background: #40a9ff;
      border-color: #40a9ff;
    }
    .btn:active {
      background: #096dd9;
      border-color: #096dd9;
    }
    .btn:disabled {
      background: #f5f5f5;
      border-color: #d9d9d9;
      color: rgba(0, 0, 0, 0.25);
      cursor: not-allowed;
      box-shadow: none;
    }
    .msg {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.55);
      line-height: 1.5;
      margin: 0;
    }
    .notice {
      padding: 8px 12px;
      background: #f6ffed;
      border: 1px solid #b7eb8f;
      border-radius: 4px;
      font-size: 12px;
      color: #389e0d;
    }
    .notice.info {
      background: #e6f7ff;
      border-color: #91d5ff;
      color: #096dd9;
    }
    .err {
      padding: 8px 12px;
      background: #fff2f0;
      border: 1px solid #ffccc7;
      border-radius: 4px;
      color: #cf1322;
      font-size: 12px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .stat {
      padding: 8px 6px;
      border-radius: 6px;
      background: #fafafa;
      border: 1px solid #f0f0f0;
      text-align: center;
    }
    .stat b {
      display: block;
      font-size: 18px;
      font-weight: 600;
      color: #1890ff;
    }
    .stat span {
      font-size: 10px;
      color: rgba(0, 0, 0, 0.45);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 500;
    }
    .tag {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 2px;
      font-size: 11px;
      font-weight: 500;
      line-height: 18px;
    }
    .tag-high {
      background: #fff1f0;
      border: 1px solid #ffa39e;
      color: #cf1322;
    }
    .tag-medium {
      background: #fffbe6;
      border: 1px solid #ffe58f;
      color: #d46b08;
    }
    .tag-low {
      background: #f5f5f5;
      border: 1px solid #d9d9d9;
      color: #595959;
    }
    .tag.changed {
      background: #fff7e6;
      border: 1px solid #ffd591;
      color: #d46b08;
    }
    .tag.same {
      background: #f5f5f5;
      border: 1px solid #d9d9d9;
      color: rgba(0, 0, 0, 0.45);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .risk {
      padding: 9px 12px;
      border-radius: 6px;
      background: #ffffff;
      border: 1px solid #f0f0f0;
      cursor: pointer;
      transition: all 0.2s;
    }
    .risk:hover {
      background: #e6f7ff;
      border-color: #91d5ff;
      box-shadow: 0 2px 8px rgba(24, 144, 255, 0.15);
    }
    .risk .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      font-size: 12px;
    }
    .risk .title {
      color: #262626;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
      min-width: 0;
    }
    .risk .title b {
      font-weight: 600;
      white-space: nowrap;
    }
    .risk .title span,
    .risk .top .tag {
      white-space: nowrap;
    }
    .risk .top .tag {
      flex-shrink: 0;
    }
    .badge-missing {
      background: #fff7e6;
      color: #d46b08;
      border: 1px solid #ffd591;
      border-radius: 3px;
      padding: 0 5px;
      font-size: 11px;
      font-weight: 600;
    }
    .risk .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
    }
    .risk .badge-obj {
      background: #f0f0f0;
      color: #595959;
      border-radius: 3px;
      padding: 0 4px;
      font-size: 11px;
      font-weight: normal;
    }
    .badge-ai {
      background: #fff7e6;
      color: #d46b08;
      border: 1px solid #ffd591;
      border-radius: 3px;
      padding: 0 5px;
      font-size: 10px;
      font-weight: 600;
    }
    .badge-pp {
      background: #f9f0ff;
      color: #722ed1;
      border: 1px solid #d3adf7;
      border-radius: 3px;
      padding: 0 5px;
      font-size: 10px;
      font-weight: 600;
    }
    .badge-rule {
      background: #f0f5ff;
      color: #1d39c4;
      border: 1px solid #adc6ff;
      border-radius: 3px;
      padding: 0 5px;
      font-size: 10px;
      font-weight: 500;
    }
    .badge-sunk {
      background: #fff1f0;
      color: #cf1322;
      border: 1px solid #ffa39e;
      border-radius: 3px;
      padding: 0 5px;
      font-size: 10px;
      font-weight: 600;
    }
    .risk.resolved {
      opacity: 0.55;
      background: #fafafa;
      border-color: #d9d9d9;
    }
    .risk.resolved:hover {
      opacity: 0.85;
      border-color: #52c41a;
    }
    .risk-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 2px;
    }
    .btn-sunk-toggle {
      background: #fff1f0;
      color: #cf1322;
      border: 1px solid #ffa39e;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      padding: 2px 7px;
      cursor: pointer;
      transition: all .15s;
      line-height: 1.3;
    }
    .btn-sunk-toggle:hover {
      background: #ffccc7;
      border-color: #ff7875;
    }
    .btn-sunk-toggle.is-resolved {
      background: #f6ffed;
      color: #389e0d;
      border-color: #b7eb8f;
    }
    .btn-sunk-toggle.is-resolved:hover {
      background: #d9f7be;
      border-color: #95de64;
    }
    .btn-subtle {
      background: #ffffff;
      color: #595959;
      border: 1px solid #d9d9d9;
      border-radius: 4px;
      font-size: 11px;
      padding: 2px 8px;
      cursor: pointer;
      transition: all .15s;
    }
    .btn-subtle:hover {
      background: #f0f0f0;
      color: #1890ff;
      border-color: #91d5ff;
    }
    .btn-subtle.active {
      background: #e6f7ff;
      color: #1890ff;
      border-color: #91d5ff;
      font-weight: 500;
    }
    /* Frame Filter Toolbar */
    .frame-filter-box {
      background: #fafafa;
      border: 1px solid #e8e8e8;
      border-radius: 6px;
      padding: 8px 10px;
      margin: 8px 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .frame-filter-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .frame-select {
      height: 28px;
      padding: 0 8px;
      border-radius: 4px;
      border: 1px solid #d9d9d9;
      background: #ffffff;
      color: #262626;
      font-size: 12px;
      font-weight: 500;
      outline: none;
      flex: 1;
      cursor: pointer;
      min-width: 0;
    }
    .frame-select:focus {
      border-color: #40a9ff;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
    }
    .frame-nav-btns {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .btn-frame-nav {
      height: 28px;
      padding: 0 8px;
      border-radius: 4px;
      border: 1px solid #d9d9d9;
      background: #ffffff;
      color: #595959;
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all .15s;
      white-space: nowrap;
    }
    .btn-frame-nav:hover:not(:disabled) {
      background: #e6f7ff;
      color: #1890ff;
      border-color: #91d5ff;
    }
    .btn-frame-nav:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      background: #f5f5f5;
    }
    .frame-status-banner {
      font-size: 11.5px;
      color: #595959;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 2px;
    }
    .frame-clean-badge {
      background: #f6ffed;
      color: #389e0d;
      border: 1px solid #b7eb8f;
      border-radius: 3px;
      padding: 1px 6px;
      font-size: 11px;
      font-weight: 500;
    }
    .frame-error-badge {
      background: #fff2f0;
      color: #cf1322;
      border: 1px solid #ffccc7;
      border-radius: 3px;
      padding: 1px 6px;
      font-size: 11px;
      font-weight: 600;
    }
    .risk p {
      margin: 5px 0 0;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.65);
      line-height: 1.45;
    }
    .spin {
      display: inline-block;
      width: 13px;
      height: 13px;
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      vertical-align: -2px;
      margin-right: 6px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    /* Scanning Progress Card */
    .scan-progress-box {
      padding: 12px 14px;
      background: linear-gradient(135deg, #f0f7ff 0%, #f6ffed 100%);
      border: 1px solid #b7eb8f;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(24, 144, 255, 0.08);
      margin-top: 2px;
    }
    .scan-progress-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .scan-progress-title {
      font-size: 13px;
      font-weight: 600;
      color: #1890ff;
      display: flex;
      align-items: center;
    }
    .scan-progress-percent {
      font-size: 14px;
      font-weight: 700;
      color: #52c41a;
      letter-spacing: -0.2px;
    }
    .scan-progress-track {
      width: 100%;
      height: 7px;
      background: #e8e8e8;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .scan-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #1890ff 0%, #52c41a 100%);
      border-radius: 4px;
      transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .scan-progress-desc {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.65);
      line-height: 1.4;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Tab Bar for Policy vs AI */
    .tabs-bar {
      display: flex;
      background: #f0f2f5;
      padding: 3px;
      border-radius: 6px;
      gap: 2px;
    }
    .tab-item {
      flex: 1;
      padding: 6px 4px;
      border: none;
      background: transparent;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      color: #595959;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: all 0.15s ease-in-out;
    }
    .tab-item:hover {
      color: #1890ff;
      background: rgba(255, 255, 255, 0.6);
    }
    .tab-item.active {
      background: #ffffff;
      color: #1890ff;
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .tab-count {
      display: inline-block;
      padding: 0 5px;
      border-radius: 10px;
      font-size: 10px;
      line-height: 15px;
      background: #e4e7ed;
      color: #595959;
      font-weight: 600;
    }
    .tab-item.active .tab-count {
      background: #e6f7ff;
      color: #1890ff;
    }
    .tab-item.active .tab-count.count-policy {
      background: #f0f5ff;
      color: #1d39c4;
    }
    .tab-item.active .tab-count.count-ai {
      background: #fff7e6;
      color: #d46b08;
    }
    .empty-state {
      padding: 24px 16px;
      text-align: center;
      color: rgba(0, 0, 0, 0.45);
      font-size: 12px;
      background: #fafafa;
      border: 1px dashed #d9d9d9;
      border-radius: 6px;
    }
  </style>
  <section class="panel" id="sr-panel" role="dialog" aria-label="SmartReview Scan QA">
    <header>
      <div>
        <b>SmartReview QA <span class="badge-cvat">Scan</span></b>
        <small id="sr-sub">Kiểm tra chất lượng nhãn</small>
      </div>
      <button class="x" id="sr-close" title="Đóng panel" aria-label="Đóng">✕</button>
    </header>
    <div class="body" id="sr-body"></div>
  </section>`;
  const $ = (id) => root.getElementById(id);
  const body = $('sr-body');
  const state = {
    user: null,
    scan: null,
    busy: false,
    progress: { percent: 0, message: '', stage: 'idle' },
    activeTab: 'all',
    error: '',
    history: [],
    dismissedRisks: new Set(),
    hideSunkMarkers: false,
    frameFilter: 'current',
  };

  const panel = $('sr-panel');
  const setOpen = (open) => {
    panel.classList.toggle('open', open);
    const btn = document.getElementById(BTN_ID);
    if (btn) { btn.style.background = open ? '#e6f7ff' : ''; btn.style.color = open ? '#1890ff' : '#595959'; btn.style.border = open ? '1px solid #91d5ff' : 'none'; }
    if (open) boot();
  };
  const toggle = () => setOpen(!panel.classList.contains('open'));

  // The button lives in CVAT's own vertical toolbar (left of the canvas). CVAT is a React app
  // that re-renders and navigates without reloads, so an observer puts the button back
  // whenever the toolbar appears or loses it. It is added after React's children, as the last item.
  const BTN_ID = 'smartreview-toolbar-btn';
  const ICON = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M8.8 12.2l2.2 2.2 4.4-4.6"/></svg>`;
  function mountButton() {
    // Ant's Layout.Sider wraps its content in .ant-layout-sider-children; the button goes in there.
    const sider = document.querySelector('.cvat-canvas-controls-sidebar, .cvat-canvas3d-controls-sidebar') || (jobFromUrl() ? document.querySelector('.cvat-annotation-header') : null);
    const bar = sider && (sider.querySelector(':scope > .ant-layout-sider-children') || sider);
    if (!bar) {
      if (panel.classList.contains('open')) panel.classList.remove('open');
      return;
    }
    let btn = document.getElementById(BTN_ID);
    if (btn && btn.parentElement === bar && bar.lastElementChild === btn) return;
    if (!btn) {
      btn = document.createElement('div');
      btn.id = BTN_ID;
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'SmartReview Scan QA');
      btn.title = 'SmartReview Scan QA';
      btn.tabIndex = 0;
      btn.innerHTML = ICON;
      btn.style.cssText =
        'display:flex;align-items:center;justify-content:center;width:32px;height:32px;margin:4px auto;border-radius:6px;cursor:pointer;color:#595959;transition:all .15s;';
      btn.onmouseenter = () => { if (!panel.classList.contains('open')) { btn.style.background = '#f0f0f0'; btn.style.color = '#1890ff'; } };
      btn.onmouseleave = () => { if (!panel.classList.contains('open')) { btn.style.background = ''; btn.style.color = '#595959'; } };
      btn.onclick = toggle;
      btn.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle());
    }
    if (!bar.querySelector(':scope > hr.smartreview-sep')) {
      const hr = document.createElement('hr');
      hr.className = 'smartreview-sep'; hr.style.cssText = 'border:none;border-top:1px solid #e8e8e8;margin:6px 4px;';
      bar.appendChild(hr);
    }
    bar.appendChild(btn);
  }
  new MutationObserver(mountButton).observe(document.body, { childList: true, subtree: true });
  mountButton();
  $('sr-close').onclick = () => setOpen(false);

  async function boot() {
    try {
      const me = await api('/auth/me');
      state.user = me.user;
      const { scans } = await api('/cvat/scans');
      state.history = scans;
      const job = jobFromUrl();
      const last = scans.find((s) => s.job_id === job) || null;
      state.scan = last ? await api('/cvat/scans/' + last.id) : null;
      if (job) {
        try {
          const status = await api('/cvat/scan/status?job_id=' + job);
          if (status && status.active) {
            state.busy = true;
            state.progress = {
              percent: status.percent || 0,
              message: status.message || '',
              stage: status.stage || 'loading',
            };
            if (!pollTimer) pollTimer = setInterval(() => pollStatus(job), 400);
          }
        } catch {}
      }
    } catch (e) {
      if (e.status !== 401) state.error = e.message;
      state.user = null;
    }
    render();
  }

  function render() {
    $('sr-sub').textContent = state.user ? `Đăng nhập: ${state.user.username}` : 'Đăng nhập SmartReview để quét';
    if (!state.user) {
      body.innerHTML = `
        <p class="msg">Dùng tài khoản SmartReview của bạn. Phiên đăng nhập chỉ lưu trong cookie của SmartReview, không chứa token CVAT.</p>
        <form id="sr-login-form">
          <label>Tên đăng nhập<input id="sr-u" autocomplete="username" required></label>
          <label>Mật khẩu<input id="sr-p" type="password" autocomplete="current-password" required></label>
          <button class="btn" type="submit" id="sr-login">Đăng nhập</button>
        </form>
        ${state.error ? `<p class="msg err">${esc(state.error)}</p>` : ''}`;
      $('sr-u').focus();
      $('sr-login-form').onsubmit = async (e) => {
        e.preventDefault();
        state.error = '';
        $('sr-login').disabled = true;
        try {
          await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: $('sr-u').value, password: $('sr-p').value }) });
          await boot();
        } catch (e) {
          state.error = e.message;
          render();
        }
      };
      return;
    }
    const job = jobFromUrl();
    const s = state.scan;
    const hist = state.history.find((h) => s && h.id === s.id);
    body.innerHTML = `
      <form class="row" id="sr-scan-form">
        <label>Job ID CVAT<input id="sr-job" inputmode="numeric" value="${job ?? s?.job_id ?? ''}"></label>
        <button class="btn" type="submit" id="sr-scan" ${state.busy ? 'disabled' : ''}>${state.busy ? '<span class="spin"></span>Đang quét…' : s ? 'Quét lại' : 'Scan QA'}</button>
      </form>
      ${state.busy ? `
        <div class="scan-progress-box">
          <div class="scan-progress-top">
            <div class="scan-progress-title"><span class="spin"></span>Đang quét ${s?.dimension === '3d' ? '3D LiDAR' : 'Job CVAT'}…</div>
            <div class="scan-progress-percent" id="sr-progress-pct">${state.progress.percent}%</div>
          </div>
          <div class="scan-progress-track">
            <div class="scan-progress-fill" id="sr-progress-fill" style="width: ${state.progress.percent}%;"></div>
          </div>
          <div class="scan-progress-desc" id="sr-progress-msg">${esc(state.progress.message || 'Đang chuẩn bị quét...')}</div>
        </div>
      ` : ''}
      <div class="notice info">Nhớ bấm <b>Save</b> trong CVAT trước khi quét. SmartReview tự chọn <b>policy 2D hoặc 3D</b> theo job. YOLO chỉ dùng cho 2D.</div>
      ${state.error ? `<p class="msg err">${esc(state.error)}</p>` : ''}
      ${s ? `
        <div class="stats">
          <div class="stat"><b>${s.risk_count}</b><span>Cảnh báo</span></div>
          <div class="stat"><b>${s.annotation_count}</b><span>Annotation</span></div>
          <div class="stat"><b>${(s.duration_ms / 1000).toFixed(1)}<small style="font-size:11px">s</small></b><span>Thời gian</span></div>
        </div>
        <div class="meta">
        <p class="msg">Job ${s.job_id} · Engine: <b>${esc(s.engine_version || '6.0.0')}</b>
          ${hist && hist.changed === true ? ' <span class="tag changed">Annotation đã đổi</span>' : ''}
          ${hist && hist.changed === false ? ' <span class="tag same">Không đổi</span>' : ''}</p>
        ${s.dimension === '3d' ? '<p class="msg"><b>Review 3D</b> · Policy ' + esc(s.policy_version) + '</p>' : ''}
        ${(s.notes || []).map(n => '<p class="msg">' + esc(n) + '</p>').join('')}
        ${s.skipped?.length ? `<p class="msg">Bỏ qua ${s.skipped.length} mục: ${esc([...new Set(s.skipped.map((k) => k.reason))].join('; '))}</p>` : ''}
        </div>
        ${(() => {
          const allRisks = s.risks || [];
          const curFrame = currentFrame();

          // Extract unique frames with risks, sorted ascending
          const riskFrames = Array.from(new Set(allRisks.map(r => r.frame).filter(f => f != null))).sort((a, b) => a - b);
          const frameCounts = {};
          for (const r of allRisks) {
            if (r.frame != null) frameCounts[r.frame] = (frameCounts[r.frame] || 0) + 1;
          }

          // Active frame resolution
          let activeFrame = null;
          if (state.frameFilter === 'current') {
            activeFrame = curFrame != null ? curFrame : (riskFrames[0] ?? 0);
          } else if (state.frameFilter !== 'all' && state.frameFilter != null) {
            activeFrame = Number(state.frameFilter);
          }

          // Filter by active frame (keep frame-agnostic / general risks too if any)
          const frameFilteredRisks = activeFrame != null
            ? allRisks.filter(r => r.frame === activeFrame || r.frame == null || r.frame === -1)
            : allRisks;

          const policyRisks = frameFilteredRisks.filter((r) => r.source !== 'ai');
          const aiRisks = frameFilteredRisks.filter((r) => r.source === 'ai');
          const tab = state.activeTab || 'all';
          const displayedRisks = tab === 'policy' ? policyRisks : tab === 'ai' ? aiRisks : frameFilteredRisks;

          // Navigation targets
          const currentFrameIndex = activeFrame != null ? activeFrame : (curFrame ?? 0);
          const prevErrorFrame = riskFrames.filter(f => f < currentFrameIndex).pop();
          const nextErrorFrame = riskFrames.find(f => f > currentFrameIndex);

          return `
            <div class="frame-filter-box">
              <div class="frame-filter-row">
                <span style="font-size:12px;font-weight:600;color:#262626">
                  Frame:
                </span>
                <select id="sr-frame-select" class="frame-select">
                  <option value="current" ${state.frameFilter === 'current' ? 'selected' : ''}>
                    Frame hiện tại (${curFrame != null ? `Frame ${curFrame}` : 'Auto'})
                  </option>
                  <option value="all" ${state.frameFilter === 'all' ? 'selected' : ''}>
                    Tất cả các frame (${allRisks.length} cảnh báo)
                  </option>
                  <optgroup label="Danh sách frame có lỗi">
                    ${riskFrames.map(f => `
                      <option value="${f}" ${state.frameFilter === String(f) ? 'selected' : ''}>
                        Frame ${f} (${frameCounts[f]} lỗi)
                      </option>
                    `).join('')}
                  </optgroup>
                </select>
                <div class="frame-nav-btns">
                  <button class="btn-frame-nav" id="sr-prev-frame-btn" ${prevErrorFrame == null ? 'disabled' : ''} title="${prevErrorFrame != null ? `Chuyển về Frame lỗi ${prevErrorFrame}` : 'Không có frame lỗi phía trước'}">
                    Trước
                  </button>
                  <button class="btn-frame-nav" id="sr-next-frame-btn" ${nextErrorFrame == null ? 'disabled' : ''} title="${nextErrorFrame != null ? `Chuyển sang Frame lỗi ${nextErrorFrame}` : 'Không có frame lỗi tiếp theo'}">
                    Tiếp
                  </button>
                </div>
              </div>
              <div class="frame-status-banner">
                ${activeFrame != null ? `
                  <span>Đang xem <b>Frame ${activeFrame}</b> · <b>${frameFilteredRisks.length}</b> cảnh báo</span>
                  ${frameFilteredRisks.length === 0 ? '<span class="frame-clean-badge">Frame sạch, không có lỗi</span>' : `<span class="frame-error-badge">${frameFilteredRisks.length} lỗi cần sửa</span>`}
                ` : `
                  <span>Đang xem <b>Toàn bộ Job</b> (${allRisks.length} cảnh báo trên ${riskFrames.length} frame)</span>
                `}
              </div>
            </div>

            <div class="tabs-bar">
              <button class="tab-item ${tab === 'all' ? 'active' : ''}" data-tab="all">
                Tất cả <span class="tab-count">${frameFilteredRisks.length}</span>
              </button>
              <button class="tab-item ${tab === 'policy' ? 'active' : ''}" data-tab="policy">
                Lỗi Policy <span class="tab-count count-policy">${policyRisks.length}</span>
              </button>
              <button class="tab-item ${tab === 'ai' ? 'active' : ''}" data-tab="ai">
                Lỗi AI quét <span class="tab-count count-ai">${aiRisks.length}</span>
              </button>
            </div>

            <div class="risk-bar">
              <span style="font-size:12px;color:rgba(0,0,0,0.45);font-weight:500">
                ${activeFrame != null ? `Frame ${activeFrame} · ` : ''}${tab === 'policy' ? `Lỗi Policy (${policyRisks.length})` : tab === 'ai' ? `Lỗi AI quét (${aiRisks.length})` : `Cảnh báo (${frameFilteredRisks.length})`}
              </span>
              ${s.risks.some(r => getSunkenDepth(r) > 0) ? `
                <button class="btn-subtle ${state.hideSunkMarkers ? 'active' : ''}" id="sr-toggle-all-sunk" title="Bật/tắt hiển thị box đỏ chìm đất trên toàn bộ canvas 3D">
                  ${state.hideSunkMarkers ? 'Hiện tất cả box đỏ' : 'Tắt tất cả box đỏ'}
                </button>
              ` : ''}
            </div>

            ${displayedRisks.length ? `
              <ul>${displayedRisks.map((r) => {
                const origIndex = s.risks.indexOf(r);
                const hasSunk = getSunkenDepth(r) > 0;
                const rKey = getRiskKey(r);
                const isDismissed = state.dismissedRisks.has(rKey);
                return `
                <li class="risk ${isDismissed ? 'resolved' : ''}" data-i="${origIndex}" title="Bấm để di chuyển camera đến đối tượng">
                  <div class="top">
                    <span class="title">
                      ${r.source === 'ai' ? (r.geometry_type === 'cuboid' || r.cuboid ? '<span class="badge-pp">POINTPILLARS 3D</span>' : '<span class="badge-ai">YOLO AI</span>') : '<span class="badge-rule">POLICY</span>'}
                      <b>Frame ${r.frame}</b>
                      ${r.object_id != null ? `<span class="badge-obj">#${esc(r.object_id)} ${esc(r.label)}</span>` : `<span class="badge-missing">[Chưa có box: ${esc(r.label)}]</span>`}
                      ${r.confidence ? `<small style="color:rgba(0,0,0,0.45);font-size:11px">${Math.round(r.confidence * 100)}%</small>` : ''}
                    </span>
                    <span class="tag tag-${esc(r.severity)}">${esc(r.severity)} ${Math.round(r.score)}</span>
                  </div>
                  <p>${esc(r.reasons.join('; ') || r.check_ids.join(', '))}</p>
                  ${r.cuboid ? `<p class="msg">Cuboid 3D · tâm (${r.cuboid.center.map(v => Number(v).toFixed(2)).join(', ')}) m · kích thước ${r.cuboid.size.map(v => Number(v).toFixed(2)).join(' × ')} m · hướng ${(r.cuboid.heading * 180 / Math.PI).toFixed(1)}°</p>` : ''}
                  ${hasSunk ? `<p class="msg" style="color:${isDismissed ? '#8c8c8c' : '#cf1322'};margin-top:2px">
                    ${isDismissed ? 'Đã tắt box đỏ cảnh báo trên canvas 3D.' : `<b>Phần âm dưới đất (${getSunkenDepth(r).toFixed(2)} m)</b> được tô đỏ trong 3D & hình chiếu Side/Front.`}
                  </p>` : r.object_id == null ? `<p class="msg" style="color:${isDismissed ? '#8c8c8c' : '#d46b08'};margin-top:2px">
                    ${isDismissed ? 'Đã xử lý (đã thêm box hoặc bỏ qua).' : `Bấm vào thẻ để camera bay đến vị trí AI phát hiện.`}
                  </p>` : ''}
                  ${hasSunk || r.object_id == null ? `<div class="actions">
                      ${hasSunk ? `
                        <button class="btn-sunk-toggle ${isDismissed ? 'is-resolved' : ''}" data-toggle-i="${origIndex}" title="${isDismissed ? 'Bấm để bật lại box đỏ cảnh báo' : 'Anno đã sửa xong: bấm để tắt box đỏ cảnh báo chìm đất'}">
                          ${isDismissed ? 'Đã sửa (Tắt đỏ)' : 'Tắt box đỏ'}
                        </button>
                      ` : `
                        <button class="btn-sunk-toggle ${isDismissed ? 'is-resolved' : ''}" data-toggle-i="${origIndex}" title="${isDismissed ? 'Bấm để hiện lại cảnh báo' : 'Bấm để đánh dấu đã thêm box hoặc bỏ qua'}">
                          ${isDismissed ? 'Đã thêm box' : 'Bỏ qua'}
                        </button>
                      `}
                    </div>` : ''}
                </li>`;
              }).join('')}</ul>`
              : `<div class="empty-state">${activeFrame != null ? `Frame ${activeFrame} sạch sẽ, không có cảnh báo nào.` : tab === 'policy' ? 'Không phát hiện lỗi vi phạm Policy rules nào.' : tab === 'ai' ? 'Mô hình AI không phát hiện điểm bất thường nào.' : 'Không phát hiện rủi ro nào.'}</div>`
            }
          `;
        })()}` : ''}`;
    $('sr-job').oninput = (e) => (e.target.value = e.target.value.replace(/\D/g, ''));
    const scanForm = $('sr-scan-form');
    if (scanForm) {
      scanForm.onsubmit = (e) => {
        e.preventDefault();
        if (!state.busy) scan();
      };
    }
    const scanBtn = $('sr-scan');
    if (scanBtn) scanBtn.onclick = scan;
    const frameSelect = $('sr-frame-select');
    if (frameSelect) {
      frameSelect.onchange = (e) => {
        state.frameFilter = e.target.value;
        if (state.frameFilter !== 'all' && state.frameFilter !== 'current') {
          setFrame(Number(state.frameFilter));
        }
        render();
      };
    }
    const prevBtn = $('sr-prev-frame-btn');
    if (prevBtn) {
      prevBtn.onclick = () => {
        const allRisks = s?.risks || [];
        const riskFrames = Array.from(new Set(allRisks.map(r => r.frame).filter(f => f != null))).sort((a, b) => a - b);
        const cur = currentFrame() ?? 0;
        const target = riskFrames.filter(f => f < cur).pop();
        if (target != null) {
          setFrame(target);
          if (state.frameFilter !== 'all') state.frameFilter = 'current';
          render();
        }
      };
    }
    const nextBtn = $('sr-next-frame-btn');
    if (nextBtn) {
      nextBtn.onclick = () => {
        const allRisks = s?.risks || [];
        const riskFrames = Array.from(new Set(allRisks.map(r => r.frame).filter(f => f != null))).sort((a, b) => a - b);
        const cur = currentFrame() ?? 0;
        const target = riskFrames.find(f => f > cur);
        if (target != null) {
          setFrame(target);
          if (state.frameFilter !== 'all') state.frameFilter = 'current';
          render();
        }
      };
    }
    root.querySelectorAll('.tab-item').forEach((btn) => {
      btn.onclick = () => {
        state.activeTab = btn.dataset.tab;
        render();
      };
    });
    const toggleAllBtn = $('sr-toggle-all-sunk');
    if (toggleAllBtn) {
      toggleAllBtn.onclick = () => {
        state.hideSunkMarkers = !state.hideSunkMarkers;
        const c3d = getCanvas3DInstance();
        if (c3d) {
          if (state.hideSunkMarkers) {
            clearSunkMarkers(c3d);
            c3d.render();
          } else {
            updateSunkMarkersForCurrentFrame(c3d, state.scan);
          }
        }
        render();
      };
    }
    root.querySelectorAll('.btn-sunk-toggle').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.toggleI);
        const r = s?.risks?.[idx];
        if (!r) return;
        const key = getRiskKey(r);
        const markerId = getMarkerId(r);
        if (state.dismissedRisks.has(key)) {
          state.dismissedRisks.delete(key);
        } else {
          state.dismissedRisks.add(key);
        }
        const c3d = getCanvas3DInstance();
        if (c3d) {
          if (state.dismissedRisks.has(key)) {
            removeSunkMarker(c3d, markerId);
          } else {
            updateSunkMarkersForCurrentFrame(c3d, state.scan);
          }
        }
        render();
      };
    });
    root.querySelectorAll('.risk').forEach((el) => {
      el.onclick = () => jump(s.job_id, s.risks[Number(el.dataset.i)]);
    });
  }

  let pollTimer = null;
  async function pollStatus(jobId) {
    try {
      const res = await api(`/cvat/scan/status?job_id=${jobId}`);
      if (res && res.active) {
        state.progress = {
          percent: res.percent || 0,
          message: res.message || '',
          stage: res.stage || 'loading',
        };
        const pPct = $('sr-progress-pct');
        const pFill = $('sr-progress-fill');
        const pMsg = $('sr-progress-msg');
        if (pPct) pPct.textContent = `${state.progress.percent}%`;
        if (pFill) pFill.style.width = `${state.progress.percent}%`;
        if (pMsg) pMsg.textContent = state.progress.message;
      }
    } catch {}
  }

  async function scan() {
    const id = Number($('sr-job').value);
    if (!id) return;
    state.busy = true;
    state.progress = { percent: 5, message: 'Đang bắt đầu quét...', stage: 'loading' };
    state.error = '';
    state.dismissedRisks.clear();
    render();

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => pollStatus(id), 400);

    try {
      state.scan = await api('/cvat/scan', { method: 'POST', body: JSON.stringify({ job_id: id }) });
      state.history = (await api('/cvat/scans')).scans;
      state.progress = { percent: 100, message: 'Hoàn thành!', stage: 'done' };
      setTimeout(() => {
        const c3d = getCanvas3DInstance();
        if (c3d) updateSunkMarkersForCurrentFrame(c3d, state.scan);
      }, 350);
    } catch (e) {
      if (e.status === 401) state.user = null;
      state.error = e.message;
    } finally {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      state.busy = false;
      render();
    }
  }

  // ---- jump to a risk: change frame inside CVAT, find the shape, highlight it ----
  const style = document.createElement('style');
  style.textContent = `
    @keyframes sr-pulse { 0%,100% { stroke-width: 2px; filter: drop-shadow(0 0 0 #ff4d6d); } 50% { stroke-width: 5px; filter: drop-shadow(0 0 10px #ff4d6d); } }
    .sr-flash { stroke: #ff4d6d !important; stroke-width: 4px !important; fill: rgba(255,77,109,.18) !important; animation: sr-pulse .8s ease-in-out 1; }
    .sr-flash-missing { stroke: #faad14 !important; stroke-width: 3px !important; stroke-dasharray: 6 3 !important; fill: rgba(250,173,20,.22) !important; animation: sr-pulse .8s ease-in-out 3; }
    @keyframes sr-pulse-border {
      0% { box-shadow: 0 0 0 0 rgba(255, 24, 68, 0); border-color: rgba(0,0,0,0.12); }
      25% { box-shadow: 0 0 14px 4px rgba(255, 24, 68, 0.85); border-color: #ff1844; }
      50% { box-shadow: 0 0 0 0 rgba(255, 24, 68, 0); border-color: rgba(0,0,0,0.12); }
      75% { box-shadow: 0 0 14px 4px rgba(255, 24, 68, 0.85); border-color: #ff1844; }
      100% { box-shadow: 0 0 0 0 rgba(255, 24, 68, 0); border-color: rgba(0,0,0,0.12); }
    }
    .sr-flash-item {
      animation: sr-pulse-border 1.2s ease-in-out 1 !important;
      border: 2px solid #ff1844 !important;
      background-color: rgba(255, 24, 68, 0.1) !important;
    }`;
  document.head.appendChild(style);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const PENDING = 'smartreview-pending-jump';

  function setFrame(frame) {
    const input = document.querySelector('.cvat-player-frame-selector input');
    if (!input) return false;
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(frame));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // CVAT applies the typed value on Enter, once React has re-rendered with it.
    setTimeout(() => {
      for (const type of ['keydown', 'keyup'])
        input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }, 80);
    return true;
  }
  const currentFrame = () => {
    const input = document.querySelector('.cvat-player-frame-selector input');
    return input ? Number(input.value) : null;
  };
  // CVAT draws shapes in image pixels plus a constant canvas offset.
  function canvasOffset() {
    try {
      const content = document.getElementById('cvat_canvas_content');
      const bg = document.getElementById('cvat_canvas_background');
      const w = parseFloat(content.getAttribute('width') || content.style.width);
      const bw = parseFloat(bg.style.width || bg.getAttribute('width') || bg.width);
      const off = (w - bw) / 2;
      return Number.isFinite(off) ? off : 0;
    } catch {
      return 0;
    }
  }
  function findShape(bbox, objectId) {
    if (objectId != null) {
      const direct = document.getElementById('cvat_canvas_shape_' + objectId);
      if (direct) return direct;
    }
    const off = canvasOffset();
    let best = null;
    document.querySelectorAll('#cvat_canvas_content [id^="cvat_canvas_shape_"]').forEach((el) => {
      if (!/^cvat_canvas_shape_\d+$/.test(el.id)) return;
      let b;
      try {
        b = el.getBBox();
      } catch {
        return;
      }
      const err = Math.abs(b.x - off - bbox[0]) + Math.abs(b.y - off - bbox[1]) + Math.abs(b.width - bbox[2]) + Math.abs(b.height - bbox[3]);
      if (!best || err < best.err) best = { el, err };
    });
    return best && best.err < 30 ? best.el : null;
  }
  function highlightMissing(bbox) {
    const off = canvasOffset();
    const content = document.getElementById('cvat_canvas_content');
    if (!content || !bbox) return;
    const old = document.getElementById('sr-temp-missing-box');
    if (old) old.remove();
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(bbox[0] + off));
    rect.setAttribute('y', String(bbox[1] + off));
    rect.setAttribute('width', String(bbox[2]));
    rect.setAttribute('height', String(bbox[3]));
    rect.setAttribute('class', 'sr-flash-missing');
    rect.id = 'sr-temp-missing-box';
    content.appendChild(rect);
    setTimeout(() => { if (rect.parentNode) rect.remove(); }, 2500);
  }

  function highlight(el, risk) {
    if (!el && risk && risk.bbox) {
      highlightMissing(risk.bbox);
      return;
    }
    if (!el) return;
    const id = el.id.replace('cvat_canvas_shape_', '');
    const item = document.getElementById('cvat-objects-sidebar-state-item-' + id);
    if (item) {
      item.scrollIntoView({ block: 'center', behavior: 'smooth' });
      item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
    }
    el.classList.add('sr-flash');
    setTimeout(() => el.classList.remove('sr-flash'), 1000);
  }

  // ---- 3D Ground Penetration (Sinking) & Highlight helpers ----
  function getSunkenDepth(risk) {
    if (!risk) return 0;
    if (typeof risk.cuboid?.penetration_depth === 'number' && risk.cuboid.penetration_depth > 0) {
      return risk.cuboid.penetration_depth;
    }
    if (typeof risk.cuboid?.lift === 'number' && risk.cuboid.lift < 0) {
      return -risk.cuboid.lift;
    }
    if (Array.isArray(risk.evidence)) {
      for (const ev of risk.evidence) {
        if (typeof ev?.depth_m === 'number' && ev.depth_m > 0) return ev.depth_m;
        if (typeof ev?.lift_m === 'number' && ev.lift_m < 0) return -ev.lift_m;
      }
    }
    if (Array.isArray(risk.reasons)) {
      for (const r of risk.reasons) {
        const m = r.match(/chìm\s+([\d.]+)\s*m/i);
        if (m) return parseFloat(m[1]);
      }
    }
    if (risk.check_ids?.includes('box.below_ground')) {
      return 0.3;
    }
    return 0;
  }

  let CachedMeshCtor = null;
  let CachedGeom = null;
  let CachedMatCtor = null;
  let CachedLineCtor = null;
  let CachedWireGeom = null;
  let CachedLineMatCtor = null;

  function ensureThreeCached(canvas3d) {
    if (CachedMeshCtor && CachedGeom && CachedMatCtor && CachedLineCtor && CachedWireGeom && CachedLineMatCtor) {
      return true;
    }
    const cube = canvas3d?.view?.cube;
    if (cube?.perspective && cube?.wireframe) {
      CachedMeshCtor = CachedMeshCtor || cube.perspective.constructor;
      CachedGeom = CachedGeom || cube.perspective.geometry;
      CachedMatCtor = CachedMatCtor || cube.perspective.material?.constructor;
      CachedLineCtor = CachedLineCtor || cube.wireframe.constructor;
      CachedWireGeom = CachedWireGeom || cube.wireframe.geometry;
      CachedLineMatCtor = CachedLineMatCtor || cube.wireframe.material?.constructor;
      if (CachedMeshCtor && CachedGeom) return true;
    }
    const drawn = canvas3d?.view?.drawnObjects || {};
    for (const k of Object.keys(drawn)) {
      const cuboid = drawn[k]?.cuboid;
      if (cuboid?.perspective && cuboid?.wireframe) {
        CachedMeshCtor = CachedMeshCtor || cuboid.perspective.constructor;
        CachedGeom = CachedGeom || cuboid.perspective.geometry;
        CachedMatCtor = CachedMatCtor || cuboid.perspective.material?.constructor;
        CachedLineCtor = CachedLineCtor || cuboid.wireframe.constructor;
        CachedWireGeom = CachedWireGeom || cuboid.wireframe.geometry;
        CachedLineMatCtor = CachedLineMatCtor || cuboid.wireframe.material?.constructor;
        if (CachedMeshCtor && CachedGeom) return true;
      }
    }
    return Boolean(CachedMeshCtor && CachedGeom);
  }

  function getMarkerId(risk) {
    return risk?.object_id != null ? String(risk.object_id) : `f${risk?.frame}_${risk?.label || 'obj'}`;
  }

  function getRiskKey(risk) {
    return `${risk?.frame}_${getMarkerId(risk)}`;
  }

  function clearSunkMarkers(canvas3d) {
    if (!canvas3d?.view?.views) return;
    for (const vName of ['perspective', 'top', 'side', 'front']) {
      const scene = canvas3d.view.views[vName]?.scene;
      if (!scene) continue;
      const toRemove = [];
      scene.traverse((obj) => {
        if (obj.name && obj.name.startsWith('smartreview_sunk_')) {
          toRemove.push(obj);
        }
      });
      for (const obj of toRemove) {
        if (obj.parent) obj.parent.remove(obj);
        if (obj.material && typeof obj.material.dispose === 'function') obj.material.dispose();
      }
    }
  }

  function removeSunkMarker(canvas3d, markerId) {
    if (!canvas3d?.view?.views || !markerId) return;
    const pMesh = `smartreview_sunk_mesh_${markerId}`;
    const pWire = `smartreview_sunk_wire_${markerId}`;
    for (const vName of ['perspective', 'top', 'side', 'front']) {
      const scene = canvas3d.view.views[vName]?.scene;
      if (!scene) continue;
      const toRemove = [];
      scene.traverse((obj) => {
        if (obj.name === pMesh || obj.name === pWire) {
          toRemove.push(obj);
        }
      });
      for (const obj of toRemove) {
        if (obj.parent) obj.parent.remove(obj);
        if (obj.material && typeof obj.material.dispose === 'function') obj.material.dispose();
      }
    }
    canvas3d.render();
  }

  function updateSunkMarkersForCurrentFrame(canvas3d, scan) {
    if (!canvas3d?.view?.views || !scan?.risks) return;
    clearSunkMarkers(canvas3d);

    if (state.hideSunkMarkers) {
      canvas3d.render();
      return;
    }

    const frame = currentFrame();
    if (frame == null) return;

    const sunkenRisks = scan.risks.filter((r) => {
      if (r.frame !== frame || getSunkenDepth(r) <= 0 || !r.cuboid?.center) return false;
      const rKey = getRiskKey(r);
      if (state.dismissedRisks.has(rKey)) return false;
      return true;
    });
    if (!sunkenRisks.length) {
      canvas3d.render();
      return;
    }

    ensureThreeCached(canvas3d);

    for (const r of sunkenRisks) {
      const [cx, cy, cz] = r.cuboid.center;
      const [sx, sy, sz] = r.cuboid.size;
      const heading = r.cuboid.heading || 0;
      const depth = Math.min(sz, getSunkenDepth(r));
      if (depth <= 0.01) continue;

      const sunkCenterZ = cz - sz / 2 + depth / 2;
      const markerId = getMarkerId(r);

      for (const vName of ['perspective', 'side', 'front', 'top']) {
        const scene = canvas3d.view.views[vName]?.scene;
        if (!scene) continue;

        if (CachedMeshCtor && CachedGeom && CachedMatCtor) {
          const mat = new CachedMatCtor({
            color: 0xff002b,
            transparent: true,
            opacity: 0.65,
            wireframe: false,
            depthTest: true,
          });
          const mesh = new CachedMeshCtor(CachedGeom, mat);
          mesh.name = `smartreview_sunk_mesh_${markerId}`;
          mesh.scale.set(sx, sy, depth);
          mesh.position.set(cx, cy, sunkCenterZ);
          mesh.rotation.set(0, 0, heading);
          mesh.renderOrder = 2;
          scene.add(mesh);
        }

        if (CachedLineCtor && CachedWireGeom && CachedLineMatCtor) {
          const lineMat = new CachedLineMatCtor({
            color: 0xff002b,
            linewidth: 3,
          });
          const wire = new CachedLineCtor(CachedWireGeom, lineMat);
          wire.name = `smartreview_sunk_wire_${markerId}`;
          wire.scale.set(sx, sy, depth);
          wire.position.set(cx, cy, sunkCenterZ);
          wire.rotation.set(0, 0, heading);
          wire.renderOrder = 3;
          scene.add(wire);
        }
      }
    }

    canvas3d.render();
  }

  // ---- 3D Camera & Highlight helpers ----
  function getCvatReduxStore() {
    const targets = [
      document.getElementById('root'),
      document.querySelector('.cvat-app'),
      document.querySelector('.cvat-canvas3d-perspective'),
      document.querySelector('.cvat-annotation-header'),
      document.body.firstElementChild,
    ].filter(Boolean);

    for (const el of targets) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
      if (!key) continue;
      const queue = [el[key]];
      let visited = 0;
      while (queue.length && visited < 300) {
        visited++;
        const node = queue.shift();
        if (!node) continue;
        if (node.memoizedProps?.store?.getState) return node.memoizedProps.store;
        if (node.stateNode?.store?.getState) return node.stateNode.store;
        if (node.child) queue.push(node.child);
        if (node.sibling) queue.push(node.sibling);
      }
    }
    return null;
  }

  function getCanvas3DInstance() {
    const store = getCvatReduxStore();
    if (store) {
      const state = store.getState();
      const inst = state?.annotation?.canvas?.instance;
      if (inst && (inst.views?.perspective || inst.view?.views?.perspective || inst.view?.drawnObjects)) return inst;
    }
    return null;
  }

  function find3DState(states, risk) {
    if (!states || !states.length) return null;
    const rawId = risk.object_id != null ? String(risk.object_id).replace(/^(shape|track):/, '') : null;
    // 1. By serverID or parentID
    if (rawId != null) {
      const match = states.find((s) => String(s.serverID) === rawId || String(s.parentID) === rawId);
      if (match) return match;
    }
    // 2. By clientID
    if (rawId != null) {
      const match = states.find((s) => String(s.clientID) === rawId);
      if (match) return match;
    }
    // 3. By cuboid center coordinate closeness
    if (risk.cuboid?.center) {
      const [rx, ry, rz] = risk.cuboid.center;
      let best = null;
      let minDiff = Infinity;
      for (const s of states) {
        if (s.points && s.points.length >= 3) {
          const dx = s.points[0] - rx, dy = s.points[1] - ry, dz = s.points[2] - rz;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 1.0 && dist < minDiff) {
            minDiff = dist;
            best = s;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  let missingGuideTimeout = null;
  const missingGuideIntervals = [];

  function clearMissing3DGuide(canvas3d) {
    if (missingGuideTimeout) {
      clearTimeout(missingGuideTimeout);
      missingGuideTimeout = null;
    }
    while (missingGuideIntervals.length) {
      clearTimeout(missingGuideIntervals.pop());
    }
    if (!canvas3d?.view?.views) return;
    for (const vName of ['perspective', 'top', 'side', 'front']) {
      const scene = canvas3d.view.views[vName]?.scene;
      if (!scene) continue;
      const toRemove = [];
      scene.traverse((obj) => {
        if (obj.name && obj.name.startsWith('smartreview_missing_')) toRemove.push(obj);
      });
      for (const obj of toRemove) {
        if (obj.parent) obj.parent.remove(obj);
        if (obj.material?.dispose) obj.material.dispose();
      }
    }
  }

  function flashMissing3DGuide(canvas3d, cuboid) {
    if (!canvas3d?.view?.views || !cuboid?.center || !cuboid?.size) return;
    ensureThreeCached(canvas3d);
    if (!CachedMeshCtor || !CachedGeom || !CachedMatCtor) {
      console.warn('SmartReview: Three.js constructors not ready yet for missing 3D guide');
      return;
    }

    clearMissing3DGuide(canvas3d);

    const [cx, cy, cz] = cuboid.center;
    const [sx, sy, sz] = cuboid.size;
    const heading = cuboid.heading || 0;

    // Pulse 1 Initial (0ms): High-visibility warning alert
    const mat = new CachedMatCtor({
      color: 0xff1844,
      transparent: true,
      opacity: 0.70,
      wireframe: false,
      depthTest: true,
    });

    const lineMat = CachedLineMatCtor ? new CachedLineMatCtor({
      color: 0xff1844,
      linewidth: 3,
    }) : null;

    for (const vName of ['perspective', 'top', 'side', 'front']) {
      const scene = canvas3d.view.views[vName]?.scene;
      if (!scene) continue;

      const mesh = new CachedMeshCtor(CachedGeom, mat);
      mesh.name = 'smartreview_missing_mesh';
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(cx, cy, cz);
      mesh.rotation.set(0, 0, heading);
      mesh.renderOrder = 4;
      scene.add(mesh);

      if (CachedLineCtor && CachedWireGeom && lineMat) {
        const wire = new CachedLineCtor(CachedWireGeom, lineMat);
        wire.name = 'smartreview_missing_wire';
        wire.scale.set(sx, sy, sz);
        wire.position.set(cx, cy, cz);
        wire.rotation.set(0, 0, heading);
        wire.renderOrder = 5;
        scene.add(wire);
      }
    }

    canvas3d.render();

    // Pulse 1: Dim down (260ms)
    missingGuideIntervals.push(setTimeout(() => {
      try {
        mat.color.setHex(0xfa8c16);
        mat.opacity = 0.15;
        mat.needsUpdate = true;
        if (lineMat) {
          lineMat.color.setHex(0xfa8c16);
          lineMat.needsUpdate = true;
        }
        canvas3d.render();
      } catch {}
    }, 260));

    // Pulse 2: Bright Flash (480ms)
    missingGuideIntervals.push(setTimeout(() => {
      try {
        mat.color.setHex(0xff1844);
        mat.opacity = 0.70;
        mat.needsUpdate = true;
        if (lineMat) {
          lineMat.color.setHex(0xff1844);
          lineMat.needsUpdate = true;
        }
        canvas3d.render();
      } catch {}
    }, 480));

    // Pulse 2: Settle into semi-transparent guide mode (740ms)
    missingGuideIntervals.push(setTimeout(() => {
      try {
        mat.color.setHex(0xfa8c16);
        mat.opacity = 0.38;
        mat.needsUpdate = true;
        if (lineMat) {
          lineMat.color.setHex(0xffa940);
          lineMat.needsUpdate = true;
        }
        canvas3d.render();
      } catch {}
    }, 740));

    // Auto cleanup after 5000ms
    missingGuideTimeout = setTimeout(() => {
      clearMissing3DGuide(canvas3d);
      canvas3d.render();
    }, 5000);
  }

  function flash3DCuboid(canvas3d, clientID) {
    const cuboid = canvas3d?.view?.drawnObjects?.[clientID]?.cuboid;
    if (!cuboid) return;

    try {
      const origWireColor = '#' + (cuboid.wireframe?.material?.color?.getHexString?.() || 'ffffff');
      const origFaceColor = '#' + (cuboid.perspective?.material?.color?.getHexString?.() || 'ffffff');
      const origOpacity = (cuboid.perspective?.material?.opacity ?? 0.4) * 100;

      // Pulse 1: Bright red warning (0ms)
      cuboid.setColor('#ff1844');
      cuboid.setOpacity(90);
      canvas3d.render();

      // Pulse 1: Dim down (260ms)
      setTimeout(() => {
        try {
          cuboid.setColor(origWireColor);
          cuboid.setOpacity(Math.max(12, origOpacity * 0.3));
          canvas3d.render();
        } catch {}
      }, 260);

      // Pulse 2: Bright red warning (480ms)
      setTimeout(() => {
        try {
          cuboid.setColor('#ff1844');
          cuboid.setOpacity(90);
          canvas3d.render();
        } catch {}
      }, 480);

      // Pulse 2: Settle / restore original colors (740ms)
      setTimeout(() => {
        try {
          cuboid.setColor(origWireColor);
          cuboid.setOpacity(origOpacity);
          canvas3d.render();
        } catch {}
      }, 740);
    } catch (e) {
      console.warn('flash3DCuboid error:', e);
    }
  }

  function flashSidebarItem(clientID) {
    if (clientID == null) return;
    const item = document.getElementById('cvat-objects-sidebar-state-item-' + clientID);
    if (item) {
      item.scrollIntoView({ block: 'center', behavior: 'smooth' });
      item.classList.add('sr-flash-item');
      setTimeout(() => item.classList.remove('sr-flash-item'), 1300);
      item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    }
  }

  async function show3D(risk) {
    // 1. Check if frame change is needed and wait for full Redux/canvas load
    const targetFrame = risk.frame;
    if (currentFrame() !== targetFrame) {
      setFrame(targetFrame);
      for (let i = 0; i < 50; i++) {
        const store = getCvatReduxStore();
        const ann = store?.getState()?.annotation;
        const playerFrame = ann?.player?.frame;
        const isFetching = playerFrame?.fetching || ann?.annotations?.fetching;
        if (!isFetching && (playerFrame?.number === targetFrame || currentFrame() === targetFrame)) {
          break;
        }
        await sleep(100);
      }
      await sleep(250); // Allow Three.js to construct drawnObjects
    }

    // 2. Poll for canvas3d instance and targetState on active frame
    let canvas3d = null;
    let targetState = null;
    let clientID = null;

    for (let i = 0; i < 40; i++) {
      canvas3d = getCanvas3DInstance();
      const store = getCvatReduxStore();
      const states = store?.getState()?.annotation?.annotations?.states;
      if (states && states.length) {
        targetState = find3DState(states, risk);
        if (targetState) {
          clientID = targetState.clientID;
          if (canvas3d?.view?.drawnObjects?.[clientID]) {
            break;
          }
        }
      }
      if (canvas3d && risk.object_id == null && risk.cuboid?.center) {
        break; // Missing object detected by PointPillars AI
      }
      await sleep(120);
    }

    if (!canvas3d) return;

    ensureThreeCached(canvas3d);

    // 3. Coordinate calculation
    const center = (targetState?.points?.length >= 3 ? targetState.points.slice(0, 3) : null) || risk.cuboid?.center;
    const size = (targetState?.points?.length >= 9 ? [targetState.points[6], targetState.points[7], targetState.points[8]] : null) || risk.cuboid?.size || [4.5, 2.0, 1.6];
    const heading = (targetState?.points?.length >= 6 ? targetState.points[5] : null) ?? risk.cuboid?.heading ?? 0;

    const drawnCuboid = clientID != null ? canvas3d.view?.drawnObjects?.[clientID]?.cuboid : null;

    if (clientID != null && drawnCuboid) {
      // ---- A. OBJECT EXISTS: Use CVAT's native 3D camera methods ----
      try {
        // 1. Focus 3D perspective camera smoothly on the object
        if (typeof canvas3d.view?.focusObjectByClientId === 'function') {
          canvas3d.view.focusObjectByClientId(clientID, true);
        } else if (typeof canvas3d.view?.fitObject === 'function') {
          canvas3d.view.fitObject(drawnCuboid, true);
        }

        // 2. Activate object: CVAT automatically centers Top, Side, Front views on object!
        canvas3d.activate(clientID);

        // 3. Highlight in sidebar
        flashSidebarItem(clientID);

        // 4. Flash 3D cuboid warning pulses
        flash3DCuboid(canvas3d, clientID);
      } catch (e) {
        console.warn('CVAT 3D object focus error:', e);
      }
    } else if (center) {
      // ---- B. MISSING OBJECT (or object not yet in drawnObjects) ----
      const [cx, cy, cz] = center;
      const pCam = canvas3d.view?.views?.perspective;
      const maxDim = Math.max(...size);
      const dist = Math.max(7, Math.min(22, maxDim * 2.5));

      // Position perspective camera to look at center
      if (pCam?.controls?.setLookAt) {
        try {
          pCam.controls.setLookAt(
            cx - dist * 0.7,
            cy - dist * 0.7,
            cz + dist * 0.55,
            cx, cy, cz,
            true
          );
        } catch (e) {
          console.warn('setLookAt perspective error:', e);
        }
      }

      // Position orthogonal views (top, side, front) to the coordinates without breaking zoom
      const cameraSettings = canvas3d.view?.cameraSettings || {
        top: { position: [0, 0, 8] },
        side: { position: [0, -8, 0] },
        front: { position: [8, 0, 0] },
      };

      for (const v of ['top', 'side', 'front']) {
        const view = canvas3d.view?.views?.[v];
        const offset = cameraSettings[v]?.position || [0, 0, 8];
        if (view?.controls?.setLookAt) {
          try {
            view.controls.setLookAt(
              cx + offset[0],
              cy + offset[1],
              cz + offset[2],
              cx, cy, cz,
              false
            );
          } catch {}
        } else if (view?.camera) {
          view.camera.position.set(cx + offset[0], cy + offset[1], cz + offset[2]);
          view.camera.lookAt(cx, cy, cz);
        }
      }

      // Flash guide cuboid at the missing object location
      flashMissing3DGuide(canvas3d, risk.cuboid || { center, size, heading });
    }

    canvas3d.render();

    // 4. Update subtitle status
    const sub = $('sr-sub');
    if (sub) {
      sub.textContent = `Frame ${risk.frame} · #${risk.object_id ?? 'AI'} ${risk.label || ''} · ${risk.reasons?.[0] || ''}`;
    }

    // 5. Refresh sunken markers for current frame
    if (state.scan) {
      updateSunkMarkersForCurrentFrame(canvas3d, state.scan);
    }
  }

  async function jump(job, risk) {
    const frame = risk.frame;
    if (frame == null) return;
    if (jobFromUrl() !== job) {
      // Another job: open it at that frame; the highlight resumes when the page has loaded.
      sessionStorage.setItem(PENDING, JSON.stringify({ job, risk, at: Date.now() }));
      const url = new URL(location.href);
      url.pathname = url.pathname.replace(/\/jobs\/\d+/, '/jobs/' + job);
      url.searchParams.set('frame', String(frame));
      location.href = url.toString();
      return;
    }
    await show(risk);
  }

  async function show(risk) {
    if (currentFrame() !== risk.frame && !setFrame(risk.frame)) {
      state.error = 'Chưa mở màn annotate của CVAT nên không nhảy frame được.';
      return render();
    }
    const sub = $('sr-sub');
    if (sub) {
      sub.textContent = `Frame ${risk.frame} · #${risk.object_id ?? 'AI'} ${risk.label || ''} · ${risk.reasons?.[0] || ''}`;
    }
    if (risk.geometry_type === 'cuboid' || risk.cuboid || document.querySelector('.cvat-canvas3d-perspective')) {
      await show3D(risk);
      return;
    }
    if (!risk.bbox) return;
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      if (currentFrame() !== risk.frame) continue;
      if (risk.object_id == null) {
        highlight(null, risk);
        return;
      }
      const el = findShape(risk.bbox, risk.object_id);
      if (el) return highlight(el, risk);
    }
  }

  // After a jump that needed a reload.
  (async () => {
    let pending;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING) || 'null');
    } catch {}
    if (!pending) return;
    sessionStorage.removeItem(PENDING);
    if (Date.now() - pending.at > 60000 || pending.job !== jobFromUrl()) return;
    for (let i = 0; i < 80 && !document.querySelector('#cvat_canvas_content [id^="cvat_canvas_shape_"]') && !document.querySelector('.cvat-canvas3d-perspective'); i++) await sleep(200);
    await show(pending.risk);
  })();

  // Watch for frame changes to ensure sunken boxes stay rendered on active frame and panel frame filter updates
  let lastObservedFrame = null;
  setInterval(() => {
    if (state.scan?.risks?.length) {
      const cur = currentFrame();
      if (cur != null && cur !== lastObservedFrame) {
        lastObservedFrame = cur;
        const c3d = getCanvas3DInstance();
        if (c3d) updateSunkMarkersForCurrentFrame(c3d, state.scan);
        if (panel.classList.contains('open') && !state.busy && state.frameFilter === 'current') {
          const jobInput = $('sr-job');
          if (!jobInput || document.activeElement !== jobInput) {
            render();
          }
        }
      }
    }
  }, 250);
})();

