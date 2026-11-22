import {
  loadIntelData,
  computeStats,
  getFeaturedHeadlines,
  extractVendors,
  filterItems,
} from './data.js';
import {
  configureReader,
  bilibiliSearchUrl,
  renderIntelCards,
  renderHeadlineCards,
  openIntelReader,
  closeIntelReader,
  showToast,
  copyTextToClipboard,
} from './card.js';
import { initPosterGenerator } from './poster.js';

import { initCatalog } from './catalog.js';
import { initGuides } from './guides.js';
import { initAccount } from './account.js';

const THEME_STORAGE_KEY = 'ai-intel-theme';

const CHANNEL_COPY = {
  REVIEW: { title: '测评与视频' },
  MODELS: { title: '模型比价与免费额度速查' },
  GUIDES: { title: '实战教程' },
  ALL: {
    title: '前沿 AI 情报与算力简报',
  },
  RADAR: {
    title: '算力降本与工程避坑',
  },
  INTEL: {
    title: '全球 AI 厂商前沿动态',
  },
};

const SUB_TYPE_CONFIG = {
  REVIEW: [
    { key: 'ALL', label: '全部' },
    { key: 'BENCHMARK', label: '深度评测' },
    { key: 'VIDEO', label: '视频拆解' },
  ],
  RADAR: [
    { key: 'ALL', label: '全部' },
    { key: 'DEAL', label: '算力羊毛' },
    { key: 'BUG', label: '漏洞避坑' },
    { key: 'HACK', label: '极客技巧' },
  ],
  INTEL: [
    { key: 'ALL', label: '全部' },
    { key: 'MODEL', label: '新模型' },
    { key: 'PRODUCT', label: '新产品' },
    { key: 'POLICY', label: '新条款与定价' },
  ],
};

const TAB_LINK_BASE =
  'font-editorial-nav inline-flex items-baseline pb-1 text-[13.5px] border-b-[1.5px] transition-colors cursor-pointer focus:outline-none whitespace-nowrap';
const TAB_LINK_ACTIVE =
  'border-[#1D1D1F] font-medium text-[#1D1D1F] dark:border-[#F5F5F7] dark:text-[#F5F5F7]';
const TAB_LINK_IDLE =
  'border-transparent font-normal text-[#6E6E73] hover:text-[#1D1D1F] dark:text-[#A1A1A6] dark:hover:text-[#F5F5F7]';

const VENDOR_LINK_BASE =
  'inline-flex items-baseline transition-colors cursor-pointer focus:outline-none whitespace-nowrap';
const VENDOR_LINK_ACTIVE =
  'font-medium text-[#0066CC] dark:text-[#2997FF] underline underline-offset-4';
const VENDOR_LINK_IDLE =
  'font-normal text-[#6E6E73] hover:text-[#1D1D1F] dark:text-[#A1A1A6] dark:hover:text-[#F5F5F7]';

const state = {
  density: 'magazine',
  onlySaved: false,
  channel: 'ALL',
  type: 'ALL',
  vendor: 'ALL',
  showFixed: false,
  query: '',
};

let currentTheme = 'light';
let intelData = { updated_at: '', items: [] };
let dataSource = 'fallback';
let statsCache = null;
let posterController = null;
let accountController = null;
let domRefs = null;


const SAVED_KEY = 'ai-intel-saved-v3';
function readSaved() {
  try {
    const records = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    return new Map(records.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
  } catch {
    return new Map();
  }
}

let saved = readSaved();

let catalog;
let guidesController;
let readerItem = null;
let readerTrigger = null;
let returningFromReader = false;
let sourceHref = '';
let restoringUrl = false;
const routeKeys = ['channel', 'type', 'vendor', 'q', 'saved', 'active', 'free', 'sort', 'input', 'output', 'id', 'guide', 'step', 'track'];

function syncUrl({ push = false } = {}) {
  if (readerItem || restoringUrl || !catalog || !guidesController) return;
  const url = new URL(location.href);
  for (const key of routeKeys) url.searchParams.delete(key);
  const params =
    state.channel === 'MODELS'
      ? catalog.parameters()
      : state.channel === 'GUIDES'
        ? guidesController.parameters()
        : {
            type: state.type === 'ALL' ? null : state.type,
            vendor: state.vendor === 'ALL' ? null : state.vendor,
            q: state.query || null,
            saved: state.onlySaved ? '1' : null,
            active: state.showFixed ? '0' : null,
          };
  if (state.channel !== 'ALL') url.searchParams.set('channel', state.channel);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  sourceHref = url.href;
  if (url.href !== location.href) {
    if (push) history.pushState({}, '', url);
    else history.replaceState(history.state, '', url);
  }
}

function restoreChannel(dom, params) {
  const channel = params.get('channel');
  state.channel = Object.hasOwn(CHANNEL_COPY, channel) ? channel : 'ALL';
  const type = params.get('type');
  state.type = SUB_TYPE_CONFIG[state.channel]?.some(spec => spec.key === type) ? type : 'ALL';
  state.vendor = state.channel === 'INTEL' && params.get('vendor') || 'ALL';
  state.query = state.channel === 'MODELS' || state.channel === 'GUIDES' ? '' : params.get('q') || '';
  state.onlySaved = params.get('saved') === '1';
  state.showFixed = params.get('active') === '0';
  dom.searchInput.value = state.query;
  dom.toggleHideFixed.checked = !state.showFixed;
  if (state.channel === 'MODELS') catalog.restore(params);
  if (state.channel === 'GUIDES') guidesController.restore(params);
  render(dom);
}

function restoreUrl(dom) {
  posterController?.close();
  const url = new URL(location.href);
  const id = url.searchParams.get('id');
  const item = intelData.items.find(entry => entry.id === id) || saved.get(id);
  url.searchParams.delete('id');
  const previous = readerItem;
  const sameSource = sourceHref === url.href;
  restoringUrl = true;
  returningFromReader = false;
  try {
    readerItem = null;
    if (!sameSource) restoreChannel(dom, url.searchParams);
    sourceHref = url.href;
    if (item) {
      openIntelReader(item);
    } else {
      updatePanels(dom);
      dom.detail.replaceChildren();
      if (sameSource && previous) {
        const fallback = !dom.main.hidden && dom.main.querySelector('[data-intel-id="' + CSS.escape(previous.id) + '"] .story-title-button');
        const target = readerTrigger?.isConnected ? readerTrigger : fallback;
        (target || (state.channel === 'GUIDES' ? dom.primaryPillars : dom.channelTabs).querySelector('[data-active="true"]'))?.focus({ preventScroll: true });
      }
      readerTrigger = null;
      if (Number.isFinite(history.state?.radarScrollY)) {
        window.scrollTo({ top: history.state.radarScrollY, behavior: 'instant' });
      }
    }
  } finally {
    restoringUrl = false;
  }
  syncUrl();
}

function openReaderRoute(dom, item, trigger) {
  const url = new URL(sourceHref || location.href);
  url.searchParams.set('id', item.id);
  if (!restoringUrl || !history.state?.radarReader) {
    // Give shared links the same return destination as an in-page visit.
    if (!readerItem) {
      history.scrollRestoration = 'manual';
      history.replaceState({ ...history.state, radarScrollY: restoringUrl ? 0 : window.scrollY }, '', sourceHref);
      history.pushState({ radarReader: true }, '', url);
    } else {
      history.replaceState(history.state, '', url);
    }
  }
  if (trigger) readerTrigger = trigger;
  readerItem = item;
  markRead(item);
  updatePanels(dom);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function leaveReaderForChannel(dom) {
  if (!readerItem) return;
  history.pushState({}, '', sourceHref);
  readerItem = null;
  readerTrigger = null;
  dom.detail.replaceChildren();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function openGuides(guideId = '', step = null) {
  const wasReading = Boolean(readerItem);
  leaveReaderForChannel(domRefs);
  state.channel = 'GUIDES';
  state.vendor = 'ALL';
  state.type = 'ALL';
  guidesController.setTrack('', { scrollTop: false, silent: true });
  if (guideId) guidesController.openGuide(guideId, { step, scrollTop: false, silent: true });
  render(domRefs, { push: !wasReading });
  window.scrollTo({ top: 0, behavior: 'instant' });
  const heading = domRefs.guidesPanel.querySelector('.guide-doc-title') || domRefs.mastheadTitle;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

const VISIT_KEY = 'ai-intel-visit-v1';
const READ_KEY = 'ai-intel-read-v1';
let newItems = new Set();
let visitSnapshot = null;

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function showVisitCount() {
  const note = document.getElementById('visit-increment');
  note.hidden = !newItems.size || state.channel === 'MODELS' || state.channel === 'GUIDES';
  document.getElementById('visit-increment-text').textContent = newItems.size ? '自上次访问新增 ' + newItems.size + ' 条' : '';
}

function acknowledgeVisit() {
  if (!visitSnapshot) return;
  const previous = readLocal(VISIT_KEY, null);
  if (!(Date.parse(previous?.updated_at) > Date.parse(visitSnapshot.updated_at))) {
    try { localStorage.setItem(VISIT_KEY, JSON.stringify(visitSnapshot)); } catch { /* Storage unavailable. */ }
  }
  newItems.clear();
  showVisitCount();
}

function recordVisit() {
  if (dataSource === 'fallback') return;
  const previous = readLocal(VISIT_KEY, null);
  const current = { updated_at: intelData.updated_at, ids: intelData.items.map(item => item.id) };
  const currentTime = Date.parse(current.updated_at);
  const previousTime = Date.parse(previous?.updated_at);
  if (!Number.isFinite(currentTime) || previousTime > currentTime) return;
  visitSnapshot = current;
  if (Array.isArray(previous?.ids) && currentTime > previousTime) {
    const read = readLocal(READ_KEY, []);
    const known = new Set([...previous.ids, ...(Array.isArray(read) ? read : [])]);
    newItems = new Set(current.ids.filter(id => !known.has(id)));
  }
  if (!newItems.size) acknowledgeVisit();
}

function markRead(item) {
  const stored = readLocal(READ_KEY, []);
  const ids = new Set(Array.isArray(stored) ? stored : []);
  ids.add(item.id);
  try { localStorage.setItem(READ_KEY, JSON.stringify([...ids])); } catch { /* Storage unavailable. */ }
  if (newItems.delete(item.id)) {
    if (!newItems.size) acknowledgeVisit();
    else showVisitCount();
  }
}


function filteredItems() {
  const current = new Map(intelData.items.map(item => [item.id, item]));
  const items = state.onlySaved ? [...saved.values()].map(item => current.get(item.id) || item) : intelData.items;
  return filterItems(items, state);
}

function mergeSyncedBookmarks(cloudIds, dom) {
  if (!Array.isArray(cloudIds)) return;
  const freshStored = readSaved();
  const catalogById = new Map(intelData.items.map(item => [item.id, item]));
  const merged = new Map();

  for (const [id, item] of freshStored.entries()) {
    merged.set(id, catalogById.get(id) || item);
  }
  for (const [id, item] of saved.entries()) {
    merged.set(id, catalogById.get(id) || item);
  }
  for (const rawId of cloudIds) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id || merged.has(id)) continue;
    const matched = catalogById.get(id);
    if (matched) {
      merged.set(id, matched);
    } else {
      merged.set(id, {
        id,
        date: '',
        channel: 'INTEL',
        type: 'MODEL',
        status: 'ACTIVE',
        vendor: 'CLOUD',
        priority: 1,
        title: `云端收藏简报（${id}）`,
        tldr: '该条目同步自云端账号收藏，原始简报已归档。',
        details: [],
      });
    }
  }

  saved = merged;
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify([...saved.values()]));
  } catch {
    // Ignore storage unavailability
  }
  if (dom.savedFilterCount) {
    const count = saved.size;
    dom.savedFilterCount.textContent = count > 0 ? String(count) : '';
    dom.savedFilterCount.hidden = count === 0;
  }
  if (dom.savedFilter) {
    dom.savedFilter.setAttribute('aria-label', `仅看收藏（当前 ${saved.size} 条）`);
  }
  render(dom);
}

function toggleBookmark(id, dom) {
  let nowSaved = false;
  if (saved.has(id)) {
    saved.delete(id);
    nowSaved = false;
  } else {
    const item = readerItem?.id === id ? readerItem : intelData.items.find(entry => entry.id === id);
    if (!item) return;
    saved.set(id, item);
    nowSaved = true;
  }
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify([...saved.values()]));
  } catch {
    showToast('浏览器存储不可用，收藏仅保留在本次浏览', 'info');
  }
  render(dom);
  accountController?.syncBookmarkChange(id, nowSaved);
  if (readerItem) return;
  const next = [...dom.main.querySelectorAll('[data-bookmark]')].find(button => button.dataset.bookmark === id);
  (next || dom.savedFilter).focus({ preventScroll: true });
}

function getDomRefs() {
  return {
    header: document.querySelector('#top > header'),
    detail: document.getElementById('intel-detail-panel'),
    reviewSearch: document.getElementById('review-video-search'),
    controls: document.getElementById('intel-controls'),
    main: document.getElementById('intel-main'),
    catalog: document.getElementById('model-panel'),
    guidesPanel: document.getElementById('guides-panel'),
    savedFilter: document.getElementById('saved-filter'),
    savedFilterCount: document.getElementById('saved-filter-count'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    primaryPillars: document.getElementById('primary-pillars'),
    subdirectory: document.getElementById('subdirectory'),
    channelTabs: document.getElementById('channel-tabs'),
    guideDirectory: document.getElementById('guide-directory'),
    guideTrackTabs: document.getElementById('guide-track-tabs'),
    guideDirectoryProgress: document.getElementById('guide-directory-progress'),
    mastheadTitle: document.getElementById('masthead-title'),
    homeGuidesStrip: document.getElementById('home-guides-strip'),
    footerUpdatedAt: document.getElementById('footer-updated-at'),
    subTypeBar: document.getElementById('sub-type-bar'),
    subTypeTabs: document.getElementById('sub-type-tabs'),
    vendorFilterBar: document.getElementById('vendor-filter-bar'),
    vendorChips: document.getElementById('vendor-chips'),
    toggleHideFixed: document.getElementById('toggle-hide-fixed'),
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    headlineSection: document.getElementById('headline-section'),
    headlineGrid: document.getElementById('headline-grid'),
    feedSection: document.getElementById('feed-section'),
    feedEl: document.getElementById('intel-feed'),
    emptyState: document.getElementById('empty-state'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    openPosterBtn: document.getElementById('open-poster-btn'),
    posterDrawerRoot: document.getElementById('poster-drawer-root'),
    accountTriggerBtn: document.getElementById('account-trigger-btn'),
    accountMenuRoot: document.getElementById('account-menu-root'),
    accountModalRoot: document.getElementById('account-modal-root'),
  };
}

function formatFooterDate(isoString) {
  if (typeof isoString !== 'string' || !isoString.trim()) return '';
  const match = isoString.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日更新`;
  }
  return '';
}

function readInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore storage errors
  }
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function syncThemeToggleButton(theme) {
  const btn = domRefs?.themeToggleBtn || document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const isDark = theme === 'dark';
  btn.dataset.themeCurrent = theme;
  btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  btn.setAttribute(
    'aria-label',
    isDark ? '当前深色外观，点击切换浅色外观' : '当前浅色外观，点击切换深色外观'
  );
  const labelEl = btn.querySelector('[data-theme-label]');
  if (labelEl) {
    labelEl.textContent = isDark ? '浅色' : '深色';
  }
}

function applyTheme(theme, { persist = true, dispatch = true } = {}) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  currentTheme = normalized;

  const root = document.documentElement;
  root.classList.toggle('dark', normalized === 'dark');
  root.dataset.theme = normalized;
  root.style.colorScheme = normalized;

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage errors
    }
  }

  syncThemeToggleButton(normalized);

  if (dispatch) {
    window.dispatchEvent(
      new CustomEvent('radar:theme-change', {
        detail: { theme: normalized },
      })
    );
  }

  return normalized;
}

function toggleTheme(explicitTheme) {
  const next =
    explicitTheme === 'dark' || explicitTheme === 'light'
      ? explicitTheme
      : currentTheme === 'dark'
        ? 'light'
        : 'dark';
  return applyTheme(next, { persist: true, dispatch: true });
}

const GUIDE_TRACK_TITLES = {
  '': '实战教程',
  前期准备: '前期准备与账号基建',
  订阅优惠: '正版订阅与省钱方案',
  编程与Agent: '编程工具与 Agent 实战',
  疑难杂症: '常见报错与风控排障',
};

function guideMastheadTitle() {
  const track = guidesController?.getActiveTrack?.() || '';
  return GUIDE_TRACK_TITLES[track] || track;
}

function updateMasthead(dom, stats) {
  const copy = CHANNEL_COPY[state.channel] || CHANNEL_COPY.ALL;
  if (dom.mastheadTitle) {
    dom.mastheadTitle.textContent = state.channel === 'GUIDES' ? guideMastheadTitle() : copy.title;
  }
  if (dom.footerUpdatedAt) {
    dom.footerUpdatedAt.textContent = formatFooterDate(stats?.updatedAtRaw);
    if (stats?.updatedAtRaw) {
      dom.footerUpdatedAt.setAttribute('datetime', stats.updatedAtRaw);
    }
  }
}

function updateNavigation(dom) {
  const isGuides = state.channel === 'GUIDES';
  const activePillar = isGuides && !readerItem ? 'GUIDES' : 'INFO';
  for (const button of dom.primaryPillars.querySelectorAll('[data-pillar]')) {
    const active = button.dataset.pillar === activePillar;
    button.setAttribute('aria-pressed', String(active));
    button.dataset.active = String(active);
  }
  dom.channelTabs.hidden = isGuides;
  dom.guideDirectory.hidden = !isGuides;
  for (const button of dom.channelTabs.querySelectorAll('[data-channel]')) {
    const active = button.dataset.channel === state.channel;
    button.setAttribute('aria-pressed', String(active));
    button.dataset.active = String(active);
  }
  for (const button of dom.guideTrackTabs.querySelectorAll('[data-guide-track]')) {
    const active = button.dataset.guideTrack === guidesController.getActiveTrack();
    button.setAttribute('aria-pressed', String(active));
    button.dataset.active = String(active);
  }
  const selectedTrack = dom.guideTrackTabs.querySelector('[data-active="true"]');
  if (isGuides && selectedTrack) {
    const viewport = dom.guideTrackTabs.getBoundingClientRect();
    const selected = selectedTrack.getBoundingClientRect();
    if (selected.left < viewport.left || selected.right > viewport.right) {
      dom.guideTrackTabs.scrollLeft += selected.left - viewport.left;
    }
  }
  const { trackCompleted, trackTotal } = guidesController.getProgress();
  dom.guideDirectoryProgress.hidden = !trackTotal;
  dom.guideDirectoryProgress.textContent = trackTotal ? `已完成 ${trackCompleted} / ${trackTotal} 门` : '';
}

/* ---------------- Homepage guides strip (实战教程编辑部导览横条) ---------------- */
const HOME_STRIP_TITLE_MAX = 20;

function clipTitle(title, max = HOME_STRIP_TITLE_MAX) {
  const chars = Array.from(String(title || '').trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
}

function homeStripButton(className, text, dataset = {}, ariaLabel = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  for (const [key, value] of Object.entries(dataset)) {
    if (value != null) button.dataset[key] = String(value);
  }
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  return button;
}

function shouldShowHomeGuidesStrip() {
  return (
    state.channel === 'ALL' &&
    !readerItem &&
    !state.onlySaved &&
    !state.query.trim() &&
    Boolean(guidesController)
  );
}

function renderHomeGuidesStrip(dom) {
  const strip = dom.homeGuidesStrip;
  if (!strip) return;
  const snapshot = shouldShowHomeGuidesStrip() ? guidesController.getLearningSnapshot?.() : null;
  const visible = Boolean(snapshot && snapshot.total > 0);
  strip.hidden = !visible;
  dom.header?.toggleAttribute('data-guides-strip', visible);
  if (!visible) {
    delete strip.dataset.signature;
    if (strip.childElementCount) strip.replaceChildren();
    return;
  }

  const featured = Array.isArray(snapshot.featured) ? snapshot.featured : [];
  const signature = JSON.stringify(featured.map((g) => [g.id, g.order, g.title]));
  if (strip.dataset.signature === signature && strip.childElementCount) return;
  strip.dataset.signature = signature;

  const copy = document.createElement('div');
  copy.className = 'home-guides-copy';
  const headline = document.createElement('p');
  headline.className = 'font-editorial-display home-guides-headline';
  const leadText = document.createTextNode('刚接触 AI 不知从何下手？');
  const tailSpan = document.createElement('span');
  tailSpan.className = 'home-guides-headline-tail';
  tailSpan.textContent = '先看手把手实战教程';
  headline.append(leadText, tailSpan);
  copy.appendChild(headline);

  const links = document.createElement('div');
  links.className = 'home-guides-links';
  links.setAttribute('role', 'group');
  links.setAttribute('aria-label', '实战教程直达入口');

  const pad = (n) => String(n).padStart(2, '0');
  for (const guide of featured) {
    const button = homeStripButton(
      'home-guides-link home-guides-featured',
      '',
      { homeGuide: guide.id },
      `打开课程：${guide.title}`
    );
    const num = document.createElement('span');
    num.className = 'home-guides-num';
    num.textContent = pad(guide.order || featured.indexOf(guide) + 1);
    const name = document.createElement('span');
    name.className = 'home-guides-name';
    name.textContent = clipTitle(guide.title);
    button.append(num, name);
    links.appendChild(button);
  }
  links.appendChild(
    homeStripButton('home-guides-link home-guides-all', '全部教程 →', { homeGuidesAll: '' })
  );

  strip.replaceChildren(copy, links);
}

function updateSubTypeBar(dom) {
  if (!dom.subTypeBar || !dom.subTypeTabs) return;

  const specs = SUB_TYPE_CONFIG[state.channel];
  if (!specs) {
    dom.subTypeBar.classList.add('hidden');
    dom.subTypeBar.classList.remove('flex');
    dom.subTypeTabs.replaceChildren();
    return;
  }

  dom.subTypeBar.classList.remove('hidden');
  dom.subTypeBar.classList.add('flex');

  const fragment = document.createDocumentFragment();
  for (const spec of specs) {
    const isActive = state.type === spec.key;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.filterType = spec.key;
    btn.dataset.active = isActive ? 'true' : 'false';
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.className = `${TAB_LINK_BASE} ${isActive ? TAB_LINK_ACTIVE : TAB_LINK_IDLE}`;
    btn.textContent = spec.label;
    fragment.appendChild(btn);
  }

  dom.subTypeTabs.replaceChildren(fragment);
}

function updateVendorFilterBar(dom, items) {
  if (!dom.vendorFilterBar || !dom.vendorChips) return;

  if (state.channel !== 'INTEL') {
    dom.vendorFilterBar.classList.add('hidden');
    dom.vendorFilterBar.classList.remove('flex');
    dom.vendorChips.replaceChildren();
    return;
  }

  const vendors = extractVendors(items, {
    channel: 'INTEL',
    type: state.type,
    showFixed: state.showFixed,
    query: state.query,
  });

  const displayVendors = vendors.slice();
  if (
    state.vendor !== 'ALL' &&
    !displayVendors.some(
      (entry) => entry.vendor.toLowerCase() === state.vendor.toLowerCase()
    )
  ) {
    displayVendors.push({ vendor: state.vendor, count: 0, maxPriority: 0 });
  }

  if (displayVendors.length === 0) {
    dom.vendorFilterBar.classList.add('hidden');
    dom.vendorFilterBar.classList.remove('flex');
    dom.vendorChips.replaceChildren();
    return;
  }

  dom.vendorFilterBar.classList.remove('hidden');
  dom.vendorFilterBar.classList.add('flex');

  const fragment = document.createDocumentFragment();

  const buildVendorBtn = (vendorKey, label, isActive) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.vendor = vendorKey;
    btn.dataset.active = isActive ? 'true' : 'false';
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    const fontVoice =
      vendorKey === 'ALL'
        ? 'font-editorial-nav text-[13px]'
        : 'font-editorial-vendor';
    btn.className = `${VENDOR_LINK_BASE} ${fontVoice} ${
      isActive ? VENDOR_LINK_ACTIVE : VENDOR_LINK_IDLE
    }`;
    btn.textContent = label;
    return btn;
  };

  fragment.appendChild(
    buildVendorBtn('ALL', '全部厂商', state.vendor === 'ALL')
  );

  for (const entry of displayVendors) {
    const isActive =
      state.vendor !== 'ALL' &&
      state.vendor.toLowerCase() === entry.vendor.toLowerCase();
    fragment.appendChild(buildVendorBtn(entry.vendor, entry.vendor, isActive));
  }

  dom.vendorChips.replaceChildren(fragment);
}

function updateSearchClearButton(dom) {
  if (!dom.searchClearBtn) return;
  const hasQuery = Boolean(state.query && state.query.length > 0);
  dom.searchClearBtn.classList.toggle('hidden', !hasQuery);
  dom.searchClearBtn.classList.toggle('inline-flex', hasQuery);
  dom.searchClearBtn.setAttribute('aria-hidden', hasQuery ? 'false' : 'true');
}

function updatePanels(dom) {
  const reading = Boolean(readerItem);
  const isModels = state.channel === 'MODELS';
  const isGuides = state.channel === 'GUIDES';
  dom.header.hidden = reading;
  dom.subdirectory.hidden = reading;
  dom.detail.hidden = !reading;
  dom.main.hidden = dom.controls.hidden = reading || isModels || isGuides;
  dom.catalog.hidden = reading || !isModels;
  dom.guidesPanel.hidden = reading || !isGuides;
  dom.footerUpdatedAt.hidden = !reading && (isModels || isGuides);
  updateNavigation(dom);
  renderHomeGuidesStrip(dom);
  if (reading) {
    const bookmark = dom.detail.querySelector('[data-bookmark]');
    const active = saved.has(readerItem.id);
    bookmark.textContent = active ? '已收藏' : '收藏';
    bookmark.setAttribute('aria-pressed', String(active));
  }
}

function render(dom, options) {
  updatePanels(dom);
  updateMasthead(dom, statsCache);
  showVisitCount();
  syncUrl(options);
  if (state.channel === 'GUIDES' || state.channel === 'MODELS') return;
  dom.reviewSearch.hidden = state.channel !== 'REVIEW';
  if (!dom.reviewSearch.hidden) dom.reviewSearch.href = bilibiliSearchUrl(state.query);

  const filtered = filteredItems();
  const savedCount = saved.size;
  if (dom.savedFilterCount) {
    dom.savedFilterCount.textContent = savedCount > 0 ? String(savedCount) : '';
    dom.savedFilterCount.hidden = savedCount === 0;
  }
  dom.savedFilter.setAttribute('aria-pressed', String(state.onlySaved));
  dom.savedFilter.setAttribute('aria-label', `仅看收藏（当前 ${savedCount} 条）`);
  dom.feedEl.dataset.density = state.density;
  dom.controls.querySelectorAll('[data-density]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.density === state.density));
  });
  updateSubTypeBar(dom);
  updateVendorFilterBar(dom, state.onlySaved ? [...saved.values()] : intelData.items);
  updateSearchClearButton(dom);

  const trimmedQuery = state.query.trim();
  const headlines = trimmedQuery || state.density === 'brief' ? [] : getFeaturedHeadlines(filtered, 2);
  const headlineIds = new Set(headlines.map((item) => item.id));
  const remaining =
    headlines.length > 0
      ? filtered.filter((item) => !headlineIds.has(item.id))
      : filtered;

  if (dom.headlineSection && dom.headlineGrid) {
    if (headlines.length > 0) {
      dom.headlineSection.classList.remove('hidden');
      renderHeadlineCards(dom.headlineGrid, headlines, { saved });
    } else {
      dom.headlineSection.classList.add('hidden');
      dom.headlineGrid.replaceChildren();
    }
  }

  if (dom.feedSection && dom.feedEl) {
    if (remaining.length > 0) {
      dom.feedSection.classList.remove('hidden');
      renderIntelCards(dom.feedEl, remaining, { variant: state.density, saved });
    } else {
      dom.feedSection.classList.add('hidden');
      dom.feedEl.replaceChildren();
    }
  }

  if (dom.emptyState) {
    dom.emptyState.classList.toggle('hidden', filtered.length > 0);
  }
}

function resetFilters(dom, options) {
  state.onlySaved = false;
  state.channel = 'ALL';
  state.type = 'ALL';
  state.vendor = 'ALL';
  state.showFixed = false;
  state.query = '';

  if (dom.toggleHideFixed) dom.toggleHideFixed.checked = true;
  if (dom.searchInput) dom.searchInput.value = '';

  render(dom, options);
}

function bindEvents(dom) {
  const contactToggle = document.getElementById('footer-contact-toggle');
  const contactDetails = document.getElementById('footer-contact-details');
  contactToggle.addEventListener('click', () => {
    const expanded = contactDetails.hidden;
    contactDetails.hidden = !expanded;
    contactToggle.setAttribute('aria-expanded', String(expanded));
  });
  const copyEmailButton = document.getElementById('footer-copy-email');
  let copyEmailTimer;
  copyEmailButton.addEventListener('click', async () => {
    const copied = await copyTextToClipboard('a92869511@gmail.com');
    clearTimeout(copyEmailTimer);
    copyEmailButton.textContent = copied ? '已复制' : '复制';
    if (copied) {
      showToast('已复制邮箱：a92869511@gmail.com', 'success');
      copyEmailTimer = setTimeout(() => { copyEmailButton.textContent = '复制'; }, 2000);
    } else {
      showToast('复制失败，请手动复制邮箱', 'error');
    }
  });
  for (const track of ['', ...guidesController.getTracks()]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-channel-btn';
    button.dataset.guideTrack = track;
    button.textContent = track || '全部';
    dom.guideTrackTabs.appendChild(button);
  }
  dom.primaryPillars.addEventListener('click', event => {
    const button = event.target.closest('[data-pillar]');
    if (!button || !dom.primaryPillars.contains(button)) return;
    if (button.dataset.pillar === 'GUIDES') {
      openGuides();
    } else {
      const wasReading = Boolean(readerItem);
      leaveReaderForChannel(dom);
      resetFilters(dom, { push: !wasReading });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  });
  dom.guideTrackTabs.addEventListener('click', event => {
    const button = event.target.closest('[data-guide-track]');
    if (!button || !dom.guideTrackTabs.contains(button)) return;
    guidesController.setTrack(button.dataset.guideTrack);
  });
  dom.homeGuidesStrip?.addEventListener('click', event => {
    const button = event.target.closest('[data-home-guide], [data-home-guides-all]');
    if (!button || !dom.homeGuidesStrip.contains(button)) return;
    if (button.hasAttribute('data-home-guides-all')) {
      openGuides();
      return;
    }
    const step = Number.parseInt(button.dataset.homeGuideStep || '', 10);
    openGuides(button.dataset.homeGuide, Number.isFinite(step) ? step : null);
  });
  document.getElementById('visit-mark-read').addEventListener('click', acknowledgeVisit);
  document.querySelector('nav a[href="#top"]').addEventListener('click', event => {
    if (!readerItem || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  dom.detail.addEventListener('click', event => {
    if (readerItem && event.target.closest('[data-bookmark]')) toggleBookmark(readerItem.id, dom);
  });
  window.addEventListener('keydown', event => {
    if (readerItem && event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      closeIntelReader();
    }
  });

  // Resolve related intel lazily when the model row is expanded.
  dom.catalog.addEventListener('toggle', event => {
    const row = event.target;
    if (!row.matches('#model-rows details[open]') || row.querySelector('[data-related-intel-id]')) return;
    const normalize = text => text.toLowerCase().replace(/[-_]+/g, ' ');
    const name = normalize(row.querySelector('summary').textContent.split(':').pop().replace(/ *\(free\)$/i, '').trim());
    if (!name) return;
    const item = intelData.items.find(entry => {
      const text = normalize([entry.title, entry.tldr].join(' '));
      const index = text.indexOf(name);
      if (index < 0) return false;
      return !/[a-z0-9]/.test(text.charAt(index - 1)) && !/[a-z0-9]/.test(text.charAt(index + name.length));
    });
    if (!item) return;
    const link = document.createElement('a');
    link.className = 'story-link';
    link.dataset.relatedIntelId = item.id;
    const url = new URL(location.href);
    url.searchParams.set('id', item.id);
    link.href = url.href;
    link.textContent = '相关情报 · ' + item.title;
    link.addEventListener('click', click => {
      if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return;
      click.preventDefault();
      openIntelReader(item, link);
    });
    row.append(link);
  }, true);
  dom.controls.addEventListener('click', event => {
    const button = event.target.closest('[data-density]');
    if (!button || state.density === button.dataset.density) return;
    state.density = button.dataset.density;
    render(dom);
  });
  dom.savedFilter.addEventListener('click', () => {
    state.onlySaved = !state.onlySaved;
    render(dom);
  });
  dom.main.addEventListener('click', event => {
    const button = event.target.closest('[data-bookmark]');
    if (button) toggleBookmark(button.dataset.bookmark, dom);
  });
  window.addEventListener('storage', event => {
    if (event.key === SAVED_KEY || event.key === null) {
      saved = readSaved();
      render(dom);
    }
  });

  if (dom.themeToggleBtn) {
    dom.themeToggleBtn.addEventListener('click', () => {
      toggleTheme();
    });
  }

  if (dom.channelTabs) {
    dom.channelTabs.addEventListener('click', (event) => {
      const targetBtn = event.target.closest('[data-channel]');
      if (!targetBtn || !dom.channelTabs.contains(targetBtn)) return;
      const nextChannel = (targetBtn.dataset.channel || 'ALL').toUpperCase();
      if (nextChannel === state.channel && !readerItem) return;
      const wasReading = Boolean(readerItem);
      leaveReaderForChannel(dom);
      state.channel = nextChannel;
      state.type = 'ALL';
      if (nextChannel !== 'INTEL') state.vendor = 'ALL';
      render(dom, { push: !wasReading });
    });
  }

  if (dom.subTypeTabs) {
    dom.subTypeTabs.addEventListener('click', (event) => {
      const targetBtn = event.target.closest('[data-filter-type]');
      if (!targetBtn || !dom.subTypeTabs.contains(targetBtn)) return;
      const nextType = (targetBtn.dataset.filterType || 'ALL').toUpperCase();
      if (nextType === state.type) return;

      state.type = nextType;
      render(dom);
    });
  }

  if (dom.vendorChips) {
    dom.vendorChips.addEventListener('click', (event) => {
      const targetBtn = event.target.closest('[data-vendor]');
      if (!targetBtn || !dom.vendorChips.contains(targetBtn)) return;
      const nextVendor = targetBtn.dataset.vendor || 'ALL';
      if (nextVendor === state.vendor) return;

      state.vendor = nextVendor;
      render(dom);
    });
  }

  if (dom.toggleHideFixed) {
    dom.toggleHideFixed.checked = !state.showFixed;
    dom.toggleHideFixed.addEventListener('change', () => {
      state.showFixed = !dom.toggleHideFixed.checked;
      render(dom);
    });
  }

  if (dom.searchInput) {
    dom.searchInput.value = state.query;
    dom.searchInput.addEventListener('input', () => {
      state.query = dom.searchInput.value;
      render(dom);
    });
    dom.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dom.searchInput.value) {
        event.stopPropagation();
        state.query = '';
        dom.searchInput.value = '';
        render(dom);
      }
    });
  }

  if (dom.searchClearBtn) {
    dom.searchClearBtn.addEventListener('click', () => {
      state.query = '';
      if (dom.searchInput) {
        dom.searchInput.value = '';
        dom.searchInput.focus();
      }
      render(dom);
    });
  }

  if (dom.resetFiltersBtn) {
    dom.resetFiltersBtn.addEventListener('click', () => {
      resetFilters(dom);
      showToast('已恢复默认浏览', 'info');
    });
  }
}

function getState() {
  return { ...state, theme: currentTheme };
}

function getData() {
  return {
    data: intelData,
    source: dataSource,
    stats: statsCache ? { ...statsCache } : null,
  };
}

function getPosterController() {
  return posterController;
}

async function bootstrap() {
  const dom = getDomRefs();
  domRefs = dom;

  applyTheme(readInitialTheme(), { persist: false, dispatch: false });

  try {
    const [loaded, modelCatalog, guidesMod] = await Promise.all([
      loadIntelData(),
      initCatalog(syncUrl, openGuides),
      initGuides({
        onChange: options => {
          updateNavigation(dom);
          updateMasthead(dom, statsCache);
          renderHomeGuidesStrip(dom);
          syncUrl(options);
        },
        onToast: showToast,
      }),
    ]);
    catalog = modelCatalog;
    guidesController = guidesMod;
    intelData =
      loaded && loaded.data && Array.isArray(loaded.data.items)
        ? loaded.data
        : { updated_at: '', items: [] };
    dataSource = loaded?.source || 'fallback';
  } catch (err) {
    console.error('[AI Intel Radar] Failed to load intel data:', err);
    intelData = { updated_at: '', items: [] };
    dataSource = 'fallback';
    showToast('情报加载失败，请刷新重试', 'error');
  }

  statsCache = computeStats(intelData);
  bindEvents(dom);
  recordVisit();

  try {
    posterController = initPosterGenerator({
      getItems: () => [...new Map([...saved, ...intelData.items.map(item => [item.id, item])]).values()],
      getFilteredItems: filteredItems,
      getUpdatedAt: () => intelData.updated_at || '',
      triggerButton: dom.openPosterBtn,
      mountRoot: dom.posterDrawerRoot,
      onToast: showToast,
    });
  } catch (err) {
    console.error('[AI Intel Radar] Failed to initialize poster generator:', err);
    showToast('速报生成器初始化异常', 'error');
  }

  configureReader({
    onOpen: (item, trigger) => openReaderRoute(dom, item, trigger),
    backLabel: () => ['MODELS', 'GUIDES'].includes(state.channel) ? '← 返回上一页' : '← 返回情报列表',
    onClose() {
      if (!readerItem || returningFromReader) return;
      returningFromReader = true;
      history.back();
    },
    openPoster: item => posterController?.openItem(item),
    matchVendor: item => catalog?.matchVendor(item),
    getGuides: () => guidesController.getGuides(),
    openGuides,
    openPrices(params) {
      leaveReaderForChannel(dom);
      state.channel = 'MODELS';
      state.vendor = 'ALL';
      state.type = 'ALL';
      catalog.restore(params);
      render(dom);
      document.getElementById('model-vendor').focus();
    },
  });
  restoreUrl(dom);
  window.addEventListener('popstate', () => restoreUrl(dom));

  try {
    accountController = initAccount({
      triggerButton: dom.accountTriggerBtn,
      menuRoot: dom.accountMenuRoot,
      modalRoot: dom.accountModalRoot,
      getLocalBookmarkIds: () => [...new Set([...readSaved().keys(), ...saved.keys()])],
      onSyncBookmarks: (ids) => mergeSyncedBookmarks(ids, dom),
      onToast: showToast,
      getTheme: () => currentTheme,
    });
  } catch (err) {
    console.error('[AI Intel Radar] Account module initialization skipped:', err);
  }

  window.__RADAR_APP__ = {
    getState,
    getData,
    getPosterController,
    getAccountController: () => accountController,
    getGuidesController: () => guidesController,
    getGuides: () => guidesController.getGuides(),
    openGuides,
    toggleTheme,
    openReaderById: (itemId) => {
      const target = (intelData.items || []).find((it) => it.id === itemId) || saved.get(itemId);
      if (target) openIntelReader(target);
    },
    closeReader: closeIntelReader,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
