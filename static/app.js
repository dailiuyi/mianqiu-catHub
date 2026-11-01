/**
 * 棉球小猫表情库前端核心交互 (static/app.js)
 * 
 * 特性：
 * 1. 多源 CDN 自动降级回退 (Local -> jsDelivr -> GitHub Raw)
 * 2. 触底无限加载 (分批 24 张，避免 Phoebe-Hub 的全量 DOM 卡顿)
 * 3. 拼音首字母/全拼/中文/韩文/标签多维秒级实时搜索
 * 4. 客户端 JSZip 6 并发限流打包下载
 * 5. 原图灯箱展示与一键剪贴板复制
 */

(function () {
  'use strict';

  // 多源 CDN 回退列表
  const CDN_FALLBACK_BASES = [
    '', // 优先相对路径 (本地站点或相对路径)
    'https://cdn.jsdelivr.net/gh/dailiuyi/mianqiu-catHub@main/',
    'https://raw.githubusercontent.com/dailiuyi/mianqiu-catHub/main/'
  ];

  let allMemes = [];
  let filteredMemes = [];
  let displayedCount = 0;
  const BATCH_SIZE = 24;

  let activeType = 'all';
  let activeSeries = 'all';
  let activeTag = '';
  let activeSort = 'default';
  let searchQuery = '';

  let isBatchMode = false;
  const selectedSet = new Set();

  // DOM 元素
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const memeGrid = document.getElementById('meme-grid');
  const scrollSentinel = document.getElementById('scroll-sentinel');
  const loadingText = document.getElementById('loading-text');
  const totalCountEl = document.getElementById('total-count');
  const displayedCountEl = document.getElementById('displayed-count');
  const seriesSelect = document.getElementById('series-select');
  const sortSelect = document.getElementById('sort-select');
  const tagCloud = document.getElementById('tag-cloud');
  const typeFilterBtns = document.querySelectorAll('#type-filter .filter-btn');

  const batchModeBtn = document.getElementById('batch-mode-btn');
  const batchDownloadBtn = document.getElementById('batch-download-btn');
  const selectedCountEl = document.getElementById('selected-count');

  // 灯箱 DOM
  const lightbox = document.getElementById('lightbox');
  const lightboxBackdrop = document.getElementById('lightbox-backdrop');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxTitle = document.getElementById('lightbox-title');
  const lightboxTitleKo = document.getElementById('lightbox-title-ko');
  const lightboxSeries = document.getElementById('lightbox-series');
  const lightboxFormat = document.getElementById('lightbox-format');
  const lightboxTags = document.getElementById('lightbox-tags');
  const copyLinkBtn = document.getElementById('copy-link-btn');
  const copyImgBtn = document.getElementById('copy-img-btn');
  const downloadBtn = document.getElementById('download-btn');

  // API 弹窗 DOM
  const apiModal = document.getElementById('api-modal');
  const openApiBtn = document.getElementById('open-api-btn');
  const apiModalBackdrop = document.getElementById('api-modal-backdrop');
  const apiModalClose = document.getElementById('api-modal-close');

  let currentLightboxMeme = null;

  // 初始化加载
  async function init() {
    bindEvents();
    await loadData();
  }

  // 多源加载 memes.json
  async function loadData() {
    loadingText.textContent = '正在获取表情库索引...';
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
    totalCountEl.textContent = allMemes.length;

    initFilters(allMemes);
    applyFilters();
    setupIntersectionObserver();
  }

  // 初始化系列与标签下拉/列表
  function initFilters(memes) {
    const seriesMap = new Map();
    const tagMap = new Map();

    memes.forEach(m => {
      const s = m.series || '未归类';
      seriesMap.set(s, (seriesMap.get(s) || 0) + 1);

      (m.tags || []).forEach(t => {
        tagMap.set(t, (tagMap.get(t) || 0) + 1);
      });
    });

    // 系列下拉框
    seriesSelect.innerHTML = '<option value="all">所有系列 (全部)</option>';
    Array.from(seriesMap.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([series, count]) => {
        const opt = document.createElement('option');
        opt.value = series;
        opt.textContent = `${series} (${count})`;
        seriesSelect.appendChild(opt);
      });

    // 热门标签云 (取前 15 个)
    tagCloud.innerHTML = '';
    Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([tag, count]) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = `${tag} (${count})`;
        chip.onclick = () => {
          if (activeTag === tag) {
            activeTag = '';
            chip.classList.remove('active');
          } else {
            document.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
            activeTag = tag;
            chip.classList.add('active');
          }
          applyFilters();
        };
        tagCloud.appendChild(chip);
      });
  }

  // 筛选与排序核心逻辑
  function applyFilters() {
    const q = searchQuery.trim().toLowerCase();

    filteredMemes = allMemes.filter(m => {
      // 动静图过滤
      if (activeType === 'animated' && !m.is_animated) return false;
      if (activeType === 'static' && m.is_animated) return false;

      // 系列过滤
      if (activeSeries !== 'all' && m.series !== activeSeries) return false;

      // 标签过滤
      if (activeTag && !(m.tags || []).includes(activeTag)) return false;

      // 关键词/拼音检索
      if (q) {
        const title = (m.title || '').toLowerCase();
        const titleKo = (m.title_ko || '').toLowerCase();
        const ocr = (m.ocr_text || '').toLowerCase();
        const pinyin = (m.pinyin || '').toLowerCase();
        const pinyinFirst = (m.pinyin_first || '').toLowerCase();
        const tags = (m.tags || []).map(t => t.toLowerCase());

        const match =
          title.includes(q) ||
          titleKo.includes(q) ||
          ocr.includes(q) ||
          pinyin.includes(q) ||
          pinyinFirst.includes(q) ||
          tags.some(t => t.includes(q));

        if (!match) return false;
      }

      return true;
    });

    // 排序
    if (activeSort === 'random') {
      filteredMemes.sort(() => Math.random() - 0.5);
    } else if (activeSort === 'title') {
      filteredMemes.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    // 重置渲染计数
    memeGrid.innerHTML = '';
    displayedCount = 0;
    renderNextBatch();
  }

  // 分批追加渲染
  function renderNextBatch() {
    if (displayedCount >= filteredMemes.length) {
      loadingText.textContent = filteredMemes.length > 0 ? '🎉 已展示全部表情' : '未找到匹配的表情';
      return;
    }

    loadingText.textContent = '正在加载更多可爱小猫...';
    const nextItems = filteredMemes.slice(displayedCount, displayedCount + BATCH_SIZE);

    const fragment = document.createDocumentFragment();
    nextItems.forEach(meme => {
      fragment.appendChild(createMemeCard(meme));
    });

    memeGrid.appendChild(fragment);
    displayedCount += nextItems.length;
    displayedCountEl.textContent = displayedCount;
  }

  // 构造单张卡片 DOM
  function createMemeCard(meme) {
    const card = document.createElement('div');
    card.className = 'meme-card';
    if (selectedSet.has(meme.id)) {
      card.classList.add('selected');
    }

    // 缩略图 URL 处理
    const thumbRel = meme.thumb_url || meme.url;
    const thumbUrl = resolveAssetUrl(thumbRel);
    const rawUrl = resolveAssetUrl(meme.url);

    card.innerHTML = `
      <div class="meme-img-container">
        ${isBatchMode ? `<input type="checkbox" class="select-checkbox" ${selectedSet.has(meme.id) ? 'checked' : ''}>` : ''}
        ${meme.is_animated ? '<span class="meme-badge-animated">GIF</span>' : ''}
        <img class="meme-img" src="${thumbUrl}" alt="${meme.title}" loading="lazy" data-raw="${rawUrl}">
      </div>
      <div class="meme-meta">
        <div class="meme-title" title="${meme.title}">${meme.title}</div>
        <div class="meme-series">${meme.series || ''}</div>
      </div>
    `;

    // 容灾 fallback
    const imgEl = card.querySelector('.meme-img');
    attachImageFallback(imgEl, thumbRel);

    // 点击卡片事件
    card.addEventListener('click', (e) => {
      if (isBatchMode || e.target.classList.contains('select-checkbox')) {
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
        if (entry.isIntersecting) {
          renderNextBatch();
        }
      });
    }, { rootMargin: '200px' });

    observer.observe(scrollSentinel);
  }

  // 打开大图灯箱
  function openLightbox(meme) {
    currentLightboxMeme = meme;
    const rawUrl = resolveAssetUrl(meme.url);

    lightboxImg.src = rawUrl;
    attachImageFallback(lightboxImg, meme.url);

    lightboxTitle.textContent = meme.title || '棉球小猫';
    lightboxTitleKo.textContent = meme.title_ko || '';
    lightboxSeries.textContent = meme.series || '未归类';
    lightboxFormat.textContent = `${meme.width || '-'} × ${meme.height || '-'} (${(meme.format || 'unknown').toUpperCase()})`;

    lightboxTags.innerHTML = '';
    (meme.tags || []).forEach(t => {
      const sp = document.createElement('span');
      sp.className = 'tag-chip';
      sp.textContent = t;
      lightboxTags.appendChild(sp);
    });

    downloadBtn.href = rawUrl;
    downloadBtn.setAttribute('download', `${meme.title || meme.id}.${meme.format || 'gif'}`);

    lightbox.style.display = 'flex';
  }

  function closeLightbox() {
    lightbox.style.display = 'none';
    currentLightboxMeme = null;
    lightboxImg.src = '';
  }

  // 批量选择切换
  function toggleSelectMeme(id, cardEl) {
    if (selectedSet.has(id)) {
      selectedSet.delete(id);
      cardEl.classList.remove('selected');
      const cb = cardEl.querySelector('.select-checkbox');
      if (cb) cb.checked = false;
    } else {
      selectedSet.add(id);
      cardEl.classList.add('selected');
      const cb = cardEl.querySelector('.select-checkbox');
      if (cb) cb.checked = true;
    }
    selectedCountEl.textContent = selectedSet.size;
  }

  // JSZip 客户端并发限流下载
  async function downloadSelectedZip() {
    if (selectedSet.size === 0) return;
    if (typeof JSZip === 'undefined') {
      alert('JSZip 库未加载完成，请稍候重试');
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder('mianqiu-cat-emotes');
    const selectedMemes = allMemes.filter(m => selectedSet.has(m.id));

    batchDownloadBtn.disabled = true;
    batchDownloadBtn.textContent = '正在打包中...';

    // 限制最大 6 并发
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
            const fileName = `${item.title || item.id}.${item.format || 'gif'}`;
            folder.file(fileName, blob);
          }
        } catch (e) {
          console.warn('下载单张表情包失败:', item.id, e);
        }
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);

    batchDownloadBtn.textContent = '正在压缩导出...';
    const content = await zip.generateAsync({ type: 'blob' });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `棉球小猫表情包_${selectedMemes.length}张.zip`;
    a.click();
    URL.revokeObjectURL(a.href);

    batchDownloadBtn.disabled = false;
    batchDownloadBtn.textContent = `打包下载 (${selectedSet.size})`;
  }

  // 剪贴板复制图片链接
  async function copyImageLink() {
    if (!currentLightboxMeme) return;
    const url = resolveAssetUrl(currentLightboxMeme.url);
    const absUrl = new URL(url, window.location.href).href;
    try {
      await navigator.clipboard.writeText(absUrl);
      copyLinkBtn.textContent = '已复制链接！';
      setTimeout(() => { copyLinkBtn.textContent = '复制图片链接'; }, 1800);
    } catch (e) {
      alert('复制失败，请手动复制: ' + absUrl);
    }
  }

  // 剪贴板复制图片（转为 PNG Blob 写入 ClipboardItem）
  async function copyImageBlob() {
    if (!currentLightboxMeme) return;
    try {
      copyImgBtn.textContent = '正在复制...';
      const url = resolveAssetUrl(currentLightboxMeme.url);
      const resp = await fetch(url);
      const blob = await resp.blob();

      // 如果浏览器支持 ClipboardItem
      if (navigator.clipboard && window.ClipboardItem) {
        // 大多数系统剪贴板要求 image/png
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = URL.createObjectURL(blob);
        await img.decode();

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(async (pngBlob) => {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': pngBlob })
          ]);
          copyImgBtn.textContent = '已复制到剪贴板！';
          setTimeout(() => { copyImgBtn.textContent = '复制图片'; }, 1800);
        }, 'image/png');
      } else {
        alert('当前浏览器不支持直接复制图片');
        copyImgBtn.textContent = '复制图片';
      }
    } catch (e) {
      console.error(e);
      alert('复制图片失败，建议右键另存或直接下载');
      copyImgBtn.textContent = '复制图片';
    }
  }

  // 绑定事件
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
      searchInput.value = '';
      searchQuery = '';
      applyFilters();
    });

    // 动静图筛选
    typeFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        typeFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeType = btn.dataset.type;
        applyFilters();
      });
    });

    // 系列与排序下拉
    seriesSelect.addEventListener('change', (e) => {
      activeSeries = e.target.value;
      applyFilters();
    });

    sortSelect.addEventListener('change', (e) => {
      activeSort = e.target.value;
      applyFilters();
    });

    // 批量模式切换
    batchModeBtn.addEventListener('click', () => {
      isBatchMode = !isBatchMode;
      batchModeBtn.textContent = isBatchMode ? '退出批量' : '批量选择';
      batchDownloadBtn.style.display = isBatchMode ? 'inline-block' : 'none';
      if (!isBatchMode) {
        selectedSet.clear();
        selectedCountEl.textContent = '0';
      }
      applyFilters();
    });

    batchDownloadBtn.addEventListener('click', downloadSelectedZip);

    // 灯箱事件
    lightboxBackdrop.addEventListener('click', closeLightbox);
    lightboxClose.addEventListener('click', closeLightbox);
    copyLinkBtn.addEventListener('click', copyImageLink);
    copyImgBtn.addEventListener('click', copyImageBlob);

    // API 弹窗
    openApiBtn.addEventListener('click', (e) => {
      e.preventDefault();
      apiModal.style.display = 'flex';
    });
    apiModalBackdrop.addEventListener('click', () => { apiModal.style.display = 'none'; });
    apiModalClose.addEventListener('click', () => { apiModal.style.display = 'none'; });

    // ESC 关闭弹窗
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
        apiModal.style.display = 'none';
      }
    });
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
