/**
 * 棉球小猫吉祥物 (static/cat.js)
 *
 * 以用户选定的爱心小猫为轮廓参考：短圆耳、宽扁脸、开口的耳间凹口、弯短眼和粉色腮红。
 * SVG 使用参考图坐标，呼吸和表情动画不改变基础比例。
 * 心情：idle / happy / love / sad / sleepy / angry / surprised / poke / wink / shy / confused。
 *
 * 用法：
 *   const cat = CottonCat.create(hostEl, { label: '戳一下小猫' });
 *   cat.setMood('sad');            // 持续心情
 *   cat.flash('happy', 1200);      // 临时心情，结束后回到持续心情
 *   cat.say('好耶！' | Node, ms);  // 头顶气泡
 *   cat.lookAt(clientX, clientY);  // 眼睛看向某点
 */
(function () {
  'use strict';

  const CAT_OUTLINE = 'M86 71 C79 64 71 59 63 59 C52 59 47 68 44 80 C43 83 41 84 39 87 C32 96 30 107 35 119 C41 134 61 141 90 141 C119 141 136 133 142 120 C149 107 147 97 140 87 C136 82 135 78 133 73 C131 64 126 59 119 59 C109 59 102 63 95 71';
  const HEART = 'M0 5 C-9 -1 -7 -10 0 -5 C7 -10 9 -1 0 5 Z';
  const STAR = 'M0 -10 Q2 -2 10 0 Q2 2 0 10 Q-2 2 -10 0 Q-2 -2 0 -10 Z';
  let uid = 0;

  // 关键词 → 心情。只看图中文字和标题，「可爱」这类每张都有的标签没有区分度
  const MOOD_WORDS = [
    ['sad', ['委屈', '大哭', '心碎', '救救我', '哭', '痛苦', '不想上班', '早八', '挣扎']],
    ['sleepy', ['晚安', '困', '躺平', '发呆', '摸鱼', '睡', '摆烂']],
    ['angry', ['生气', '无语', '哼']],
    ['love', ['贴贴', '比心', '喜欢', '撒娇', '摸摸头', '乖巧', '抱抱']],
    ['surprised', ['震惊', '暗中观察', '盯', '吃瓜', '偷看']],
    ['confused', ['疑惑', '懵', '什么', '问号', '不明白', '为什么']],
    ['wink', ['眨眼', 'wink', '抛媚眼', '调皮', '嘿嘿']],
    ['shy', ['害羞', '脸红', '不好意思', '捂脸', '娇羞', '羞']],
    ['happy', ['好耶', '点赞', '加油', '打卡', '收到', '干饭', '下班', '开心', '拜拜']]
  ];

  const PHRASES = {
    happy: ['好耶！', '嘿嘿嘿', '开心～', '냥냥!'],
    love: ['贴贴！', '最喜欢你了', '蹭蹭～'],
    sad: ['呜呜…', '要抱抱', '没有这种棉球…'],
    sleepy: ['Zzz…', '困困', '再睡五分钟'],
    angry: ['哼！不给了', '戳太多啦！', '生气气'],
    surprised: ['诶？', '盯——', '发现了！'],
    confused: ['嗯？', '不懂诶', '问号猫猫'],
    wink: ['眨给你看～', '嘿嘿', 'wink!'],
    shy: ['不要看啦', '有点不好意思', '脸红了…'],
    poke: ['喵？送你一张', '这张给你～', '냥! 拿去', '软乎乎的吧', '今天发这个！']
  };

  function moodOf(text) {
    if (!text) return '';
    for (const [mood, words] of MOOD_WORDS) {
      if (words.some(w => text.includes(w))) return mood;
    }
    return '';
  }

  function phrase(mood) {
    const list = PHRASES[mood] || PHRASES.poke;
    return list[Math.floor(Math.random() * list.length)];
  }

  function template(id) {
    return `
<button type="button" class="cat-hit">
  <svg class="cat" viewBox="24 50 132 100" data-mood="idle" aria-hidden="true">
    <defs>
      <radialGradient id="cat-cheek-${id}">
        <stop offset="0" stop-color="var(--cat-cheek)" stop-opacity=".95"/>
        <stop offset=".90" stop-color="var(--cat-cheek)" stop-opacity=".95"/>
        <stop offset="1" stop-color="var(--cat-cheek)" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <g class="cat-bob">
      <path class="cat-fill" d="${CAT_OUTLINE} Q90 75 86 71Z"/>
      <path class="cat-fur" d="${CAT_OUTLINE}"/>
      <g class="cat-cheeks">
        <ellipse class="cat-blush" cx="56.5" cy="112" rx="17" ry="17.5" fill="url(#cat-cheek-${id})"/>
        <ellipse class="cat-blush" cx="123" cy="112" rx="17" ry="17.5" fill="url(#cat-cheek-${id})"/>
        <g class="cat-blush-marks">
          <ellipse cx="51" cy="113" rx="1.5" ry="3.7" transform="rotate(12 51 113)"/>
          <ellipse cx="60" cy="114.5" rx="1.4" ry="3.3" transform="rotate(8 60 114.5)"/>
          <ellipse cx="119" cy="114.5" rx="1.4" ry="3.3" transform="rotate(-8 119 114.5)"/>
          <ellipse cx="128" cy="113" rx="1.5" ry="3.7" transform="rotate(-12 128 113)"/>
        </g>
      </g>
      <g class="eyes eyes-idle"><g class="cat-pupils">
        <path class="eye-stroke" d="M65.5 106 Q69 103.2 72.5 104.5"/>
        <path class="eye-stroke" d="M107 104.5 Q110.5 103.2 114 106"/>
      </g></g>
      <g class="eyes eyes-big"><g class="cat-pupils">
        <ellipse cx="69" cy="105" rx="4.8" ry="5.6"/>
        <ellipse cx="110.5" cy="105" rx="4.8" ry="5.6"/>
        <circle class="glint" cx="70.2" cy="103" r="1.6"/>
        <circle class="glint" cx="111.7" cy="103" r="1.6"/>
        <circle class="glint" cx="67.5" cy="107" r=".7"/>
        <circle class="glint" cx="109" cy="107" r=".7"/>
      </g></g>
      <g class="eyes eyes-line eyes-happy">
        <path d="M65 106 Q69 100.5 73 106"/><path d="M106.5 106 Q110.5 100.5 114.5 106"/>
      </g>
      <g class="eyes eyes-line eyes-closed">
        <path d="M65 104.5 Q69 109 73 104.5"/><path d="M106.5 104.5 Q110.5 109 114.5 104.5"/>
      </g>
      <g class="eyes eyes-line eyes-squint">
        <path d="M65 101.5 L72 105 L65 108"/><path d="M114.5 101.5 L107.5 105 L114.5 108"/>
      </g>
      <g class="eyes eyes-line eyes-wink">
        <path d="M65 104 Q69 109 73 104"/><path d="M107 104.5 Q110.5 103.2 114 106"/>
      </g>
      <g class="eyes eyes-line eyes-shy">
        <path d="M65.5 106 Q69 103 72.5 104.5"/><path d="M107 104.5 Q110.5 103 114 106"/>
      </g>
      <g class="eyes eyes-heart">
        <path transform="translate(69 106) scale(.55)" d="${HEART}"/>
        <path transform="translate(110.5 106) scale(.55)" d="${HEART}"/>
      </g>
      <g class="brows brows-angry"><path d="M64 98 L73 101"/><path d="M115.5 98 L106.5 101"/></g>
      <g class="brows brows-sad"><path d="M64 100 L73 97"/><path d="M115.5 100 L106.5 97"/></g>
      <path class="mouth mouth-open" d="M85.5 116 Q90 126 94.5 116Z"/>
      <ellipse class="mouth mouth-o" cx="90" cy="119" rx="2" ry="2.7"/>
      <path class="mouth mouth-wave" d="M84.5 119 q2.7 -2.5 5.5 0 q2.7 2.5 5.5 0"/>
      <path class="mouth mouth-shy" d="M87 118 Q90 121 93 118"/>
      <g class="cat-tears">
        <path d="M65.5 111 C62 118 61 124 64.5 126 C68 124 67 118 65.5 111Z"/>
        <path d="M114 111 C117.5 118 118.5 124 115 126 C111.5 124 112.5 118 114 111Z"/>
      </g>
    </g>
    <g class="fx fx-sparkle">
      <path transform="translate(32 72) scale(.38)" d="${STAR}"/>
      <path transform="translate(148 67) scale(.32)" d="${STAR}"/>
      <path transform="translate(153 116) scale(.24)" d="${STAR}"/>
    </g>
    <g class="fx fx-hearts">
      <path transform="translate(35 69) scale(.55)" d="${HEART}"/>
      <path transform="translate(146 63) scale(.65)" d="${HEART}"/>
      <path transform="translate(91 56) scale(.35)" d="${HEART}"/>
    </g>
    <g class="fx fx-zzz"><text x="137" y="74">z</text><text x="144" y="66">z</text><text x="151" y="58">Z</text></g>
    <g class="fx fx-bang"><path d="M149 63 L147 73"/><circle cx="146.5" cy="77" r="1.3"/></g>
    <g class="fx fx-anger" transform="translate(138 78) scale(.34)">
      <path d="M-13 -4 Q-4 -4 -4 -13 M4 -13 Q4 -4 13 -4 M13 4 Q4 4 4 13 M-4 13 Q-4 4 -13 4"/>
    </g>
    <g class="fx fx-question"><path d="M141 66 q0 -5 5 -5 q5 0 5 5 q0 3 -4 5 v2"/><circle cx="147" cy="77" r="1.1"/></g>
  </svg>
</button>
<div class="cat-bubble" aria-live="polite"></div>`;
  }

  function create(host, { label }) {
    const id = ++uid;
    host.innerHTML = template(id);
    const hit = host.querySelector('.cat-hit');
    const svg = host.querySelector('.cat');
    const bubble = host.querySelector('.cat-bubble');
    const pupils = host.querySelectorAll('.cat-pupils');
    hit.setAttribute('aria-label', label);

    let baseMood = 'idle';
    let flashTimer = null;
    let bubbleTimer = null;

    // 同一心情重复触发时先清空再设置，让 CSS 动画从头播放
    function apply(mood) {
      if (svg.dataset.mood === mood) {
        svg.dataset.mood = '';
        void svg.getBoundingClientRect();
      }
      svg.dataset.mood = mood;
    }

    return {
      hit,
      get mood() { return baseMood; },
      setMood(mood) {
        if (mood === baseMood) return;
        baseMood = mood;
        if (!flashTimer) apply(mood);
      },
      flash(mood, ms) {
        clearTimeout(flashTimer);
        apply(mood);
        flashTimer = setTimeout(() => {
          flashTimer = null;
          apply(baseMood);
        }, ms);
      },
      say(content, ms = 1800) {
        bubble.replaceChildren(content);
        bubble.classList.add('show');
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
      },
      lookAt(x, y) {
        const rect = svg.getBoundingClientRect();
        const dx = x - (rect.left + rect.width / 2);
        const dy = y - (rect.top + rect.height * 0.55);
        const dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(dist / 60, 1) * 1.5;
        const t = `translate(${(dx / dist) * reach}px, ${(dy / dist) * reach}px)`;
        pupils.forEach(p => { p.style.transform = t; });
      }
    };
  }

  // ---------- 浏览器标签栏图标：每次打开随机一只小猫 ----------
  const FAVICON_BG = ['#ff7ab8', '#ff9ccd', '#ffa9d6', '#f78fbe', '#ffb8dd'];
  const FAVICON_BLUSH = ['#ffc8bd', '#ffb6c8', '#ffd9e6', '#ffc2b0'];
  const FAVICON_KEY = 'mianqiu-favicon';

  function faviconSvg(mood, bg, blush) {
    const ink = '#424442';
    const line = `fill="none" stroke="${ink}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"`;
    const faces = {
      idle: `<path d="M65.5 106 Q69 103.2 72.5 104.5 M107 104.5 Q110.5 103.2 114 106" ${line}/>`,
      happy: `<path d="M65 106 Q69 100.5 73 106 M106.5 106 Q110.5 100.5 114.5 106" ${line}/>`,
      squint: `<path d="M65 101.5 L72 105 L65 108 M114.5 101.5 L107.5 105 L114.5 108" ${line}/>`,
      sleepy: `<path d="M65 104.5 Q69 109 73 104.5 M106.5 104.5 Q110.5 109 114.5 104.5" ${line}/>`,
      love: `<path transform="translate(69 106) scale(.55)" d="${HEART}" fill="${ink}"/><path transform="translate(110.5 106) scale(.55)" d="${HEART}" fill="${ink}"/>`,
      surprised: `<circle cx="69" cy="105" r="4.8" fill="${ink}"/><circle cx="110.5" cy="105" r="4.8" fill="${ink}"/>`,
      angry: `<path d="M64 98 L73 101 M115.5 98 L106.5 101" ${line}/><circle cx="69" cy="106" r="3.4" fill="${ink}"/><circle cx="110.5" cy="106" r="3.4" fill="${ink}"/>`
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
      `<rect width="64" height="64" rx="16" fill="${bg}"/>` +
      `<svg x="0" y="8" width="64" height="48.5" viewBox="24 50 132 100">` +
      `<path d="${CAT_OUTLINE} Q90 75 86 71Z" fill="#fff"/>` +
      `<path d="${CAT_OUTLINE}" fill="none" stroke="${ink}" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<ellipse cx="56.5" cy="112" rx="16" ry="16.5" fill="${blush}"/>` +
      `<ellipse cx="123" cy="112" rx="16" ry="16.5" fill="${blush}"/>` +
      `${faces[mood]}</svg></svg>`;
  }

  function randomFavicon() {
    const link = document.getElementById('favicon');
    if (!link) return;
    const moods = ['idle', 'happy', 'squint', 'sleepy', 'love', 'surprised', 'angry'];
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    let last = '';
    try { last = localStorage.getItem(FAVICON_KEY) || ''; } catch (e) { /* 隐私模式 */ }

    let mood = '';
    let bg = '';
    let blush = '';
    let sig = last;
    // 最多试 8 次，尽量不和上一次撞脸
    for (let i = 0; i < 8 && sig === last; i++) {
      mood = pick(moods);
      bg = pick(FAVICON_BG);
      blush = pick(FAVICON_BLUSH);
      sig = `${mood}|${bg}|${blush}`;
    }
    try { localStorage.setItem(FAVICON_KEY, sig); } catch (e) { /* 隐私模式 */ }

    link.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(mood, bg, blush))}`;
  }

  window.CottonCat = { create, moodOf, phrase, randomFavicon };
  randomFavicon();
})();
