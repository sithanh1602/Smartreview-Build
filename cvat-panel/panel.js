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
      width: 390px;
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
      gap: 14px;
      max-height: calc(100vh - 140px);
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
      align-items: center;
      font-size: 12px;
      font-weight: 600;
    }
    .risk .title {
      color: #262626;
      display: flex;
      align-items: center;
      gap: 6px;
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
    .badge-rule {
      background: #f0f5ff;
      color: #1d39c4;
      border: 1px solid #adc6ff;
      border-radius: 3px;
      padding: 0 5px;
      font-size: 10px;
      font-weight: 500;
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
  const state = { user: null, scan: null, busy: false, error: '', history: [] };

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
        <label>Tên đăng nhập<input id="sr-u" autocomplete="username"></label>
        <label>Mật khẩu<input id="sr-p" type="password" autocomplete="current-password"></label>
        <button class="btn" id="sr-login">Đăng nhập</button>
        ${state.error ? `<p class="msg err">${esc(state.error)}</p>` : ''}`;
      const go = async () => {
        state.error = '';
        try {
          await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: $('sr-u').value, password: $('sr-p').value }) });
          await boot();
        } catch (e) {
          state.error = e.message;
          render();
        }
      };
      $('sr-login').onclick = go;
      $('sr-p').onkeydown = (e) => e.key === 'Enter' && go();
      return;
    }
    const job = jobFromUrl();
    const s = state.scan;
    const hist = state.history.find((h) => s && h.id === s.id);
    body.innerHTML = `
      <div class="row">
        <label>Job ID CVAT<input id="sr-job" inputmode="numeric" value="${job ?? s?.job_id ?? ''}"></label>
        <button class="btn" id="sr-scan" ${state.busy ? 'disabled' : ''}>${state.busy ? '<span class="spin"></span>Đang quét…' : s ? 'Quét lại' : 'Scan QA'}</button>
      </div>
      <div class="notice info">Nhớ bấm <b>Save</b> trong CVAT trước khi quét. SmartReview tự chọn <b>policy 2D hoặc 3D</b> theo job. YOLO chỉ dùng cho 2D.</div>
      ${state.error ? `<p class="msg err">${esc(state.error)}</p>` : ''}
      ${s ? `
        <div class="stats">
          <div class="stat"><b>${s.risk_count}</b><span>Cảnh báo</span></div>
          <div class="stat"><b>${s.annotation_count}</b><span>Annotation</span></div>
          <div class="stat"><b>${(s.duration_ms / 1000).toFixed(1)}<small style="font-size:11px">s</small></b><span>Thời gian</span></div>
        </div>
        <p class="msg">Job ${s.job_id} · Engine: <b>${esc(s.engine_version || '6.0.0')}</b>
          ${hist && hist.changed === true ? ' <span class="tag changed">Annotation đã đổi</span>' : ''}
          ${hist && hist.changed === false ? ' <span class="tag same">Không đổi</span>' : ''}</p>
        ${s.dimension === '3d' ? '<p class="msg"><b>Review 3D</b> · Policy ' + esc(s.policy_version) + '</p>' : ''}
        ${(s.notes || []).map(n => '<p class="msg">' + esc(n) + '</p>').join('')}
        ${s.skipped.length ? `<p class="msg">Bỏ qua ${s.skipped.length} mục: ${esc([...new Set(s.skipped.map((k) => k.reason))].join('; '))}</p>` : ''}
        ${s.risks.length ? `<ul>${s.risks.map((r, i) => `
          <li class="risk" data-i="${i}" title="Bấm để di chuyển camera đến đối tượng và chớp sáng cảnh báo đỏ">
            <div class="top">
              <span class="title">
                ${r.source === 'ai' ? '<span class="badge-ai">YOLO AI</span>' : '<span class="badge-rule">POLICY</span>'}
                Frame ${r.frame}
                <span class="badge-obj">${r.object_id != null ? '#' + esc(r.object_id) + ' ' + esc(r.label) : '[Thiếu nhãn: ' + esc(r.label) + ']'}</span>
                ${r.confidence ? `<small style="color:rgba(0,0,0,0.45);font-size:11px">(${Math.round(r.confidence * 100)}%)</small>` : ''}
              </span>
              <span class="tag tag-${esc(r.severity)}">${esc(r.severity)} ${Math.round(r.score)}</span>
            </div>
            <p>${esc(r.reasons.join('; ') || r.check_ids.join(', '))}</p>
            ${r.cuboid ? `<p class="msg">Cuboid 3D · tâm (${r.cuboid.center.map(v => Number(v).toFixed(2)).join(', ')}) m · kích thước ${r.cuboid.size.map(v => Number(v).toFixed(2)).join(' × ')} m · hướng ${(r.cuboid.heading * 180 / Math.PI).toFixed(1)}°</p>` : ''}
          </li>`).join('')}</ul>`
          : '<p class="msg">Không phát hiện risk trong phạm vi các rule đã chạy.</p>'}` : ''}`;
    $('sr-job').oninput = (e) => (e.target.value = e.target.value.replace(/\D/g, ''));
    $('sr-scan').onclick = scan;
    root.querySelectorAll('.risk').forEach((el) => {
      el.onclick = () => jump(s.job_id, s.risks[Number(el.dataset.i)]);
    });
  }

  async function scan() {
    const id = Number($('sr-job').value);
    if (!id) return;
    state.busy = true;
    state.error = '';
    render();
    try {
      state.scan = await api('/cvat/scan', { method: 'POST', body: JSON.stringify({ job_id: id }) });
      state.history = (await api('/cvat/scans')).scans;
    } catch (e) {
      if (e.status === 401) state.user = null;
      state.error = e.message;
    }
    state.busy = false;
    render();
  }

  // ---- jump to a risk: change frame inside CVAT, find the shape, highlight it ----
  const style = document.createElement('style');
  style.textContent = `
    @keyframes sr-pulse { 0%,100% { stroke-width: 2px; filter: drop-shadow(0 0 0 #ff4d6d); } 50% { stroke-width: 5px; filter: drop-shadow(0 0 10px #ff4d6d); } }
    .sr-flash { stroke: #ff4d6d !important; stroke-width: 4px !important; fill: rgba(255,77,109,.18) !important; animation: sr-pulse .8s ease-in-out 1; }
    .sr-flash-missing { stroke: #faad14 !important; stroke-width: 3px !important; stroke-dasharray: 6 3 !important; fill: rgba(250,173,20,.22) !important; animation: sr-pulse .8s ease-in-out 1; }
    @keyframes sr-pulse-border {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255, 24, 68, 0); border-color: rgba(0,0,0,0.12); }
      50% { box-shadow: 0 0 14px 4px rgba(255, 24, 68, 0.8); border-color: #ff1844; }
    }
    .sr-flash-item {
      animation: sr-pulse-border 0.8s ease-in-out 1 !important;
      border: 2px solid #ff1844 !important;
      background-color: rgba(255, 24, 68, 0.08) !important;
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
  function findShape(bbox) {
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
    return best && best.err < 6 ? best.el : null;
  }
  function highlightMissing(bbox) {
    const off = canvasOffset();
    const content = document.getElementById('cvat_canvas_content');
    if (!content || !bbox) return;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(bbox[0] + off));
    rect.setAttribute('y', String(bbox[1] + off));
    rect.setAttribute('width', String(bbox[2]));
    rect.setAttribute('height', String(bbox[3]));
    rect.setAttribute('class', 'sr-flash-missing');
    rect.id = 'sr-temp-missing-box';
    content.appendChild(rect);
    setTimeout(() => rect.remove(), 1200);
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
    // 1. By serverID
    if (risk.object_id != null) {
      const sId = String(risk.object_id);
      const match = states.find((s) => String(s.serverID) === sId);
      if (match) return match;
    }
    // 2. By clientID
    if (risk.object_id != null) {
      const cId = String(risk.object_id);
      const match = states.find((s) => String(s.clientID) === cId);
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
          if (dist < 0.8 && dist < minDiff) {
            minDiff = dist;
            best = s;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  function flash3DCuboid(canvas3d, clientID) {
    const cuboid = canvas3d?.view?.drawnObjects?.[clientID]?.cuboid;
    if (!cuboid) return;

    try {
      const origWireColor = '#' + (cuboid.wireframe?.material?.color?.getHexString?.() || 'ffffff');
      const origFaceColor = '#' + (cuboid.perspective?.material?.color?.getHexString?.() || 'ffffff');
      const origOpacity = (cuboid.perspective?.material?.opacity ?? 0.4) * 100;

      // Flash red once: turn red, wait 700ms, then revert
      cuboid.setColor('#ff1844');
      cuboid.setOpacity(85);
      canvas3d.render();

      setTimeout(() => {
        try {
          cuboid.setColor(origWireColor);
          cuboid.setOpacity(origOpacity);
          canvas3d.render();
        } catch {}
      }, 700);
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
      setTimeout(() => item.classList.remove('sr-flash-item'), 1000);
      item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    }
  }

  async function show3D(risk) {
    // 1. Wait for frame transition
    for (let i = 0; i < 40; i++) {
      if (currentFrame() === risk.frame) break;
      await sleep(100);
    }

    // 2. Poll for canvas3d instance and drawnObjects
    let canvas3d = null;
    let targetState = null;
    for (let i = 0; i < 35; i++) {
      canvas3d = getCanvas3DInstance();
      const store = getCvatReduxStore();
      const states = store?.getState()?.annotation?.annotations?.states;
      if (states) {
        targetState = find3DState(states, risk);
      }
      if (canvas3d && (targetState || risk.cuboid?.center)) break;
      await sleep(150);
    }

    const clientID = targetState?.clientID ?? (risk.object_id != null && !isNaN(Number(risk.object_id)) ? Number(risk.object_id) : null);

    // 3. Move camera to cuboid
    let moved = false;
    if (canvas3d && clientID != null && canvas3d.view?.drawnObjects?.[clientID]) {
      try {
        canvas3d.focus(clientID);
        canvas3d.activate(clientID);
        moved = true;
      } catch (e) {
        console.warn('canvas3d.focus failed:', e);
      }
    }

    // If not in drawnObjects or missing annotation, position camera directly via positionAllViews or controls
    if (canvas3d && !moved && risk.cuboid?.center) {
      const [cx, cy, cz] = risk.cuboid.center;
      try {
        if (typeof canvas3d.view?.positionAllViews === 'function') {
          canvas3d.view.positionAllViews(cx, cy, cz, true);
          moved = true;
        } else if (canvas3d.view?.views?.perspective?.controls?.setLookAt) {
          const maxDim = Math.max(...(risk.cuboid.size || [4, 2, 2]));
          const dist = Math.max(12, maxDim * 2.8);
          canvas3d.view.views.perspective.controls.setLookAt(
            cx - dist * 0.7,
            cy - dist * 0.7,
            cz + dist * 0.6,
            cx, cy, cz,
            true
          );
          moved = true;
        }
      } catch (e) {
        console.warn('Direct 3D camera repositioning error:', e);
      }
    }

    // 4. Flash Red Warning Highlight on 3D Cuboid & in Sidebar
    if (canvas3d && clientID != null) {
      flash3DCuboid(canvas3d, clientID);
    }
    if (clientID != null) {
      flashSidebarItem(clientID);
    }

    // 5. Update subtitle status
    const sub = $('sr-sub');
    if (sub) {
      sub.textContent = `Frame ${risk.frame} · #${risk.object_id ?? ''} ${risk.label || ''} · ${risk.reasons?.[0] || ''}`;
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
    if (risk.geometry_type === 'cuboid' || risk.cuboid || document.querySelector('.cvat-canvas3d-perspective')) {
      await show3D(risk);
      return;
    }
    if (!risk.bbox) return;
    if (risk.object_id == null) { highlight(null, risk); return; }
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      if (currentFrame() !== risk.frame) continue;
      const el = findShape(risk.bbox);
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
})();

