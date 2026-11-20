const offlineCatalog = {
  "updated_at": "2026-11-19T10:38:18.668701+00:00",
  "models": [
    {
      "id": "anthropic/claude-fable-5.2",
      "name": "Anthropic: Claude Fable 5.2",
      "vendor": "Anthropic",
      "created_at": "2026-11-09T19:49:41+00:00",
      "context_length": 1000000,
      "input_per_m": 8.0,
      "output_per_m": 40.0,
      "is_free": false,
      "description": "Claude Fable 5.2 is Anthropic's most capable model for the most demanding technical work, with gains over Fable 5.1 in coding, reasoning, and vision. In prerelease testing it completed otherwise-infeasible..."
    },
    {
      "id": "anthropic/claude-haiku-5.5",
      "name": "Anthropic: Claude Haiku 5.5",
      "vendor": "Anthropic",
      "created_at": "2026-10-07T18:31:23+00:00",
      "context_length": 1000000,
      "input_per_m": 0.1,
      "output_per_m": 0.5,
      "is_free": false,
      "description": "Claude Haiku 5.5 is Anthropic's small, fast model for high-volume, cost-sensitive work such as summarization, subagents, and browser use. It succeeds Claude Haiku 4.5 with stronger coding, computer use, and..."
    },
    {
      "id": "baidu/ernie-5.5-flash-preview:free",
      "name": "Baidu: ERNIE-5.5-Flash-Preview (free)",
      "vendor": "baidu",
      "created_at": "2026-11-10T17:58:53+00:00",
      "context_length": 1024000,
      "input_per_m": 0.0,
      "output_per_m": 0.0,
      "is_free": true,
      "description": "ERNIE 5.5 Flash Preview is the latest foundation model in the ERNIE family, with comprehensive improvements in coding, agentic capabilities, knowledge work, and deep research. It has 280 billion total..."
    }
  ]
};

const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function utcDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return time / 86400000;
}

export async function initCatalog(onChange, onOpenGuides) {
  const byId = id => document.getElementById(id);
  const panel = byId('model-panel');
  const query = byId('model-search');
  const vendor = byId('model-vendor');
  const free = byId('model-free');
  const sort = byId('model-sort');
  const input = byId('budget-input');
  const output = byId('budget-output');
  const summary = byId('model-summary');
  const changesSummary = byId('model-changes');
  const rows = byId('model-rows');
  const priceLabels = { input_per_m: '输入', output_per_m: '输出', cache_read_per_m: '缓存读取' };
  const priceChanges = new Map();
  const newFree = new Set();
  const expiring = new Map();
  let catalog = offlineCatalog;
  summary.textContent = '正在读取模型目录…';
  if (changesSummary) {
    changesSummary.hidden = true;
    changesSummary.textContent = '';
  }
  try {
    const response = await fetch('./data/models_catalog.json', { cache: 'no-cache' });
    if (response.ok) {
      const payload = await response.json();
      if (isRecord(payload) && Array.isArray(payload.models) && typeof payload.updated_at === 'string' &&
          payload.updated_at && payload.models.every(model => isRecord(model) && model.id &&
            ['id', 'name', 'vendor', 'created_at'].every(field => typeof model[field] === 'string') &&
            (model.description == null || typeof model.description === 'string'))) catalog = payload;
    }
  } catch {
    // Use the dated offline snapshot.
  }

  const modelsById = new Map(catalog.models.map(model => [model.id, model]));
  let changes = null;
  if (catalog !== offlineCatalog) {
    try {
      const response = await fetch('./data/catalog_changes.json', { cache: 'no-cache' });
      if (response.ok) {
        const payload = await response.json();
        if (isRecord(payload) && payload.updated_at === catalog.updated_at &&
            ['price_changes', 'new_free', 'expiring'].every(key => Array.isArray(payload[key])) &&
            payload.price_changes.every(change => isRecord(change) && typeof change.id === 'string' &&
              typeof change.field === 'string' && Object.hasOwn(priceLabels, change.field) &&
              [change.old, change.new].every(value => Number.isFinite(value) && value >= 0) &&
              change.old !== change.new && modelsById.get(change.id)?.[change.field] === change.new &&
              (change.change_pct === null || Number.isFinite(change.change_pct))) &&
            payload.new_free.every(id => typeof id === 'string' && modelsById.get(id)?.is_free === true) &&
            payload.expiring.every(change => isRecord(change) && typeof change.id === 'string' &&
              Number.isInteger(change.days_remaining) && change.days_remaining >= 0 && change.days_remaining <= 30 &&
              utcDay(change.expiration_date) !== null &&
              modelsById.get(change.id)?.expiration_date === change.expiration_date)) changes = payload;
      }
    } catch {}
  }
  if (changes) {
    for (const change of changes.price_changes) {
      if (!priceChanges.has(change.id)) priceChanges.set(change.id, new Map());
      priceChanges.get(change.id).set(change.field, priceLabels[change.field] + ' $' + decimal.format(change.old) +
        ' → $' + decimal.format(change.new) + ' / 百万 Token');
    }
    for (const id of changes.new_free) newFree.add(id);
    for (const change of changes.expiring) expiring.set(change.id, utcDay(change.expiration_date));
  }

  for (const name of [...new Set(catalog.models.map(model => model.vendor))].sort()) {
    vendor.add(new Option(name, name));
  }

  function render() {
    const today = Math.floor(Date.now() / 86400000);
    const expiringSoon = new Map([...expiring].filter(([, day]) => day >= today && day <= today + 30));
    if (changesSummary) {
      const counts = [['近期调价', priceChanges.size], ['新增免费', newFree.size], ['30 天内到期', expiringSoon.size]];
      const text = counts.filter(([, count]) => count).map(([label, count]) => label + ' ' + count + ' 款').join(' · ');
      changesSummary.textContent = text;
      changesSummary.hidden = !text;
    }
    const keyword = query.value.trim().toLowerCase();
    const models = catalog.models.filter(model =>
      (free.value !== 'free' || model.is_free) &&
      (!vendor.value || model.vendor === vendor.value) &&
      [model.name, model.vendor, model.description, model.id].some(value => value?.toLowerCase().includes(keyword))
    );
    const field = sort.value;
    models.sort((a, b) => {
      if (field === 'created_at') return Date.parse(b.created_at) - Date.parse(a.created_at);
      if (field === 'context_length') return b[field] - a[field];
      return a[field] - b[field];
    });
    const quantity = control => Math.max(0, control.valueAsNumber || 0);
    const monthlyInput = quantity(input);
    const monthlyOutput = quantity(output);
    const validBudget = [input, output].every(control => control.validity.valid);
    const fragment = document.createDocumentFragment();
    for (const model of models) {
      const row = document.createElement('tr');
      row.dataset.modelId = model.id;
      const heading = document.createElement('th');
      heading.scope = 'row';
      const info = document.createElement('details');
      const name = document.createElement('summary');
      name.textContent = model.name;
      const description = document.createElement('p');
      description.textContent = model.description;
      const fields = document.createElement('dl');
      fields.className = 'catalog-model-fields';
      for (const [label, value] of [
        ['缓存读取单价', Number.isFinite(model.cache_read_per_m) && model.cache_read_per_m >= 0 ?
          '$' + decimal.format(model.cache_read_per_m) + ' / 百万 Token' : '未公布'],
        ['最大输出 Token', Number.isInteger(model.max_completion_tokens) && model.max_completion_tokens >= 0 ?
          decimal.format(model.max_completion_tokens) : '未公布'],
        ['工具调用', model.supports_tools === true ? '支持' : model.supports_tools === false ? '不支持' : '未知'],
        ['到期日期', utcDay(model.expiration_date) !== null ? model.expiration_date : '未公布']
      ]) {
        const term = document.createElement('dt');
        term.textContent = label;
        const detail = document.createElement('dd');
        detail.textContent = value;
        fields.append(term, detail);
      }
      info.append(name, description, fields);
      const notes = [];
      if (priceChanges.has(model.id)) notes.push('近期调价：' + [...priceChanges.get(model.id).values()].join('；'));
      if (newFree.has(model.id)) notes.push('新增免费模型');
      if (expiringSoon.has(model.id)) {
        const days = expiringSoon.get(model.id) - today;
        notes.push(model.expiration_date + ' 到期' + (days === 0 ? '（今日到期）' : '（剩余 ' + days + ' 天）'));
      }
      if (notes.length) {
        const note = document.createElement('p');
        note.className = 'catalog-model-note';
        note.textContent = notes.join('；');
        info.append(note);
      }
      heading.append(info);
      row.append(heading);
      const cost = monthlyInput * model.input_per_m + monthlyOutput * model.output_per_m;
      const monthly = validBudget && Number.isFinite(cost) ? '$' + decimal.format(cost) + ' / 月' : '请检查用量';
      for (const value of [
        '$' + decimal.format(model.input_per_m), '$' + decimal.format(model.output_per_m),
        decimal.format(model.context_length), model.created_at.slice(0, 10), model.is_free ? '免费' : monthly
      ]) {
        const cell = row.insertCell();
        cell.textContent = value;
      }
      fragment.append(row);
    }
    rows.replaceChildren(fragment);
    const source = catalog === offlineCatalog ? '离线样本' : '目录更新';
    const count = models.length ? models.length + ' 款模型' : '没有匹配的模型';
    summary.textContent = [count, '单价为美元 / 百万 Token', source + ' ' + catalog.updated_at.slice(0, 10)].join(' · ');
  }

  const controls = { q: query, vendor, free, sort, input, output };
  const defaults = { q: '', vendor: '', free: 'all', sort: 'input_per_m', input: '1', output: '1' };

  function restore(params) {
    for (const [key, control] of Object.entries(controls)) {
      control.value = params.get(key) ?? defaults[key];
      if (!control.validity.valid || (control instanceof HTMLSelectElement && control.selectedIndex < 0)) {
        control.value = defaults[key];
      }
    }
    render();
  }

  function parameters() {
    const result = {};
    for (const [key, control] of Object.entries(controls)) {
      if (control.value !== defaults[key]) result[key] = control.value;
    }
    return result;
  }

  function matchVendor(item) {
    const normalize = text => String(text || '').toLowerCase().replace(/[-_/]+/g, ' ').trim();
    const models = catalog.models;
    const direct = models.find(model => normalize(item.vendor) === normalize(model.vendor));
    if (direct) return direct.vendor;
    const article = normalize([item.title, item.vendor, item.tldr, ...(item.details || [])].join(' '));
    const mentions = term => {
      const words = normalize(term);
      if (!words) return false;
      let index = article.indexOf(words);
      while (index !== -1) {
        const before = article[index - 1] || '';
        const after = article[index + words.length] || '';
        if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
        index = article.indexOf(words, index + 1);
      }
      return false;
    };
    const model = models.find(entry => mentions(entry.name.split(':').pop().replace(/ *\(free\)$/i, '')) ||
      mentions(entry.id.split('/').pop()));
    return (model || models.find(entry => mentions(entry.vendor)))?.vendor;
  }

  byId('model-guides-link')?.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey ||
        event.altKey || typeof onOpenGuides !== 'function') return;
    event.preventDefault();
    onOpenGuides();
  });
  panel.addEventListener('input', () => {
    render();
    onChange();
  });
  render();
  return { restore, parameters, matchVendor };
}
