// ===================== CONFIG =====================
const STORAGE_KEY = 'notion_frontend_config';

let CONFIG = {
  token: '',
  databaseId: 'e5c32b2164118339ac91012533289a01' // 已更新為你正確的 Database ID
};

// Property name mapping (adjust if your Notion properties have different names)
const PROP = {
  title: '主題',           // Title
  url: '網址',             // URL
  category: '收藏類型',    // Select
  date: '加入日期',        // Date
  unread: '待讀',          // Checkbox (optional)
  featured: '精華',        // Checkbox (optional)
  author: '作者',
  tags: '標籤',
  content: '內容',
  notes: '筆記'
};

// ===================== STATE =====================
let allPages = [];
let filteredPages = [];
let currentTab = 'list';
let currentFilter = {
  category: null,
  search: '',
  month: null,
  unread: false,
  featured: false,
  view: 'all'
};
let propertySchema = {};

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  if (CONFIG.token && CONFIG.databaseId) {
    initApp();
  } else {
    showSetup();
  }
});

function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      CONFIG.token = parsed.token || '';
      CONFIG.databaseId = (parsed.databaseId || CONFIG.databaseId).replace(/-/g, '');
    }
  } catch (e) {}
}

function saveConfig() {
  const token = document.getElementById('token-input').value.trim();
  const dbid = document.getElementById('dbid-input').value.trim().replace(/-/g, '');
  
  if (!token) {
    showSetupError('請輸入 Integration Token');
    return;
  }
  if (!dbid || dbid.length < 32) {
    showSetupError('Database ID 格式不正確');
    return;
  }

  CONFIG.token = token;
  CONFIG.databaseId = dbid;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(CONFIG));
  
  document.getElementById('setup-modal').classList.add('hidden');
  document.getElementById('setup-modal').classList.remove('flex');
  initApp();
}

function showSetup() {
  document.getElementById('setup-modal').classList.remove('hidden');
  document.getElementById('setup-modal').classList.add('flex');
  document.getElementById('token-input').value = CONFIG.token || '';
  document.getElementById('dbid-input').value = CONFIG.databaseId || '';
  document.getElementById('setup-error').classList.add('hidden');
}

function showSetupError(msg) {
  const el = document.getElementById('setup-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ===================== NOTION API =====================
async function notionFetch(endpoint, options = {}) {
  const workerUrl = 'https://notion-proxy.haydenchow0607.workers.dev';
  const targetUrl = `${workerUrl}/v1${endpoint}`;

  const res = await fetch(targetUrl, {
    ...options,
    headers: {
      'Authorization': `Bearer ${CONFIG.token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API Error ${res.status}`);
  }
  return res.json();
}

async function fetchAllPages() {
  const pages = [];
  let cursor = undefined;
  
  do {
    const body = {
      page_size: 100,
      sorts: [{ property: PROP.date, direction: 'descending' }]
    };
    if (cursor) body.start_cursor = cursor;
    
    let data;
    try {
      data = await notionFetch(`/databases/${CONFIG.databaseId}/query`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
    } catch (e) {
      const fallbackBody = { page_size: 100 };
      if (cursor) fallbackBody.start_cursor = cursor;
      data = await notionFetch(`/databases/${CONFIG.databaseId}/query`, {
        method: 'POST',
        body: JSON.stringify(fallbackBody)
      });
    }
    
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  
  return pages;
}

async function fetchDatabaseSchema() {
  try {
    const db = await notionFetch(`/databases/${CONFIG.databaseId}`);
    return db.properties || {};
  } catch (e) {
    console.warn('Could not fetch schema:', e);
    return {};
  }
}

function parsePage(page) {
  const props = page.properties || {};
  
  const getTitle = (p) => {
    if (!p) return '';
    if (p.title) return p.title.map(t => t.plain_text).join('');
    if (p.rich_text) return p.rich_text.map(t => t.plain_text).join('');
    return '';
  };
  
  const getUrl = (p) => p?.url || '';
  const getSelect = (p) => p?.select?.name || '';
  const getMultiSelect = (p) => (p?.multi_select || []).map(s => s.name);
  const getDate = (p) => p?.date?.start || null;
  const getCheckbox = (p) => !!p?.checkbox;
  const getRichText = (p) => (p?.rich_text || []).map(t => t.plain_text).join('');
  
  let title = getTitle(props[PROP.title]);
  let url = getUrl(props[PROP.url]);
  let category = getSelect(props[PROP.category]);
  let date = getDate(props[PROP.date]);
  let unread = getCheckbox(props[PROP.unread]);
  let featured = getCheckbox(props[PROP.featured]);
  let author = getRichText(props[PROP.author]) || getTitle(props[PROP.author]);
  let tags = getMultiSelect(props[PROP.tags]);
  let content = getRichText(props[PROP.content]) || getRichText(props[PROP.notes]);
  
  if (!title) {
    for (const [key, val] of Object.entries(props)) {
      if (val.type === 'title') {
        title = getTitle(val);
        break;
      }
    }
  }
  if (!url) {
    for (const [key, val] of Object.entries(props)) {
      if (val.type === 'url') {
        url = getUrl(val);
        break;
      }
    }
  }
  if (!date) {
    for (const [key, val] of Object.entries(props)) {
      if (val.type === 'date') {
        date = getDate(val);
        break;
      }
    }
  }
  if (!category) {
    for (const [key, val] of Object.entries(props)) {
      if (val.type === 'select') {
        category = getSelect(val);
        break;
      }
    }
  }
  
  const allTags = new Set(tags);
  if (category) allTags.add(category);
  for (const [key, val] of Object.entries(props)) {
    if (val.type === 'multi_select') {
      val.multi_select.forEach(s => allTags.add(s.name));
    }
  }
  
  return {
    id: page.id,
    title: title || '無標題',
    url,
    category: category || '未分類',
    date,
    unread,
    featured,
    author: author || '',
    tags: Array.from(allTags),
    content,
    notionUrl: page.url,
    created: page.created_time,
    lastEdited: page.last_edited_time,
    raw: props
  };
}

// ===================== APP LOGIC =====================
async function initApp() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  
  try {
    propertySchema = await fetchDatabaseSchema();
    const rawPages = await fetchAllPages();
    allPages = rawPages.map(parsePage);
    
    allPages.sort((a, b) => {
      const da = a.date || a.created || '';
      const db = b.date || b.created || '';
      return db.localeCompare(da);
    });
    
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    
    updateSyncTime();
    renderSidebar();
    applyFilters();
    renderDiary();
    
  } catch (err) {
    console.error(err);
    document.getElementById('loading').classList.add('hidden');
    showSetup();
    showSetupError('連接失敗：' + err.message + '\n請確認 Token 同 Database 已分享俾 Integration');
  }
}

async function refreshData() {
  document.getElementById('loading').classList.remove('hidden');
  try {
    const rawPages = await fetchAllPages();
    allPages = rawPages.map(parsePage);
    allPages.sort((a, b) => {
      const da = a.date || a.created || '';
      const db = b.date || b.created || '';
      return db.localeCompare(da);
    });
    applyFilters();
    renderDiary();
    updateSyncTime();
  } catch (e) {
    alert('重新載入失敗：' + e.message);
  } finally {
    document.getElementById('loading').classList.add('hidden');
  }
}

function updateSyncTime() {
  const now = new Date();
  const str = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  document.getElementById('sync-time').textContent = `已同步 ${str}`;
}

// ===================== FILTERS =====================
function applyFilters() {
  currentFilter.search = document.getElementById('search-input')?.value?.trim().toLowerCase() || '';
  
  let result = [...allPages];
  
  if (currentFilter.view === 'unread') {
    result = result.filter(p => p.unread);
  } else if (currentFilter.view === 'featured') {
    result = result.filter(p => p.featured);
  } else if (currentFilter.view !== 'all') {
    result = result.filter(p => p.category === currentFilter.view || p.tags.includes(currentFilter.view));
  }
  
  if (currentFilter.category) {
    result = result.filter(p => p.category === currentFilter.category || p.tags.includes(currentFilter.category));
  }
  
  if (currentFilter.month) {
    result = result.filter(p => {
      const d = p.date || p.created;
      return d && d.startsWith(currentFilter.month);
    });
  }
  
  if (currentFilter.search) {
    const q = currentFilter.search;
    result = result.filter(p => 
      p.title.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q)) ||
      (p.content && p.content.toLowerCase().includes(q))
    );
  }
  
  const sort = document.getElementById('sort-select')?.value || 'newest';
  if (sort === 'newest') {
    result.sort((a, b) => (b.date || b.created || '').localeCompare(a.date || a.created || ''));
  } else if (sort === 'oldest') {
    result.sort((a, b) => (a.date || a.created || '').localeCompare(b.date || b.created || ''));
  } else if (sort === 'title') {
    result.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
  }
  
  filteredPages = result;
  renderArticleList();
  updateFilterUI();
}

function clearFilters() {
  currentFilter.category = null;
  currentFilter.month = null;
  currentFilter.search = '';
  currentFilter.view = 'all';
  document.getElementById('search-input').value = '';
  applyFilters();
  renderSidebar();
  renderCategoryChips();
}

function updateFilterUI() {
  const count = filteredPages.length;
  document.getElementById('result-count').textContent = `${count} 篇（共 ${allPages.length}）`;
  
  const hasFilter = currentFilter.category || currentFilter.month || currentFilter.search || currentFilter.view !== 'all';
  document.getElementById('clear-filters').classList.toggle('hidden', !hasFilter);
  
  const filterCount = [currentFilter.category, currentFilter.month, currentFilter.view !== 'all'].filter(Boolean).length;
  const badge = document.getElementById('filter-count');
  if (filterCount > 0) {
    badge.textContent = filterCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ===================== RENDER: SIDEBAR =====================
function getCategoryCounts() {
  const counts = {};
  allPages.forEach(p => {
    const cat = p.category || '未分類';
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return counts;
}

function renderSidebar() {
  const counts = getCategoryCounts();
  const unreadCount = allPages.filter(p => p.unread).length;
  const featuredCount = allPages.filter(p => p.featured).length;
  
  const items = [
    { id: 'all', label: '全部文章', count: allPages.length, icon: '📚' },
    { id: 'unread', label: '待讀', count: unreadCount, icon: '📖' },
    { id: 'featured', label: '精華', count: featuredCount, icon: '⭐' },
  ];
  
  const sortedCats = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  sortedCats.forEach(([name, count]) => {
    items.push({ id: name, label: name, count, icon: '🏷️' });
  });
  
  const html = items.map(item => {
    const active = currentFilter.view === item.id ? 'sidebar-item-active' : '';
    return `
      <button onclick="setView('${item.id.replace(/'/g, "\\'")}')" 
              class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-dark-700 ${active}">
        <span class="flex items-center gap-2 truncate">
          <span>${item.icon}</span>
          <span class="truncate">${item.label}</span>
        </span>
        <span class="text-xs text-gray-500">${item.count}</span>
      </button>
    `;
  }).join('');
  
  document.getElementById('sidebar-nav').innerHTML = html;
  document.getElementById('mobile-nav').innerHTML = html;
  
  renderCategoryChips();
}

function setView(viewId) {
  currentFilter.view = viewId;
  currentFilter.category = null;
  applyFilters();
  renderSidebar();
  document.getElementById('mobile-sidebar').classList.add('hidden');
}

function renderCategoryChips() {
  const counts = getCategoryCounts();
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  
  let html = `
    <button onclick="setCategory(null)" 
            class="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border ${!currentFilter.category ? 'bg-accent text-dark-950 border-accent' : 'bg-dark-800 border-dark-600 text-gray-300'}">
      全部
    </button>
  `;
  
  sorted.forEach(([name, count]) => {
    const active = currentFilter.category === name;
    html += `
      <button onclick="setCategory('${name.replace(/'/g, "\\'")}')" 
              class="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border ${active ? 'bg-accent text-dark-950 border-accent' : 'bg-dark-800 border-dark-600 text-gray-300'}">
        ${name} <span class="opacity-70">${count}</span>
      </button>
    `;
  });
  
  document.getElementById('category-chips').innerHTML = html;
}

function setCategory(cat) {
  currentFilter.category = cat;
  applyFilters();
  renderCategoryChips();
}

// ===================== RENDER: ARTICLE LIST =====================
function renderArticleList() {
  const container = document.getElementById('article-list');
  
  if (filteredPages.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 text-gray-500">
        <div class="text-4xl mb-3">📭</div>
        <p>沒有符合條件的文章</p>
      </div>
    `;
    return;
  }
  
  const groups = {};
  filteredPages.forEach(p => {
    const d = p.date || (p.created ? p.created.slice(0, 10) : '未知日期');
    if (!groups[d]) groups[d] = [];
    groups[d].push(p);
  });
  
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  
  let html = '';
  sortedDates.forEach(dateStr => {
    const pages = groups[dateStr];
    const dateObj = new Date(dateStr);
    const day = dateObj.getDate();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = isNaN(dateObj) ? '' : `週${weekdays[dateObj.getDay()]}`;
    const monthLabel = isNaN(dateObj) ? dateStr : `${dateObj.getMonth() + 1}月`;
    
    html += `
      <div class="flex gap-3 fade-in">
        <div class="w-12 shrink-0 text-center pt-1">
          <div class="text-xl font-bold text-white">${isNaN(day) ? '–' : day}</div>
          <div class="text-xs text-gray-500">${monthLabel}</div>
          <div class="text-xs text-gray-600">${weekday}</div>
          <div class="w-2 h-2 rounded-full bg-accent mx-auto mt-2"></div>
          <div class="w-px h-full bg-dark-600 mx-auto mt-1" style="min-height: 20px;"></div>
        </div>
        
        <div class="flex-1 space-y-3 pb-4">
          ${pages.map(p => renderArticleCard(p)).join('')}
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function renderArticleCard(p) {
  const tagsHtml = p.tags.slice(0, 4).map(t => 
    `<span class="inline-block px-2 py-0.5 rounded-md text-xs bg-dark-600 text-gray-300">${escapeHtml(t)}</span>`
  ).join(' ');
  
  const badges = [];
  if (p.unread) badges.push('<span class="text-xs text-amber-400">待讀</span>');
  if (p.featured) badges.push('<span class="text-xs text-yellow-400">⭐精華</span>');
  
  return `
    <div class="bg-dark-800 rounded-xl p-3.5 border border-dark-600 card-hover cursor-pointer" onclick="openDetail('${p.id}')">
      <div class="flex gap-3">
        <div class="w-10 h-10 rounded-full bg-dark-600 flex items-center justify-center text-lg shrink-0">
          ${p.author ? p.author[0].toUpperCase() : '@'}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-medium text-white text-sm leading-snug line-clamp-2">${escapeHtml(p.title)}</h3>
          <div class="flex items-center gap-2 mt-1 text-xs text-gray-500">
            ${p.author ? `<span>@${escapeHtml(p.author)}</span>` : ''}
            ${p.date ? `<span>${p.date}</span>` : ''}
            ${badges.join('')}
          </div>
          ${tagsHtml ? `<div class="flex flex-wrap gap-1.5 mt-2">${tagsHtml}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ===================== DETAIL MODAL =====================
function openDetail(id) {
  const p = allPages.find(x => x.id === id);
  if (!p) return;
  
  const tagsHtml = p.tags.map(t => 
    `<span class="inline-block px-2.5 py-1 rounded-full text-xs bg-accent/20 text-accent border border-accent/30">${escapeHtml(t)}</span>`
  ).join(' ');
  
  document.getElementById('detail-content').innerHTML = `
    <div class="flex items-center gap-3 mb-4">
      <div class="w-12 h-12 rounded-full bg-dark-600 flex items-center justify-center text-xl">
        ${p.author ? p.author[0].toUpperCase() : '@'}
      </div>
      <div>
        <div class="font-medium text-white">${p.author ? '@' + escapeHtml(p.author) : '未知作者'}</div>
        <div class="text-xs text-gray-500">${p.date || ''} · Threads</div>
      </div>
    </div>
    
    <h2 class="text-xl font-bold text-white mb-3">${escapeHtml(p.title)}</h2>
    
    <div class="flex flex-wrap gap-2 mb-4">${tagsHtml}</div>
    
    <div class="flex flex-wrap gap-2 mb-5">
      ${p.url ? `
        <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener"
           class="inline-flex items-center gap-1.5 px-4 py-2.5 bg-accent text-dark-950 font-semibold rounded-xl text-sm hover:bg-accent-dim">
          開啟原文 ↗
        </a>
        <button onclick="copyText('${escapeHtml(p.url)}')" 
                class="px-4 py-2.5 bg-dark-700 text-gray-200 rounded-xl text-sm hover:bg-dark-600">
          複製連結
        </button>
      ` : ''}
      <a href="${escapeHtml(p.notionUrl)}" target="_blank" rel="noopener"
         class="px-4 py-2.5 bg-dark-700 text-gray-200 rounded-xl text-sm hover:bg-dark-600">
        喺 Notion 開啟
      </a>
    </div>
    
    <div class="flex gap-2 mb-5">
      <button onclick="toggleCheckbox('${p.id}', 'unread')" 
              class="flex-1 py-2.5 rounded-xl text-sm border ${p.unread ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-dark-800 border-dark-600 text-gray-400'}">
        ${p.unread ? '✓ 待讀' : '標記待讀'}
      </button>
      <button onclick="toggleCheckbox('${p.id}', 'featured')" 
              class="flex-1 py-2.5 rounded-xl text-sm border ${p.featured ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 'bg-dark-800 border-dark-600 text-gray-400'}">
        ${p.featured ? '★ 精華' : '標記精華'}
      </button>
    </div>
    
    ${p.content ? `
      <div class="border-t border-dark-700 pt-4">
        <div class="text-sm text-gray-400 mb-2">貼文內容</div>
        <div class="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">${escapeHtml(p.content)}</div>
      </div>
    ` : ''}
  `;
  
  const modal = document.getElementById('detail-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeDetail() {
  const modal = document.getElementById('detail-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function toggleCheckbox(pageId, field) {
  const p = allPages.find(x => x.id === pageId);
  if (!p) return;
  
  const propName = field === 'unread' ? PROP.unread : PROP.featured;
  const newValue = !p[field];
  
  p[field] = newValue;
  openDetail(pageId);
  applyFilters();
  renderDiary();
  renderSidebar();
  
  try {
    await notionFetch(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        properties: {
          [propName]: { checkbox: newValue }
        }
      })
    });
  } catch (e) {
    console.warn('Could not update Notion:', e.message);
    p[field] = !newValue;
    openDetail(pageId);
    applyFilters();
  }
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    const original = btn.textContent;
    btn.textContent = '已複製！';
    setTimeout(() => btn.textContent = original, 1500);
  });
}

// ===================== RENDER: DIARY =====================
function renderDiary() {
  document.getElementById('stat-total').textContent = allPages.length;
  
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthCount = allPages.filter(p => (p.date || p.created || '').startsWith(thisMonth)).length;
  document.getElementById('stat-month').textContent = monthCount;
  
  document.getElementById('stat-unread').textContent = allPages.filter(p => p.unread).length;
  document.getElementById('stat-featured').textContent = allPages.filter(p => p.featured).length;
  
  renderHeatmap();
  renderMonthlyChart();
  renderCategoryBars();
}

function renderHeatmap() {
  const container = document.getElementById('heatmap');
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const days = [];
  for (let i = 69; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  
  const countMap = {};
  allPages.forEach(p => {
    const ds = (p.date || p.created || '').slice(0, 10);
    if (ds) countMap[ds] = (countMap[ds] || 0) + 1;
  });
  
  let html = '';
  for (let w = 0; w < 10; w++) {
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      if (idx >= days.length) continue;
      const date = days[idx];
      const key = date.toISOString().slice(0, 10);
      const count = countMap[key] || 0;
      
      let color = 'bg-dark-600';
      if (count >= 4) color = 'bg-accent';
      else if (count >= 2) color = 'bg-accent-dim';
      else if (count >= 1) color = 'bg-accent-soft';
      
      html += `
        <div class="heatmap-cell aspect-square rounded-sm ${color} cursor-pointer" 
             title="${key}: ${count} 篇"
             onclick="filterByDate('${key}')"
             style="grid-column: ${w+1}; grid-row: ${d+1};">
        </div>
      `;
    }
  }
  
  container.innerHTML = html;
}

function filterByDate(dateStr) {
  currentFilter.month = null;
  currentFilter.search = '';
  document.getElementById('search-input').value = '';
  currentFilter.view = 'all';
  currentFilter.category = null;
  
  filteredPages = allPages.filter(p => (p.date || p.created || '').startsWith(dateStr));
  renderArticleList();
  updateFilterUI();
  switchTab('list');
}

function renderMonthlyChart() {
  const container = document.getElementById('monthly-chart');
  
  const months = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = i === 7 && d.getDate() ? `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(2)}` : `${d.getMonth()+1}月`;
    months.push({ key, label, count: 0 });
  }
  
  allPages.forEach(p => {
    const ds = (p.date || p.created || '').slice(0, 7);
    const m = months.find(x => x.key === ds);
    if (m) m.count++;
  });
  
  const max = Math.max(...months.map(m => m.count), 1);
  
  container.innerHTML = months.map(m => {
    const h = Math.max(4, (m.count / max) * 100);
    const active = currentFilter.month === m.key;
    return `
      <div class="flex-1 flex flex-col items-center gap-1 cursor-pointer group" onclick="filterByMonth('${m.key}')">
        <div class="text-xs text-gray-400 font-medium">${m.count || ''}</div>
        <div class="w-full rounded-t-lg transition-all ${active ? 'bg-accent' : 'bg-accent-dim group-hover:bg-accent'}" 
             style="height: ${h}%"></div>
        <div class="text-xs text-gray-500 mt-1">${m.label}</div>
      </div>
    `;
  }).join('');
}

function filterByMonth(monthKey) {
  if (currentFilter.month === monthKey) {
    currentFilter.month = null;
  } else {
    currentFilter.month = monthKey;
  }
  applyFilters();
  renderMonthlyChart();
  switchTab('list');
}

function renderCategoryBars() {
  const counts = getCategoryCounts();
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const max = sorted[0]?.[1] || 1;
  
  document.getElementById('category-bars').innerHTML = sorted.map(([name, count]) => {
    const pct = (count / max) * 100;
    return `
      <div class="flex items-center gap-3 cursor-pointer hover:opacity-80" onclick="setCategory('${name.replace(/'/g, "\\'")}')">
        <div class="w-20 text-sm text-gray-300 truncate">${escapeHtml(name)}</div>
        <div class="flex-1 h-2.5 bg-dark-600 rounded-full overflow-hidden">
          <div class="h-full bg-accent rounded-full" style="width: ${pct}%"></div>
        </div>
        <div class="w-8 text-right text-xs text-gray-500">${count}</div>
      </div>
    `;
  }).join('');
}

// ===================== TABS & UI HELPERS =====================
function switchTab(tab) {
  currentTab = tab;
  document.getElementById('view-list').classList.toggle('hidden', tab !== 'list');
  document.getElementById('view-diary').classList.toggle('hidden', tab !== 'diary');
  
  document.getElementById('tab-list').classList.toggle('tab-active', tab === 'list');
  document.getElementById('tab-diary').classList.toggle('tab-active', tab === 'diary');
  
  if (tab === 'diary') renderDiary();
}

function toggleMobileSidebar() {
  document.getElementById('mobile-sidebar').classList.toggle('hidden');
}

function toggleFilterPanel() {
  document.getElementById('search-input').focus();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDetail();
});