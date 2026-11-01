/**
 * 棉球小猫表情库前端核心交互 (static/app.js)
 *
 * 特性：
 * 1. 多源 CDN 自动降级回退 (Local -> jsDelivr -> GitHub Raw)
 * 2. 触底无限加载 (分批 36 张)；贴纸进入视口后换成原图动图播放
 * 3. 拼音首字母/全拼/中文/韩文/标签/图中文字实时搜索
 * 4. 套系托盘、动静图与排序筛选
 * 5. 首屏小猫互动：看向指针、对悬停的表情做出同款心情、戳一下送一张表情、久不操作会睡着；
 *    首屏滚出视口后由右下角的小猫伙伴接替
 * 6. 客户端 JSZip 6 并发限流打包下载；原图弹窗与一键剪贴板复制
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
  const HOVER_MOODS = ['happy', 'love', 'surprised'];

  let allMemes = [];
  let filteredMemes = [];
  let displayedCount = 0;

  let activeType = 'all';
  let activeSeries = 'all';
  let activeSort = 'default';
  let searchQuery = '';

  let isBatchMode = false;
  const selectedSet = new Set();
  let currentLightboxMeme = null;

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

  const batchModeBtn = $('batch-mode-btn');
  const batchTray = $('batch-tray');
  const batchDownloadBtn = $('batch-download-btn');
  const selectedCountEl = $('selected-count');

  const lightbox = $('lightbox');
  const lightboxImg = $('lightbox-img');
  const lightboxTitle = $('lightbox-title');
  const lightboxTitleKo = $('lightbox-title-ko');
  const lightboxSeries = $('lightbox-series');
  const lightboxFormat = $('lightbox-format');
  const lightboxTags = $('lightbox-tags');
  const copyLinkBtn = $('copy-link-btn');
  const copyImgBtn = $('copy-img-btn');
  const downloadBtn = $('download-btn');

  const apiModal = $('api-modal');
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
    community_clean: '高清无字'
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
    return 300;
  }

  // 表情对应的小猫心情：先看图中文字和标题；官方原版多数没有文字，按 id 固定挑一种
  function moodFor(meme) {
    const byText = CottonCat.moodOf(meme.ocr_text) || CottonCat.moodOf(meme.title);
    if (byText) return byText;
    let h = 0;
    for (const ch of meme.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return HOVER_MOODS[h % HOVER_MOODS.length];
  }

  async function init() {
    bindEvents();
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
    applyFilters();
  }

  function syncSearchUi() {
    searchClear.hidden = searchQuery === '';
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

  // 筛选与排序核心逻辑
  function applyFilters() {
    const q = searchQuery.trim().toLowerCase();

    filteredMemes = allMemes.filter(m => {
      if (activeType === 'animated' && !m.is_animated) return false;
      if (activeType === 'static' && m.is_animated) return false;
      if (activeSeries !== 'all' && m.series !== activeSeries) return false;

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
    statsScopeEl.textContent = activeSeries === 'all' ? '全部套系' : seriesLabel(activeSeries);
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
      return;
    }
    renderNextBatch();
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

  // 贴纸先显示静态缩略图（首帧），进入视口后预载原图动图，加载完再替换，避免闪白
  const animateObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      animateObserver.unobserve(entry.target);
      const img = entry.target;
      const preload = new Image();
      preload.onload = () => { img.src = preload.src; };
      preload.src = img.dataset.animated;
    });
  }, { rootMargin: '200px' });

  // 构造单张贴纸
  function createMemeCard(meme) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'sticker';
    card.title = meme.title || '';
    if (selectedSet.has(meme.id)) card.classList.add('selected');
    if (isBatchMode) card.setAttribute('aria-pressed', String(selectedSet.has(meme.id)));
    cardMeme.set(card, meme);

    const thumbRel = meme.thumb_url || meme.url;
    const img = document.createElement('img');
    img.src = resolveAssetUrl(thumbRel);
    img.alt = meme.title || '棉球小猫表情';
    img.loading = 'lazy';
    img.decoding = 'async';
    attachImageFallback(img, thumbRel);
    if (meme.is_animated && meme.thumb_url) {
      img.dataset.animated = resolveAssetUrl(meme.url);
      animateObserver.observe(img);
    }
    card.appendChild(img);

    card.addEventListener('click', () => {
      if (isBatchMode) {
        toggleSelectMeme(meme.id, card);
      } else {
        openLightbox(meme);
      }
    });
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
    img.src = resolveAssetUrl(meme.url);
    img.alt = '';
    attachImageFallback(img, meme.url);
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

  // 打开大图弹窗
  function openLightbox(meme) {
    currentLightboxMeme = meme;
    const rawUrl = resolveAssetUrl(meme.url);

    lightboxImg.src = rawUrl;
    lightboxImg.alt = meme.title || '棉球小猫表情';
    attachImageFallback(lightboxImg, meme.url);

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

    downloadBtn.href = rawUrl;
    downloadBtn.setAttribute('download', `${meme.title || meme.id}.${meme.format || 'gif'}`);

    if (!lightbox.open) lightbox.showModal();
  }

  function onLightboxClosed() {
    currentLightboxMeme = null;
    lightboxImg.removeAttribute('src');
  }

  // 点击 dialog 自身（即遮罩区域）时关闭
  function closeOnBackdrop(dialog) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  // 批量选择切换
  function toggleSelectMeme(id, cardEl) {
    const on = !selectedSet.has(id);
    if (on) selectedSet.add(id);
    else selectedSet.delete(id);
    cardEl.classList.toggle('selected', on);
    cardEl.setAttribute('aria-pressed', String(on));
    selectedCountEl.textContent = selectedSet.size;
    batchDownloadBtn.disabled = selectedSet.size === 0;
    if (on) activeCat().flash('happy', 700);
  }

  function setBatchMode(on) {
    isBatchMode = on;
    batchModeBtn.textContent = on ? '退出批量' : '批量选择';
    batchModeBtn.setAttribute('aria-pressed', String(on));
    batchTray.hidden = !on;
    memeGrid.classList.toggle('is-batch', on);
    if (!on) {
      selectedSet.clear();
      selectedCountEl.textContent = '0';
      batchDownloadBtn.disabled = true;
    }
    applyFilters();
  }

  // JSZip 客户端并发限流下载
  async function downloadSelectedZip() {
    if (selectedSet.size === 0) return;
    if (typeof JSZip === 'undefined') {
      showToast('打包组件还没加载好，请稍后再试');
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder('mianqiu-cat-emotes');
    const selectedMemes = allMemes.filter(m => selectedSet.has(m.id));

    batchDownloadBtn.disabled = true;
    batchDownloadBtn.textContent = '正在打包...';

    const CONCURRENCY = 6;
    let index = 0;

    async function worker() {
      while (index < selectedMemes.length) {
        const item = selectedMemes[index++];
        const url = resolveAssetUrl(item.url);
        try {
          const resp = await fetch(url);
          if (resp.ok) {
            const blob = await resp.blob();
            folder.file(`${item.title || item.id}.${item.format || 'gif'}`, blob);
          }
        } catch (e) {
          console.warn('下载单张表情包失败:', item.id, e);
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    batchDownloadBtn.textContent = '正在压缩...';
    const content = await zip.generateAsync({ type: 'blob' });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `棉球小猫表情包_${selectedMemes.length}张.zip`;
    a.click();
    URL.revokeObjectURL(a.href);

    batchDownloadBtn.disabled = false;
    batchDownloadBtn.textContent = '打包下载';
    showToast(`已打包 ${selectedMemes.length} 张`);
    activeCat().flash('love', 1600);
  }

  // 剪贴板复制图片链接
  async function copyImageLink() {
    if (!currentLightboxMeme) return;
    const absUrl = new URL(resolveAssetUrl(currentLightboxMeme.url), window.location.href).href;
    try {
      await navigator.clipboard.writeText(absUrl);
      showToast('已复制链接');
    } catch (e) {
      window.prompt('浏览器不允许自动复制，请手动复制链接：', absUrl);
    }
  }

  // 剪贴板复制图片（转为 PNG Blob 写入 ClipboardItem）
  async function copyImageBlob() {
    if (!currentLightboxMeme) return;
    if (!navigator.clipboard || !window.ClipboardItem) {
      showToast('当前浏览器不支持复制图片，请用下载原图');
      return;
    }
    try {
      const resp = await fetch(resolveAssetUrl(currentLightboxMeme.url));
      const blob = await resp.blob();

      // 大多数系统剪贴板只接受 image/png
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);

      const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      showToast('已复制图片（动图会变成静止的第一帧）');
    } catch (e) {
      console.error(e);
      showToast('复制图片失败，请用下载原图');
    }
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

    batchModeBtn.addEventListener('click', () => setBatchMode(!isBatchMode));
    batchDownloadBtn.addEventListener('click', downloadSelectedZip);

    $('lightbox-close').addEventListener('click', () => lightbox.close());
    lightbox.addEventListener('close', onLightboxClosed);
    closeOnBackdrop(lightbox);
    copyLinkBtn.addEventListener('click', copyImageLink);
    copyImgBtn.addEventListener('click', copyImageBlob);

    $('open-api-btn').addEventListener('click', () => apiModal.showModal());
    $('api-modal-close').addEventListener('click', () => apiModal.close());
    closeOnBackdrop(apiModal);

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
