import {
  loadIntelData,
  computeStats,
  filterItems,
  computeCategoryCounts,
} from './data.js';
import { renderIntelCards, showToast } from './card.js';
import { initPosterGenerator } from './poster.js';

const TYPE_LABELS = {
  ALL: '全部',
  DEAL: '算力羊毛 DEAL',
  BUG: '漏洞避坑 BUG',
  HACK: '极客技巧 HACK',
};

const SOURCE_META = {
  'web-data': {
    label: 'LIVE JSON',
    title: '实时加载自 ./data/intel_data.json',
    tone: 'live',
  },
  'root-data': {
    label: 'LIVE JSON',
    title: '实时加载自 ../data/intel_data.json',
    tone: 'live',
  },
  fallback: {
    label: '离线兜底',
    title: '网络或本地文件受限，已启用内置兜底情报库',
    tone: 'fallback',
  },
};

const TAB_ACCENT_STYLES = {
  ALL: {
    activeBtn: [
      'is-active',
      'bg-emerald-500/15',
      'text-emerald-200',
      'border-emerald-500/60',
    ],
    activeCount: ['text-emerald-300'],
  },
  DEAL: {
    activeBtn: [
      'is-active',
      'bg-emerald-500/15',
      'text-emerald-200',
      'border-emerald-500/60',
    ],
    activeCount: ['text-emerald-300'],
  },
  BUG: {
    activeBtn: [
      'is-active',
      'bg-red-500/15',
      'text-red-200',
      'border-red-500/60',
    ],
    activeCount: ['text-red-300'],
  },
  HACK: {
    activeBtn: [
      'is-active',
      'bg-cyan-500/15',
      'text-cyan-200',
      'border-cyan-500/60',
    ],
    activeCount: ['text-cyan-300'],
  },
};

const ALL_TAB_ACTIVE_BTN_CLASSES = [
  'is-active',
  'bg-emerald-500/15',
  'text-emerald-200',
  'text-emerald-300',
  'border-emerald-500/50',
  'border-emerald-500/60',
  'bg-red-500/15',
  'text-red-200',
  'border-red-500/60',
  'bg-cyan-500/15',
  'text-cyan-200',
  'border-cyan-500/60',
];

const ALL_TAB_COUNT_CLASSES = [
  'text-emerald-300',
  'text-red-300',
  'text-cyan-300',
  'text-slate-400',
];

const TAB_INACTIVE_CLASSES = [
  'bg-slate-900/75',
  'text-slate-300',
  'border-slate-800',
];

const SOURCE_LIVE_CLASSES = ['text-emerald-300'];

const SOURCE_FALLBACK_CLASSES = ['text-amber-300'];

const state = {
  type: 'ALL',
  showFixed: false,
  query: '',
};

let intelData = {
  updated_at: '',
  items: [],
};
let dataSource = 'fallback';
let statsCache = null;
let posterController = null;

function getDomRefs() {
  return {
    statActiveDeals: document.getElementById('stat-active-deals'),
    statActiveAlerts: document.getElementById('stat-active-alerts'),
    statUpdatedAt: document.getElementById('stat-updated-at'),
    statDataSource: document.getElementById('stat-data-source'),
    categoryTabs: document.getElementById('category-tabs'),
    toggleShowFixed: document.getElementById('toggle-show-fixed'),
    fixedCountLabel: document.getElementById('fixed-count-label'),
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    resultsSummary: document.getElementById('results-summary'),
    feedEl: document.getElementById('intel-feed'),
    emptyState: document.getElementById('empty-state'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    openPosterBtn: document.getElementById('open-poster-btn'),
    posterDrawerRoot: document.getElementById('poster-drawer-root'),
  };
}

function updateStatsDashboard(dom, stats, source) {
  if (dom.statActiveDeals) {
    dom.statActiveDeals.textContent = String(stats.activeDeals ?? 0);
  }
  if (dom.statActiveAlerts) {
    dom.statActiveAlerts.textContent = String(stats.activeBugs ?? 0);
  }
  if (dom.statUpdatedAt) {
    dom.statUpdatedAt.textContent =
      stats.updatedAtFormatted || stats.updatedAtRaw || '--';
    if (stats.updatedAtRaw) {
      dom.statUpdatedAt.setAttribute('title', stats.updatedAtRaw);
    }
  }
  if (dom.statDataSource) {
    const meta = SOURCE_META[source] || SOURCE_META.fallback;
    dom.statDataSource.textContent = meta.label;
    dom.statDataSource.setAttribute('title', meta.title);
    dom.statDataSource.dataset.source = source;

    dom.statDataSource.classList.remove(
      ...SOURCE_LIVE_CLASSES,
      ...SOURCE_FALLBACK_CLASSES
    );
    if (meta.tone === 'live') {
      dom.statDataSource.classList.add(...SOURCE_LIVE_CLASSES);
    } else {
      dom.statDataSource.classList.add(...SOURCE_FALLBACK_CLASSES);
    }
  }
}

function updateFixedCountLabel(dom, stats) {
  if (!dom.fixedCountLabel) return;
  const fixedCount = stats?.fixedCount ?? 0;
  if (fixedCount <= 0) {
    dom.fixedCountLabel.textContent = '(0 条)';
    return;
  }
  dom.fixedCountLabel.textContent = state.showFixed
    ? `(${fixedCount} 条已展开)`
    : `(${fixedCount} 条已折叠)`;
}

function updateCategoryTabs(dom, counts) {
  if (!dom.categoryTabs) return;
  const buttons = dom.categoryTabs.querySelectorAll('[data-filter-type]');
  buttons.forEach((btn) => {
    const filterType = (btn.dataset.filterType || 'ALL').toUpperCase();
    const isActive = filterType === state.type;
    const accent = TAB_ACCENT_STYLES[filterType] || TAB_ACCENT_STYLES.ALL;

    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.dataset.active = isActive ? 'true' : 'false';

    btn.classList.remove(...ALL_TAB_ACTIVE_BTN_CLASSES, ...TAB_INACTIVE_CLASSES);
    if (isActive) {
      btn.classList.add(...accent.activeBtn);
    } else {
      btn.classList.add(...TAB_INACTIVE_CLASSES);
    }

    const countEl = btn.querySelector('[data-tab-count]');
    if (countEl) {
      const countKey = (countEl.dataset.tabCount || filterType).toUpperCase();
      countEl.textContent = String(counts[countKey] ?? 0);
      countEl.classList.remove(...ALL_TAB_COUNT_CLASSES);
      if (isActive) {
        countEl.classList.add(...accent.activeCount);
      } else {
        countEl.classList.add('text-slate-400');
      }
    }
  });
}

function updateSearchClearButton(dom) {
  if (!dom.searchClearBtn) return;
  const hasQuery = Boolean(state.query && state.query.length > 0);
  dom.searchClearBtn.classList.toggle('hidden', !hasQuery);
  dom.searchClearBtn.classList.toggle('inline-flex', hasQuery);
  dom.searchClearBtn.setAttribute('aria-hidden', hasQuery ? 'false' : 'true');
}

function updateResultsSummary(dom, filteredCount, totalCount) {
  if (!dom.resultsSummary) return;
  const parts = [`当前显示 ${filteredCount} / ${totalCount} 条情报`];

  if (state.type !== 'ALL') {
    parts.push(`分类：${TYPE_LABELS[state.type] || state.type}`);
  }
  if (!state.showFixed && (statsCache?.fixedCount ?? 0) > 0) {
    parts.push(`已折叠 ${statsCache.fixedCount} 条 FIXED`);
  } else if (state.showFixed) {
    parts.push('包含已失效条目');
  }
  const trimmedQuery = state.query.trim();
  if (trimmedQuery) {
    parts.push(`关键词：“${trimmedQuery}”`);
  }

  dom.resultsSummary.textContent = parts.join(' · ');
}

function render(dom) {
  const items = Array.isArray(intelData.items) ? intelData.items : [];
  const counts = computeCategoryCounts(items, {
    showFixed: state.showFixed,
    query: state.query,
  });
  const filtered = filterItems(items, {
    type: state.type,
    showFixed: state.showFixed,
    query: state.query,
  });

  updateCategoryTabs(dom, counts);
  updateFixedCountLabel(dom, statsCache);
  updateSearchClearButton(dom);
  updateResultsSummary(dom, filtered.length, items.length);

  if (dom.feedEl) {
    renderIntelCards(dom.feedEl, filtered);
    dom.feedEl.classList.toggle('hidden', filtered.length === 0);
  }
  if (dom.emptyState) {
    dom.emptyState.classList.toggle('hidden', filtered.length > 0);
  }
}

function resetFilters(dom) {
  state.type = 'ALL';
  state.showFixed = false;
  state.query = '';

  if (dom.toggleShowFixed) {
    dom.toggleShowFixed.checked = false;
  }
  if (dom.searchInput) {
    dom.searchInput.value = '';
  }

  render(dom);
}

function bindEvents(dom) {
  if (dom.categoryTabs) {
    dom.categoryTabs.addEventListener('click', (event) => {
      const targetBtn = event.target.closest('[data-filter-type]');
      if (!targetBtn || !dom.categoryTabs.contains(targetBtn)) return;
      const nextType = (targetBtn.dataset.filterType || 'ALL').toUpperCase();
      if (nextType === state.type) return;
      state.type = nextType;
      render(dom);
    });
  }

  if (dom.toggleShowFixed) {
    dom.toggleShowFixed.checked = state.showFixed;
    dom.toggleShowFixed.addEventListener('change', () => {
      state.showFixed = Boolean(dom.toggleShowFixed.checked);
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
      showToast('已重置全部筛选条件', 'info');
    });
  }
}

function getState() {
  return { ...state };
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

  try {
    const loaded = await loadIntelData();
    intelData =
      loaded && loaded.data && Array.isArray(loaded.data.items)
        ? loaded.data
        : { updated_at: '', items: [] };
    dataSource = loaded?.source || 'fallback';
  } catch (err) {
    console.error('[AI Intel Radar] Failed to load intel data:', err);
    intelData = { updated_at: '', items: [] };
    dataSource = 'fallback';
    showToast('情报数据加载失败，请刷新重试', 'error');
  }

  statsCache = computeStats(intelData);
  updateStatsDashboard(dom, statsCache, dataSource);
  bindEvents(dom);
  render(dom);

  try {
    posterController = initPosterGenerator({
      getItems: () => (Array.isArray(intelData.items) ? intelData.items : []),
      getUpdatedAt: () => intelData.updated_at || '',
      triggerButton: dom.openPosterBtn,
      mountRoot: dom.posterDrawerRoot,
      onToast: showToast,
    });
  } catch (err) {
    console.error('[AI Intel Radar] Failed to initialize poster generator:', err);
    showToast('战报生成器初始化异常', 'error');
  }

  window.__RADAR_APP__ = {
    getState,
    getData,
    getPosterController,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
