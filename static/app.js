/**
 * 棉球小猫表情库前端核心交互 (static/app.js)
 *
 * 特性：
 * 1. 多源 CDN 自动降级回退 (Local -> jsDelivr -> GitHub Raw)
 * 2. 触底无限加载 (分批 36 张)，只加载 200px 静态首帧缩略图
 * 3. 拼音首字母/全拼/中文/韩文/标签/图中文字实时搜索
 * 4. 套系托盘、动静图与排序筛选
 * 5. 首屏小猫互动：看向指针、对悬停的表情做出同款心情、戳一下送一张表情、久不操作会睡着；
 *    首屏滚出视口后由右下角的小猫伙伴接替
 *
 * 站点只做预览：下载、复制图片/链接、批量打包和详情页入口都已移除，Bot 侧接口不受影响。
 */

(function () {
  'use strict';

  // 多源 CDN 回退列表
  const CDN_FALLBACK_BASES = [
    '', // 优先相对路径 (本地站点或相对路径)
    'https://cdn.jsdelivr.net/gh/dailiuyi/mianqiu-catHub@main/',
    'https://raw.githubusercontent.com/dailiuyi/mianqiu-catHub/main/'
  ];

  const BATCH_SIZE = 36;
  const QUICK_SEARCH_COUNT = 12;
  const SLEEP_AFTER_MS = 25000;
  const ANGRY_POKES = 6;
  const ANGRY_WINDOW_MS = 3000;
  const HOVER_MOODS = ['happy', 'love', 'surprised', 'wink', 'shy', 'laughing', 'smug'];

  let allMemes = [];
  let filteredMemes = [];
  let displayedCount = 0;

  let activeType = 'all';
  let activeSeries = 'all';
  let activeSort = 'default';
  let searchQuery = '';
  let activeTag = '';

  const cardMeme = new WeakMap();
  let hoveredCard = null;
  let pokeTimes = [];
  let resultsEmpty = false;
  let queryMood = '';
  let sleeping = false;
  let lastActive = Date.now();

  const $ = (id) => document.getElementById(id);

  const searchInput = $('search-input');
  const searchClear = $('search-clear');
  const tagCloud = $('tag-cloud');
  const seriesTabs = $('series-tabs');
  const memeGrid = $('meme-grid');
  const scrollSentinel = $('scroll-sentinel');
  const loadingText = $('loading-text');
  const heroTotalEl = $('hero-total');
  const totalCountEl = $('total-count');
  const displayedCountEl = $('displayed-count');
  const statsScopeEl = $('stats-scope');
  const typeFilterBtns = document.querySelectorAll('#type-filter .seg-btn');
  const sortFilterBtns = document.querySelectorAll('#sort-filter .seg-btn');
  const heroCatEl = $('hero-cat');
  const buddyEl = $('buddy');

  const lightbox = $('lightbox');
  const lightboxImg = $('lightbox-img');
  const lightboxTitle = $('lightbox-title');
  const lightboxTitleKo = $('lightbox-title-ko');
  const lightboxSeries = $('lightbox-series');
  const lightboxFormat = $('lightbox-format');
  const lightboxTags = $('lightbox-tags');

  const toast = $('toast');

  const heroCat = CottonCat.create(heroCatEl, { label: '戳一下小猫，送你一张表情' });
  const buddyCat = CottonCat.create(buddyEl, { label: '戳一下小猫，送你一张表情' });

  // 首屏小猫在视口内就由它互动，否则由右下角伙伴接替
  function activeCat() {
    return buddyEl.classList.contains('show') ? buddyCat : heroCat;
  }

  // 套系展示名：Kakao-Vol.3 → 第3弹，Kakao-Mini.2 → 迷你2弹
  const SERIES_LABELS = {
    community_caption: '二创梗图',
    community_clean: '高清无字',
    'Kakao-FollowCat': '跟踪猫',
    'Kakao-ShortCat.1': '短毛猫1',
    'Kakao-ShortCat.2': '短毛猫2'
  };

  function seriesLabel(series) {
    if (!series) return '未归类';
    if (SERIES_LABELS[series]) return SERIES_LABELS[series];
    const vol = series.match(/^Kakao-Vol\.(\d+)$/);
    if (vol) return `第${vol[1]}弹`;
    const mini = series.match(/^Kakao-Mini\.(\d+)$/);
    if (mini) return `迷你${mini[1]}弹`;
    return series;
  }

  // 套系排序：主线 → 迷你 → 社区 → 其他
  function seriesRank(series) {
    const vol = series.match(/^Kakao-Vol\.(\d+)$/);
    if (vol) return Number(vol[1]);
    const mini = series.match(/^Kakao-Mini\.(\d+)$/);
    if (mini) return 100 + Number(mini[1]);
    if (series.startsWith('community')) return 200;
    if (series === 'Kakao-FollowCat') return 301;
    if (series === 'Kakao-ShortCat.1') return 302;
    if (series === 'Kakao-ShortCat.2') return 303;
    return 400;
  }

  // 先按图中文字、标题及情绪标签判断；没有情绪信息的原版按 id 固定挑一种。
  function moodFor(meme) {
    const byText = CottonCat.moodOf(meme.ocr_text) || CottonCat.moodOf(meme.title);
    if (byText) return byText;
    const byTags = CottonCat.moodOf(meme.tags.join(' '));
    if (byTags) return byTags;
    let h = 0;
    for (const ch of meme.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return HOVER_MOODS[h % HOVER_MOODS.length];
  }

  async function init() {
    bindEvents();
    loadFooterStats();
    readUrlState();
    await loadData();
  }

  // 多源加载 memes.json
  async function loadData() {
    let data = null;

    for (const base of CDN_FALLBACK_BASES) {
      try {
        const url = base ? `${base.replace(/\/$/, '')}/data/memes.json` : 'data/memes.json';
        const res = await fetch(url);
        if (res.ok) {
          data = await res.json();
          break;
        }
      } catch (e) {
        console.warn('CDN 源加载失败，尝试下一源:', base, e);
      }
    }

    if (!data || !data.memes) {
      loadingText.textContent = '暂无表情数据，请先运行抓取或导入脚本。';
      return;
    }

    allMemes = data.memes;
    heroTotalEl.textContent = allMemes.length;
    totalCountEl.textContent = allMemes.length;

    buildSeriesTabs(allMemes);
    buildQuickSearches(allMemes);
    applyFilters();
    setupIntersectionObserver();
  }

  // 套系托盘：每个套系用它的第一张表情当封面
  function buildSeriesTabs(memes) {
    const covers = new Map();
    memes.forEach(m => {
      const s = m.series || '未归类';
      if (!covers.has(s)) covers.set(s, m);
    });

    seriesTabs.replaceChildren(createSeriesTab('all', '全部', null));
    Array.from(covers.keys())
      .sort((a, b) => seriesRank(a) - seriesRank(b) || a.localeCompare(b))
      .forEach(series => {
        seriesTabs.appendChild(createSeriesTab(series, seriesLabel(series), covers.get(series)));
      });
  }

  function createSeriesTab(series, label, cover) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'series-tab';
    btn.dataset.series = series;
    btn.setAttribute('aria-pressed', String(series === activeSeries));
    if (series === activeSeries) btn.classList.add('active');

    if (cover) {
      const img = document.createElement('img');
      const rel = cover.thumb_url || cover.url;
      img.src = resolveAssetUrl(rel);
      img.alt = '';
      img.loading = 'lazy';
      attachImageFallback(img, rel);
      btn.appendChild(img);
    } else {
      btn.insertAdjacentHTML('beforeend', '<svg aria-hidden="true"><use href="#cat-face"/></svg>');
    }

    const span = document.createElement('span');
    span.textContent = label;
    btn.appendChild(span);

    btn.addEventListener('click', () => {
      activeSeries = series;
      seriesTabs.querySelectorAll('.series-tab').forEach(t => {
        const on = t === btn;
        t.classList.toggle('active', on);
        t.setAttribute('aria-pressed', String(on));
      });
      applyFilters();
    });
    return btn;
  }

  // 首屏快捷词：取图中文字（二创梗图的字），点一下即搜索
  function buildQuickSearches(memes) {
    const words = [];
    for (const m of memes) {
      const w = (m.ocr_text || '').trim();
      if (w && !words.includes(w)) words.push(w);
      if (words.length >= QUICK_SEARCH_COUNT) break;
    }

    tagCloud.replaceChildren();
    words.forEach(word => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip';
      chip.textContent = word;
      chip.addEventListener('click', () => setSearch(searchQuery === word ? '' : word));
      tagCloud.appendChild(chip);
    });
  }

  function setSearch(value) {
    searchInput.value = value;
    searchQuery = value;
    activeTag = '';
    applyFilters();
  }

  function syncSearchUi() {
    searchClear.hidden = searchQuery === '' && !activeTag;
    tagCloud.querySelectorAll('.tag-chip').forEach(c => {
      c.classList.toggle('active', c.textContent === searchQuery.trim());
    });
  }

  // 持续心情：搜不到 > 睡着 > 搜索词的心情 > 平常
  function refreshMood() {
    const mood = resultsEmpty ? 'sad' : sleeping ? 'sleepy' : queryMood || 'idle';
    heroCat.setMood(mood);
    buddyCat.setMood(mood);
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  // 地址栏状态：q=搜索词，series=套系，tag=标签
  function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    searchQuery = (params.get('q') || '').trim();
    searchInput.value = searchQuery;
    activeSeries = params.get('series') || 'all';
    activeTag = (params.get('tag') || '').trim();
  }

  function syncUrlState() {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (activeSeries !== 'all') params.set('series', activeSeries);
    if (activeTag) params.set('tag', activeTag);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `/?${query}` : '/');
  }

  // 筛选与排序核心逻辑
  function applyFilters() {
    const q = searchQuery.trim().toLowerCase();

    filteredMemes = allMemes.filter(m => {
      if (activeType === 'animated' && !m.is_animated) return false;
      if (activeType === 'static' && m.is_animated) return false;
      if (activeSeries !== 'all' && m.series !== activeSeries) return false;
      if (activeTag && !(m.tags || []).includes(activeTag)) return false;

      if (q) {
        const fields = [m.title, m.title_ko, m.ocr_text, m.pinyin, m.pinyin_first, ...(m.tags || [])];
        if (!fields.some(f => (f || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });

    if (activeSort === 'random') {
      shuffle(filteredMemes);
    } else if (activeSort === 'title') {
      filteredMemes.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN'));
    }

    syncSearchUi();
    const scope = activeSeries === 'all' ? '全部套系' : seriesLabel(activeSeries);
    statsScopeEl.textContent = activeTag ? `${scope} · 标签：${activeTag}` : scope;
    resultsEmpty = filteredMemes.length === 0;
    queryMood = CottonCat.moodOf(searchQuery.trim());
    refreshMood();

    memeGrid.replaceChildren();
    hoveredCard = null;
    displayedCount = 0;
    displayedCountEl.textContent = '0';

    if (resultsEmpty) {
      memeGrid.appendChild(createEmptyState());
      loadingText.textContent = '';
    } else {
      renderNextBatch();
    }
    syncUrlState();
  }

  function createEmptyState() {
    const box = document.createElement('div');
    box.className = 'empty-state';
    box.innerHTML = '<svg aria-hidden="true"><use href="#cat-face"/></svg><span>这里没有棉球</span>';
    const tip = document.createElement('p');
    tip.textContent = searchQuery.trim()
      ? `没找到和「${searchQuery.trim()}」有关的表情。换个词，或者试试拼音首字母。`
      : '当前筛选下没有表情，换个套系或切回「全部」看看。';
    box.appendChild(tip);
    return box;
  }

  // 分批追加渲染
  function renderNextBatch() {
    if (displayedCount >= filteredMemes.length) return;

    const nextItems = filteredMemes.slice(displayedCount, displayedCount + BATCH_SIZE);
    const fragment = document.createDocumentFragment();
    nextItems.forEach(meme => fragment.appendChild(createMemeCard(meme)));
    memeGrid.appendChild(fragment);

    displayedCount += nextItems.length;
    displayedCountEl.textContent = displayedCount;
    loadingText.textContent = displayedCount >= filteredMemes.length
      ? `${filteredMemes.length} 张都在这里了`
      : '再往下翻还有...';
  }

  // 列表只显示静态首帧缩略图，网页不加载原图与动图
  // 构造单张贴纸
  function createMemeCard(meme) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'sticker';
    card.title = meme.title || '';
    cardMeme.set(card, meme);

    const thumbRel = meme.thumb_url || meme.url;
    const img = document.createElement('img');
    img.src = resolveAssetUrl(thumbRel);
    img.alt = meme.title || '棉球小猫表情';
    img.loading = 'lazy';
    img.decoding = 'async';
    attachImageFallback(img, thumbRel);
    card.appendChild(img);

    card.addEventListener('click', () => openLightbox(meme));
    return card;
  }

  // 图片加载失败时自动切换 CDN 源
  function attachImageFallback(imgEl, relPath) {
    let fallbackIdx = 0;
    imgEl.onerror = () => {
      fallbackIdx++;
      if (fallbackIdx < CDN_FALLBACK_BASES.length) {
        const base = CDN_FALLBACK_BASES[fallbackIdx];
        imgEl.src = base ? `${base.replace(/\/$/, '')}/${relPath.replace(/^\//, '')}` : relPath;
      }
    };
  }

  function resolveAssetUrl(relPath) {
    if (!relPath) return '';
    if (relPath.startsWith('http://') || relPath.startsWith('https://')) return relPath;
    const base = CDN_FALLBACK_BASES[0];
    return base ? `${base.replace(/\/$/, '')}/${relPath.replace(/^\//, '')}` : relPath;
  }

  // 无限滚动监听
  function setupIntersectionObserver() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) renderNextBatch();
      });
    }, { rootMargin: '400px' });
    observer.observe(scrollSentinel);
  }

  // ---------- 小猫互动 ----------

  // 鼠标停在（或键盘聚焦到）一张表情上：小猫看过去，做出同款心情
  function reactToCard(card) {
    if (!card || card === hoveredCard) return;
    hoveredCard = card;
    const meme = cardMeme.get(card);
    if (!meme) return;
    const cat = activeCat();
    const rect = card.getBoundingClientRect();
    cat.lookAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    cat.flash(moodFor(meme), 1500);
  }

  // 戳小猫：送一张当前筛选范围内的随机表情；戳太快会生气
  function pokeCat(cat) {
    const now = Date.now();
    pokeTimes = pokeTimes.filter(t => now - t < ANGRY_WINDOW_MS);
    pokeTimes.push(now);
    if (pokeTimes.length >= ANGRY_POKES) {
      pokeTimes = [];
      cat.flash('angry', 1800);
      cat.say(CottonCat.phrase('angry'));
      return;
    }

    const pool = filteredMemes.length ? filteredMemes : allMemes;
    if (pool.length === 0) {
      cat.flash('poke', 500);
      return;
    }
    const meme = pool[Math.floor(Math.random() * pool.length)];

    const gift = document.createElement('button');
    gift.type = 'button';
    gift.className = 'gift';
    gift.setAttribute('aria-label', `打开小猫送的表情：${meme.title || ''}`);
    const img = document.createElement('img');
    const thumbRel = meme.thumb_url || meme.url;
    img.src = resolveAssetUrl(thumbRel);
    img.alt = '';
    attachImageFallback(img, thumbRel);
    const words = document.createElement('span');
    words.textContent = CottonCat.phrase('poke');
    gift.append(img, words);
    gift.addEventListener('click', () => openLightbox(meme));

    cat.flash('poke', 1600);
    cat.say(gift, 4200);
  }

  // 一段时间没操作就睡着，动一下就醒
  function markActive() {
    lastActive = Date.now();
    if (!sleeping) return;
    sleeping = false;
    refreshMood();
    activeCat().flash('surprised', 900);
  }

  function checkSleep() {
    if (!sleeping && Date.now() - lastActive > SLEEP_AFTER_MS) {
      sleeping = true;
      refreshMood();
    }
  }

  function setupBuddy() {
    const observer = new IntersectionObserver(([entry]) => {
      buddyEl.classList.toggle('show', !entry.isIntersecting);
    });
    observer.observe(heroCatEl);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  // 打开大图弹窗（只做预览，不提供下载或复制）
  function openLightbox(meme) {
    const thumbRel = meme.thumb_url || meme.url;

    lightboxImg.src = resolveAssetUrl(thumbRel);
    lightboxImg.alt = meme.title || '棉球小猫表情';
    attachImageFallback(lightboxImg, thumbRel);

    lightboxTitle.textContent = meme.title || '棉球小猫';
    lightboxTitleKo.textContent = meme.title_ko || '';
    lightboxSeries.textContent = seriesLabel(meme.series);
    lightboxFormat.textContent = `${meme.width || '-'} × ${meme.height || '-'}，${(meme.format || 'unknown').toUpperCase()}${meme.is_animated ? ' 动图' : ''}`;

    lightboxTags.replaceChildren();
    (meme.tags || []).forEach(t => {
      const sp = document.createElement('span');
      sp.textContent = t;
      lightboxTags.appendChild(sp);
    });

    if (!lightbox.open) lightbox.showModal();
  }

  function onLightboxClosed() {
    lightboxImg.removeAttribute('src');
  }

  // 点击 dialog 自身（即遮罩区域）时关闭
  function closeOnBackdrop(dialog) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  function bindSegmented(buttons, onPick) {
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => {
          const on = b === btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        onPick(btn);
        applyFilters();
      });
    });
  }

  // ---------- 页脚真实统计：Bot 接口调用量与页面浏览量 ----------
  const VISITOR_KEY = 'mianqiu-visitor-id';

  function getVisitorId() {
    try {
      let id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch (e) {
      // 隐私模式下 localStorage 不可用，只记浏览量，不记访客
      return '';
    }
  }

  function formatCount(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  async function loadFooterStats() {
    const box = $('footer-stats');
    const lineEl = $('footer-stats-line');
    const sinceEl = $('footer-since');
    if (!box || !lineEl || !sinceEl) return;

    // 浏览量上报失败（如被拦截）不影响统计显示
    try {
      await fetch('/api/stats/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor: getVisitorId() }),
        keepalive: true
      });
    } catch (e) { /* 只影响本次计数 */ }

    let data;
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) return;
      data = (await res.json()).data;
    } catch (e) {
      return;
    }
    if (!data) return;

    const api = Number(data.api_calls) || 0;
    const views = Number(data.page_views) || 0;
    const visitors = Number(data.visitors) || 0;

    if (api === 0 && visitors <= 1) {
      lineEl.textContent = '页面刚开张，接口还没被调用过。';
    } else if (api === 0) {
      lineEl.innerHTML = `已经有 <b>${formatCount(visitors)}</b> 位朋友来过，接口还没被调用。`;
    } else {
      lineEl.innerHTML = `接口被调用 <b>${formatCount(api)}</b> 次，` +
        `页面被翻了 <b>${formatCount(views)}</b> 次，` +
        `<b>${formatCount(visitors)}</b> 位朋友来过。`;
    }
    sinceEl.textContent = data.since ? `自 ${data.since} 起统计` : '';
    box.hidden = false;
  }

  function bindEvents() {
    // 搜索输入防抖
    let searchTimer = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchQuery = e.target.value;
        applyFilters();
      }, 150);
    });

    searchClear.addEventListener('click', () => {
      setSearch('');
      searchInput.focus();
    });

    bindSegmented(typeFilterBtns, btn => { activeType = btn.dataset.type; });
    bindSegmented(sortFilterBtns, btn => { activeSort = btn.dataset.sort; });

    $('lightbox-close').addEventListener('click', () => lightbox.close());
    lightbox.addEventListener('close', onLightboxClosed);
    closeOnBackdrop(lightbox);

    // 小猫互动
    heroCat.hit.addEventListener('click', () => pokeCat(heroCat));
    buddyCat.hit.addEventListener('click', () => pokeCat(buddyCat));
    memeGrid.addEventListener('pointerover', (e) => reactToCard(e.target.closest('.sticker')));
    memeGrid.addEventListener('focusin', (e) => reactToCard(e.target.closest('.sticker')));
    memeGrid.addEventListener('pointerleave', () => { hoveredCard = null; });
    window.addEventListener('pointermove', (e) => {
      activeCat().lookAt(e.clientX, e.clientY);
      markActive();
    }, { passive: true });
    ['keydown', 'scroll', 'touchstart'].forEach(type => {
      window.addEventListener(type, markActive, { passive: true });
    });
    setInterval(checkSleep, 5000);
    setupBuddy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
