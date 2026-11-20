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

export async function initCatalog(onChange) {
  const byId = id => document.getElementById(id);
  const panel = byId('model-panel');
  const query = byId('model-search');
  const vendor = byId('model-vendor');
  const free = byId('model-free');
  const sort = byId('model-sort');
  const input = byId('budget-input');
  const output = byId('budget-output');
  const summary = byId('model-summary');
  const rows = byId('model-rows');
  let catalog = offlineCatalog;
  summary.textContent = '正在读取模型目录…';
  try {
    const response = await fetch('./data/models_catalog.json', { cache: 'no-cache' });
    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload.models) && typeof payload.updated_at === 'string') catalog = payload;
    }
  } catch {
    // Use the dated offline snapshot.
  }

  for (const name of [...new Set(catalog.models.map(model => model.vendor))].sort()) {
    vendor.add(new Option(name, name));
  }

  function render() {
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
      const heading = document.createElement('th');
      heading.scope = 'row';
      const info = document.createElement('details');
      const name = document.createElement('summary');
      name.textContent = model.name;
      const description = document.createElement('p');
      description.textContent = model.description;
      info.append(name, description);
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

  panel.addEventListener('input', () => {
    render();
    onChange();
  });
  render();
  return { restore, parameters, matchVendor };
}
