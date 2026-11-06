/**
 * CEH Study Reference — script.js
 * Certified Ethical Hacker Exam Study Tracker
 * Browser-local, LocalStorage-backed, zero-dependency
 */

'use strict';

/* ============================================================
   CONSTANTS & STATE
   ============================================================ */
const MODULE_DATA_URL = 'assets/data/Modules-Conf.json';
const STORAGE_KEY = 'ceh_study_progress_v1';

/** Application state */
const State = {
  modules:      [],   // Loaded from JSON
  progress:     {},   // { "moduleId_topicIdx": { done: true, ts: number } }
  searchQuery:  '',
  expandedSet:  new Set(),
  activeModule: null,
};

let scrollSpyObserver = null;

/* ============================================================
   CANVAS BACKGROUND — Interactive Particle Network
   ============================================================ */

const BgCanvas = (() => {
  let canvas, ctx, animId, paused = false;
  const nodes = [];
  const mouse = { x: -9999, y: -9999 };
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NODE_COUNT = () => Math.min(60, Math.floor(window.innerWidth * window.innerHeight / 18000));
  const MAX_DIST = 140;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function createNode() {
    return {
      x:  rand(0, canvas.width),
      y:  rand(0, canvas.height),
      vx: rand(-0.25, 0.25),
      vy: rand(-0.25, 0.25),
      r:  rand(1.5, 3.5),
      opacity: rand(0.3, 0.7),
    };
  }

  function init() {
    canvas = document.getElementById('bg-canvas');
    if (!canvas || REDUCED_MOTION) return;
    ctx = canvas.getContext('2d');
    resize();

    const count = NODE_COUNT();
    for (let i = 0; i < count; i++) nodes.push(createNode());

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    window.addEventListener('touchmove', e => {
      if (e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      paused = document.hidden;
      if (!paused) tick();
    });

    tick();
  }

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function tick() {
    if (paused) return;
    animId = requestAnimationFrame(tick);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update + draw nodes
    for (const n of nodes) {
      // Mouse attraction / repulsion
      const dx = mouse.x - n.x;
      const dy = mouse.y - n.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        const force = (120 - dist) / 120 * 0.012;
        n.vx -= dx * force;
        n.vy -= dy * force;
      }

      // Velocity damping
      n.vx *= 0.995;
      n.vy *= 0.995;
      n.x += n.vx;
      n.y += n.vy;

      // Bounce walls
      if (n.x < 0 || n.x > canvas.width)  n.vx *= -1;
      if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      n.x = Math.max(0, Math.min(canvas.width,  n.x));
      n.y = Math.max(0, Math.min(canvas.height, n.y));

      // Draw node
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(124, 58, 237, ${n.opacity})`;
      ctx.fill();
    }

    // Draw connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX_DIST) {
          const alpha = (1 - d / MAX_DIST) * 0.25;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  return { init };
})();

/* ============================================================
   LOCAL STORAGE — Persistence Layer
   ============================================================ */

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },
  save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) { console.warn('Storage save failed:', e); }
  },
  clear() {
    try { localStorage.removeItem(STORAGE_KEY); }
    catch (e) { console.warn('Storage clear failed:', e); }
  },
};

/* ============================================================
   PROGRESS HELPERS
   ============================================================ */

function topicKey(moduleId, topicIdx) {
  return `${moduleId}_${topicIdx}`;
}

function getModuleProgress(mod) {
  const total     = mod.topics.length;
  const completed = mod.topics.filter((_, i) => State.progress[topicKey(mod.id, i)]).length;
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, remaining: total - completed, pct };
}

function getOverallProgress() {
  let total = 0, completed = 0;
  for (const mod of State.modules) {
    const p = getModuleProgress(mod);
    total     += p.total;
    completed += p.completed;
  }
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, remaining: total - completed, pct };
}

function getModuleStats() {
  let done = 0, inProgress = 0, notStarted = 0;
  for (const mod of State.modules) {
    const p = getModuleProgress(mod);
    if (p.pct === 100) done++;
    else if (p.completed > 0) inProgress++;
    else notStarted++;
  }
  return { done, inProgress, notStarted };
}

/* ============================================================
   DOM HELPERS
   ============================================================ */

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

function setWidth(el, pct) {
  if (el) el.style.width = pct + '%';
}

/* ============================================================
   TOAST NOTIFICATION
   ============================================================ */

function showToast(msg, type = 'info', duration = 2800) {
  const icons = { success: '✅', error: '❌', info: '💡' };
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('visible'));
  });
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ============================================================
   MODAL DIALOG
   ============================================================ */

function showModal({ icon, title, message, confirmText, onConfirm }) {
  const overlay = $('modal-overlay');
  const modal   = overlay.querySelector('.modal');

  modal.querySelector('.modal-icon').textContent = icon || '⚠️';
  modal.querySelector('h2').textContent = title;
  modal.querySelector('p').textContent  = message;

  const confirmBtn = modal.querySelector('#modal-confirm');
  confirmBtn.textContent = confirmText || 'Confirm';

  const close = () => {
    overlay.classList.remove('visible');
  };

  confirmBtn.onclick = () => { close(); onConfirm && onConfirm(); };
  modal.querySelector('#modal-cancel').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };

  overlay.classList.add('visible');
  confirmBtn.focus();
}

/* ============================================================
   SIDEBAR RENDERING
   ============================================================ */

function renderSidebar() {
  const nav = $('sidebar-nav');
  if (!nav) return;
  nav.innerHTML = '';

  for (const mod of State.modules) {
    const p    = getModuleProgress(mod);
    const done = p.pct === 100;

    const btn = document.createElement('button');
    btn.className = `sidebar-item${done ? ' sidebar-item-done' : ''}${State.activeModule === mod.id ? ' active' : ''}`;
    btn.setAttribute('aria-label', `Navigate to ${mod.title}`);
    btn.setAttribute('data-module-id', mod.id);
    btn.innerHTML = `
      <span class="sidebar-item-num">M${mod.id}</span>
      <span class="sidebar-item-label">${escapeHtml(mod.title.replace(/Module \d+ — /i, ''))}</span>
      <span class="sidebar-item-progress">${p.completed}/${p.total}</span>
      ${done ? '<span class="sidebar-check" aria-label="Completed">✓</span>' : ''}
    `;
    btn.addEventListener('click', () => {
      scrollToModule(mod.id);
      // On mobile: close sidebar
      if (window.innerWidth < 768) closeMobileSidebar();
    });
    nav.appendChild(btn);
  }

  // Update mini progress bar
  const overall = getOverallProgress();
  const miniBar = $('sidebar-mini-fill');
  const miniPct = $('sidebar-mini-pct');
  if (miniBar) setWidth(miniBar, overall.pct);
  if (miniPct) miniPct.textContent = overall.pct + '%';
}

/* ============================================================
   DASHBOARD STATS
   ============================================================ */

function updateDashboard() {
  const overall = getOverallProgress();
  const mStats  = getModuleStats();

  setText('stat-total-modules',    State.modules.length);
  setText('stat-total-topics',     overall.total);
  setText('stat-completed-topics', overall.completed);
  setText('stat-remaining-topics', overall.remaining);
  setText('stat-overall-pct',      overall.pct + '%');
  setText('stat-overall-pct-2',    overall.pct + '%');

  const fill = $('overall-progress-fill');
  if (fill) setWidth(fill, overall.pct);

  // Keep screen-reader progress values synchronized with the visual bars.
  $('.progress-bar-mini, .progress-bar-main').forEach(bar => {
    bar.setAttribute('aria-valuenow', overall.pct);
    bar.setAttribute('aria-valuetext', `${overall.pct}% complete`);
  });

  // Statistics section
  setText('stats-mods-done',       mStats.done);
  setText('stats-mods-inprog',     mStats.inProgress);
  setText('stats-mods-notstarted', mStats.notStarted);
  setText('stats-total-pct',       overall.pct + '%');

  // Footer
  setText('footer-completed', overall.completed);
  setText('footer-total',     overall.total);
  setText('footer-pct',       overall.pct + '%');

  updateTrendChart();
  renderSidebar();
}

function updateTrendChart() {
  const chart = $('trend-chart');
  if (!chart) return;
  chart.innerHTML = '';

  const overall = getOverallProgress();

  for (const mod of State.modules) {
    const p   = getModuleProgress(mod);
    const row = document.createElement('div');
    row.className = 'trend-row';

    let fillClass = 'in-progress';
    if (p.pct === 100)      fillClass = 'complete';
    else if (p.pct === 0)   fillClass = 'empty';

    // Shorten title for display
    const shortTitle = mod.title.replace(/Module \d+ — /i, 'M' + mod.id + ': ');

    row.innerHTML = `
      <span class="trend-label" title="${escapeHtml(mod.title)}">${escapeHtml(shortTitle)}</span>
      <div class="trend-bar-track" role="progressbar" aria-valuenow="${p.pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="trend-bar-fill ${fillClass}" style="width:${p.pct}%"></div>
      </div>
      <span class="trend-pct">${p.pct}%</span>
    `;
    chart.appendChild(row);
  }
}

/* ============================================================
   SVG RING for MODULE CARDS
   ============================================================ */

function buildRingSvg(pct, isDone) {
  const r   = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const stroke = isDone ? '#22c55e' : pct > 0 ? '#a855f7' : '#334155';
  return `<svg class="module-progress-ring" viewBox="0 0 36 36" aria-hidden="true">
    <circle cx="18" cy="18" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2.5"/>
    <circle cx="18" cy="18" r="${r}" fill="none" stroke="${stroke}" stroke-width="2.5"
      stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
      stroke-linecap="round" transform="rotate(-90 18 18)"/>
  </svg>`;
}

/* ============================================================
   MODULE CARD RENDERING
   ============================================================ */

function renderModules() {
  const container = $('modules-container');
  if (!container) return;
  container.innerHTML = '';

  for (const mod of State.modules) {
    container.appendChild(buildModuleCard(mod));
  }

  updateDashboard();
}

function buildModuleCard(mod) {
  const p       = getModuleProgress(mod);
  const isDone  = p.pct === 100;
  const isExpanded = State.expandedSet.has(mod.id);

  const card = document.createElement('article');
  card.className = `module-card${isDone ? ' completed' : ''}${isExpanded ? ' expanded' : ''}`;
  card.setAttribute('id', `module-card-${mod.id}`);
  card.setAttribute('aria-label', `Module ${mod.id}: ${mod.title}`);

  // ── Header ──
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'module-card-header';
  header.setAttribute('aria-expanded', isExpanded.toString());
  header.setAttribute('aria-controls', `module-body-${mod.id}`);
  header.innerHTML = `
    <span class="module-num">M${String(mod.id).padStart(2,'0')}</span>
    <span class="module-title-group">
      <span class="module-title">${highlightText(escapeHtml(mod.title), State.searchQuery)}</span>
      <span class="module-subtitle">${p.completed} / ${p.total} topics &nbsp;·&nbsp; ${p.remaining} remaining</span>
    </span>
    <span class="module-meta">
      ${isDone
        ? `<span class="completed-badge" aria-label="Module completed">✓ Complete</span>`
        : `<span class="module-pct">${p.pct}%</span>
           ${buildRingSvg(p.pct, false)}`
      }
      <span class="expand-btn" aria-hidden="true">
        <span class="chevron">▾</span>
      </span>
    </div>
  `;

  // Toggle expand
  const toggleExpand = () => {
    if (State.expandedSet.has(mod.id)) {
      State.expandedSet.delete(mod.id);
      card.classList.remove('expanded');
      header.setAttribute('aria-expanded', 'false');
    } else {
      State.expandedSet.add(mod.id);
      card.classList.add('expanded');
      header.setAttribute('aria-expanded', 'true');
    }
    updateActiveSidebarItem(mod.id);
  };

  header.addEventListener('click', toggleExpand);

  // ── Progress bar ──
  const progressWrap = document.createElement('div');
  progressWrap.className = 'module-progress-bar-wrap';
  progressWrap.innerHTML = `
    <div class="module-progress-bar" role="progressbar" aria-valuenow="${p.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Module ${mod.id} progress ${p.pct}%">
      <div class="module-progress-bar-fill" style="width:${p.pct}%"></div>
    </div>
  `;

  // ── Body / Topics ──
  const body = document.createElement('div');
  body.className = 'module-card-body';
  body.id = `module-body-${mod.id}`;

  const list = document.createElement('ul');
  list.className = 'topics-list';
  list.setAttribute('aria-label', `Topics for ${mod.title}`);

  for (let i = 0; i < mod.topics.length; i++) {
    list.appendChild(buildTopicItem(mod, i));
  }

  body.appendChild(list);
  card.appendChild(header);
  card.appendChild(progressWrap);
  card.appendChild(body);

  return card;
}

function buildTopicItem(mod, topicIdx) {
  const key     = topicKey(mod.id, topicIdx);
  const checked = !!State.progress[key];
  const topic   = mod.topics[topicIdx];
  const inputId = `chk-${mod.id}-${topicIdx}`;

  const li = document.createElement('li');
  li.className = `topic-item${checked ? ' done' : ''}`;
  li.setAttribute('id', `topic-item-${mod.id}-${topicIdx}`);

  li.innerHTML = `
    <label class="topic-checkbox" for="${inputId}">
      <input
        type="checkbox"
        id="${inputId}"
        ${checked ? 'checked' : ''}
        aria-label="${escapeHtml(topic)}"
      />
      <span class="topic-checkbox-visual" aria-hidden="true"></span>
    </label>
    <span class="topic-label">${highlightText(escapeHtml(topic), State.searchQuery)}</span>
  `;

  const input = li.querySelector('input[type="checkbox"]');
  input.addEventListener('change', () => onTopicToggle(mod.id, topicIdx, input.checked, li));

  // Click on label text also toggles
  li.querySelector('.topic-label').addEventListener('click', () => {
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change'));
  });

  return li;
}

/* ============================================================
   TOPIC TOGGLE HANDLER
   ============================================================ */

function onTopicToggle(moduleId, topicIdx, checked, liEl) {
  const key = topicKey(moduleId, topicIdx);

  if (checked) {
    State.progress[key] = { done: true, ts: Date.now() };
  } else {
    delete State.progress[key];
  }

  Storage.save(State.progress);

  // Update li style
  if (checked) liEl.classList.add('done');
  else         liEl.classList.remove('done');

  // Update the card header (pct, ring, badge, subtitle)
  refreshModuleCard(moduleId);
  updateDashboard();
}

function refreshModuleCard(moduleId) {
  const mod  = State.modules.find(m => m.id === moduleId);
  if (!mod) return;
  const card = $(`module-card-${moduleId}`);
  if (!card) return;

  const p      = getModuleProgress(mod);
  const isDone = p.pct === 100;

  // Toggle completed class
  card.classList.toggle('completed', isDone);

  // Update module-num style (handled via CSS .completed .module-num)

  // Update subtitle
  const subtitle = card.querySelector('.module-subtitle');
  if (subtitle) subtitle.textContent = `${p.completed} / ${p.total} topics · ${p.remaining} remaining`;

  // Update pct / ring / badge in meta
  const meta = card.querySelector('.module-meta');
  if (meta) {
    // Preserve expand btn
    const expandBtn = meta.querySelector('.expand-btn');
    meta.innerHTML = `
      ${isDone
        ? `<span class="completed-badge" aria-label="Module completed">✓ Complete</span>`
        : `<span class="module-pct">${p.pct}%</span>
           ${buildRingSvg(p.pct, false)}`
      }
    `;
    meta.appendChild(expandBtn);
  }

  // Update progress bar
  const barFill = card.querySelector('.module-progress-bar-fill');
  if (barFill) { setWidth(barFill, p.pct); }

  const barEl = card.querySelector('.module-progress-bar');
  if (barEl) barEl.setAttribute('aria-valuenow', p.pct);
}

/* ============================================================
   SCROLL & ACTIVE MODULE TRACKING
   ============================================================ */

function scrollToModule(moduleId) {
  const card = $(`module-card-${moduleId}`);
  if (!card) return;

  // Expand it if collapsed
  if (!State.expandedSet.has(moduleId)) {
    State.expandedSet.add(moduleId);
    card.classList.add('expanded');
    card.querySelector('.module-card-header')?.setAttribute('aria-expanded', 'true');
  }

  const top = card.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: 'smooth' });
  State.activeModule = moduleId;
  updateActiveSidebarItem(moduleId);
}

function updateActiveSidebarItem(moduleId) {
  $$('.sidebar-item').forEach(btn => {
    btn.classList.toggle('active', +btn.getAttribute('data-module-id') === moduleId);
  });
}

function setupScrollSpy() {
  if (scrollSpyObserver) scrollSpyObserver.disconnect();

  scrollSpyObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const id = +entry.target.id.replace('module-card-', '');
        if (id) {
          State.activeModule = id;
          updateActiveSidebarItem(id);
        }
      }
    }
  }, { threshold: 0.25 });

  $('.module-card').forEach(card => scrollSpyObserver.observe(card));
}

/* ============================================================
   SEARCH FUNCTIONALITY
   ============================================================ */

function onSearch(query) {
  State.searchQuery = query.trim().toLowerCase();
  applySearch();
}

function applySearch() {
  const q       = State.searchQuery;
  let   anyVisible = false;

  for (const mod of State.modules) {
    const card    = $(`module-card-${mod.id}`);
    if (!card) continue;

    const titleMatch = mod.title.toLowerCase().includes(q);
    const topicMatches = mod.topics.map(t => !q || t.toLowerCase().includes(q));
    const anyTopicMatch = topicMatches.some(Boolean);
    const moduleVisible = !q || titleMatch || anyTopicMatch;

    card.classList.toggle('hidden', !moduleVisible);
    if (moduleVisible) anyVisible = true;

    // Update highlighted title
    const titleEl = card.querySelector('.module-title');
    if (titleEl) titleEl.innerHTML = highlightText(escapeHtml(mod.title), q);

    // Show/hide individual topics
    const topicItems = card.querySelectorAll('.topic-item');
    topicItems.forEach((li, i) => {
      const visible = !q || topicMatches[i] || titleMatch;
      li.classList.toggle('hidden', !visible);
      const labelEl = li.querySelector('.topic-label');
      if (labelEl) labelEl.innerHTML = highlightText(escapeHtml(mod.topics[i]), q);
    });

    // Auto-expand module if search matches
    if (q && anyTopicMatch && !State.expandedSet.has(mod.id)) {
      State.expandedSet.add(mod.id);
      card.classList.add('expanded');
    }
  }

  const noResults = $('no-results');
  if (noResults) noResults.classList.toggle('visible', !anyVisible && !!q);
}

function highlightText(text, q) {
  if (!q) return text;
  const regex = new RegExp(`(${escapeRegex(q)})`, 'gi');
  return text.replace(regex, '<mark class="highlight">$1</mark>');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   EXPAND / COLLAPSE ALL
   ============================================================ */

function expandAll() {
  for (const mod of State.modules) {
    State.expandedSet.add(mod.id);
    const card = $(`module-card-${mod.id}`);
    if (card) {
      card.classList.add('expanded');
      card.querySelector('.module-card-header')?.setAttribute('aria-expanded', 'true');
    }
  }
}

function collapseAll() {
  State.expandedSet.clear();
  for (const mod of State.modules) {
    const card = $(`module-card-${mod.id}`);
    if (card) {
      card.classList.remove('expanded');
      card.querySelector('.module-card-header')?.setAttribute('aria-expanded', 'false');
    }
  }
}

/* ============================================================
   EXPORT PROGRESS
   ============================================================ */

function exportProgress() {
  const overall = getOverallProgress();
  const payload = {
    version:    '1.0',
    appName:    'CEH Study Reference',
    exportedAt: new Date().toISOString(),
    overall:    overall,
    modules:    State.modules.map(mod => {
      const p = getModuleProgress(mod);
      return {
        id:       mod.id,
        title:    mod.title,
        progress: p,
        topics:   mod.topics.map((topic, i) => {
          const key  = topicKey(mod.id, i);
          const data = State.progress[key];
          return {
            idx:       i,
            topic:     topic,
            completed: !!data,
            timestamp: data && data.ts ? new Date(data.ts).toISOString() : null,
          };
        }),
      };
    }),
    rawProgress: State.progress,
  };

  // Use data: URI so export works on file:// without Blob URL restrictions
  const jsonStr = JSON.stringify(payload, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
  const a       = document.createElement('a');
  a.href        = dataUri;
  a.download    = 'CEH-Progress-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast('Progress exported successfully!', 'success');
}

/* ============================================================
   IMPORT PROGRESS
   ============================================================ */

function triggerImport() {
  // Create a fresh input each time to avoid stale-file-handle issues on file://
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json';
  input.style.display = 'none';
  input.addEventListener('change', handleImport);
  document.body.appendChild(input);
  input.click();
  // Clean up after selection (or cancel)
  input.addEventListener('cancel', () => document.body.removeChild(input));
  // Also clean up after handleImport fires
  input._cleanup = () => { if (input.parentNode) document.body.removeChild(input); };
}

function normalizeProgressMap(rawProgress) {
  if (!rawProgress || typeof rawProgress !== 'object' || Array.isArray(rawProgress)) {
    throw new Error('Progress data must be an object');
  }

  const validKeys = new Set(
    State.modules.flatMap(mod => mod.topics.map((_, index) => topicKey(mod.id, index)))
  );
  const normalized = {};

  for (const [key, value] of Object.entries(rawProgress)) {
    if (!/^\d+_\d+$/.test(key) || !validKeys.has(key)) {
      throw new Error(`Unknown topic key: ${key}`);
    }

    if (value === true) {
      // Accept the earlier boolean format and normalize it to the current format.
      normalized[key] = { done: true, ts: Date.now() };
      continue;
    }

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      value.done === true &&
      (value.ts === undefined || Number.isFinite(value.ts))
    ) {
      normalized[key] = {
        done: true,
        ts: Number.isFinite(value.ts) ? value.ts : Date.now(),
      };
      continue;
    }

    throw new Error(`Invalid completion value for topic key: ${key}`);
  }

  return normalized;
}

function handleImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) {
    if (e.target._cleanup) e.target._cleanup();
    return;
  }

  if (!/\.json$/i.test(file.name)) {
    showToast('Invalid file type. Please select a JSON file.', 'error');
    if (e.target._cleanup) e.target._cleanup();
    return;
  }

  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      let rawProgress;

      if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        Object.prototype.hasOwnProperty.call(data, 'rawProgress')
      ) {
        rawProgress = data.rawProgress;
      } else {
        // Also accept a direct progress map for backwards compatibility.
        rawProgress = data;
      }

      // Validate the complete import before replacing the current progress.
      const normalizedProgress = normalizeProgressMap(rawProgress);
      State.progress = normalizedProgress;
      Storage.save(State.progress);
      renderModules();
      setupScrollSpy();

      const total = Object.keys(normalizedProgress).length;
      showToast(`Progress imported! ${total} completed topics restored.`, 'success');
    } catch (err) {
      showToast('Import failed: invalid, unsupported, or corrupted progress data.', 'error');
      console.error('Import error:', err);
    }

    if (e.target._cleanup) e.target._cleanup();
  };

  reader.onerror = () => {
    showToast('Failed to read file.', 'error');
    if (e.target._cleanup) e.target._cleanup();
  };

  reader.readAsText(file);
}

/* ============================================================
   RESET PROGRESS
   ============================================================ */

function confirmReset() {
  showModal({
    icon:        '🗑️',
    title:       'Reset All Progress?',
    message:     'This will permanently clear all your completed topics and cannot be undone.',
    confirmText: 'Reset Everything',
    onConfirm:   () => {
      State.progress = {};
      Storage.clear();
      renderModules();
      setupScrollSpy();
      showToast('Progress reset successfully.', 'info');
    },
  });
}

/* ============================================================
   SIDEBAR TOGGLE
   ============================================================ */

function toggleSidebar() {
  const sidebar = $('sidebar');
  const main    = $('main');
  const footer  = $('footer');
  const isCollapsed = sidebar.classList.toggle('collapsed');
  if (main)   main.classList.toggle('sidebar-hidden', isCollapsed);
  if (footer) footer.classList.toggle('sidebar-hidden', isCollapsed);
}

function openMobileSidebar() {
  $('sidebar')?.classList.add('mobile-open');
  $('sidebar-overlay')?.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeMobileSidebar() {
  $('sidebar')?.classList.remove('mobile-open');
  $('sidebar-overlay')?.classList.remove('visible');
  document.body.style.overflow = '';
}

/* ============================================================
   SCROLL-TO-TOP BUTTON
   ============================================================ */

function setupScrollTop() {
  const btn = $('scroll-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ============================================================
   DATA LOADING — fetches the local JSON file over HTTP(S)
   ============================================================ */

async function loadData() {
  const response = await fetch(MODULE_DATA_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Module data request failed (HTTP ${response.status})`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.modules)) {
    throw new Error('Module data must contain a modules array');
  }

  const validModules = payload.modules.every(module =>
    module &&
    Number.isInteger(module.id) &&
    typeof module.title === 'string' &&
    Array.isArray(module.topics) &&
    module.topics.every(topic => typeof topic === 'string')
  );

  if (!validModules) {
    throw new Error('Module data contains an invalid module or topic');
  }

  return payload.modules;
}

/* ============================================================
   EVENT BINDINGS
   ============================================================ */

function bindEvents() {
  // Search
  const searchInput = $('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', e => onSearch(e.target.value));
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { searchInput.value = ''; onSearch(''); }
    });
  }

  // Expand / Collapse all
  $('btn-expand-all')?.addEventListener('click',   expandAll);
  $('btn-collapse-all')?.addEventListener('click', collapseAll);

  // Export / Import / Reset
  $('btn-export')?.addEventListener('click', exportProgress);
  $('btn-import')?.addEventListener('click', triggerImport);
  $('btn-reset')?.addEventListener('click',  confirmReset);

  // Sidebar toggle (desktop)
  $('sidebar-toggle-btn')?.addEventListener('click', toggleSidebar);

  // Hamburger (mobile)
  $('hamburger')?.addEventListener('click', openMobileSidebar);
  $('sidebar-overlay')?.addEventListener('click', closeMobileSidebar);

  // Keyboard: close mobile sidebar on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeMobileSidebar();
      const overlay = $('modal-overlay');
      if (overlay?.classList.contains('visible')) overlay.classList.remove('visible');
    }
  });
}

/* ============================================================
   INIT
   ============================================================ */

async function init() {
  // Start canvas background immediately
  BgCanvas.init();

  try {
    // Load the single source-of-truth module data file.
    State.modules = await loadData();

    // Validate persisted progress against the currently available topic keys.
    try {
      State.progress = normalizeProgressMap(Storage.load());
    } catch (storageError) {
      console.warn('Stored progress was invalid and has been cleared:', storageError);
      Storage.clear();
      State.progress = {};
    }

    // Render UI
    renderModules();
    setupScrollSpy();
    setupScrollTop();
    bindEvents();

    // Auto-expand first module
    if (State.modules.length > 0) {
      State.expandedSet.add(State.modules[0].id);
      const firstCard = document.getElementById('module-card-' + State.modules[0].id);
      if (firstCard) {
        firstCard.classList.add('expanded');
        firstCard.querySelector('.module-card-header')?.setAttribute('aria-expanded', 'true');
      }
    }

  } catch (err) {
    console.error('Failed to initialize app:', err);
    const container = document.getElementById('modules-container');
    if (container) {
      container.innerHTML =
        '<div style="text-align:center;padding:60px 24px;color:var(--muted)">' +
        '<div style="font-size:3rem;margin-bottom:16px">\\u26A0\\uFE0F</div>' +
        '<h3 style="color:var(--text-soft);margin-bottom:8px">Failed to load modules</h3>' +
        '<p style="font-size:0.85rem"></p>' +
        '</div>';
      const errorDetails = container.querySelector('p');
      if (errorDetails) errorDetails.textContent = err.message;
    }
  }
}

// Boot
document.addEventListener('DOMContentLoaded', init);
