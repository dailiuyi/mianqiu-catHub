/**
 * 棉球小猫吉祥物 (static/cat.js)
 *
 * 按原作比例画的 SVG 小猫：宽扁的圆脑袋、两只小圆耳朵、靠下且分得很开的豆豆眼、大片桃色腮红。
 * 线条用 feTurbulence 逐帧抖动，模仿原作动图那种手绘线条「呼吸」的感觉。
 * 心情：idle / happy / love / sad / sleepy / angry / surprised / poke（被戳的一下）。
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

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HEART = 'M0 5 C-9 -1 -7 -10 0 -5 C7 -10 9 -1 0 5 Z';
  const STAR = 'M0 -10 Q2 -2 10 0 Q2 2 0 10 Q-2 2 -10 0 Q-2 -2 0 -10 Z';
  let uid = 0;

  // 关键词 → 心情。只看图中文字和标题，「可爱」这类每张都有的标签没有区分度
  const MOOD_WORDS = [
    ['sad', ['委屈', '大哭', '心碎', '救救我', '哭', '痛苦', '不想上班', '早八', '挣扎']],
    ['sleepy', ['晚安', '困', '躺平', '发呆', '摸鱼', '睡', '摆烂']],
    ['angry', ['生气', '无语', '哼']],
    ['love', ['贴贴', '比心', '喜欢', '撒娇', '摸摸头', '乖巧', '抱抱']],
    ['surprised', ['震惊', '疑惑', '暗中观察', '盯', '吃瓜', '偷看']],
    ['happy', ['好耶', '点赞', '加油', '打卡', '收到', '干饭', '下班', '开心', '拜拜']]
  ];

  const PHRASES = {
    happy: ['好耶！', '嘿嘿嘿', '开心～', '냥냥!'],
    love: ['贴贴！', '最喜欢你了', '蹭蹭～'],
    sad: ['呜呜…', '要抱抱', '没有这种棉球…'],
    sleepy: ['Zzz…', '困困', '再睡五分钟'],
    angry: ['哼！不给了', '戳太多啦！', '生气气'],
    surprised: ['诶？', '盯——', '发现了！'],
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
    const boil = reduceMotion
      ? ''
      : '<animate attributeName="seed" values="1;4;7" dur="0.45s" calcMode="discrete" repeatCount="indefinite"/>';
    return `
<button type="button" class="cat-hit">
  <svg class="cat" viewBox="0 0 240 230" data-mood="idle" aria-hidden="true">
    <defs>
      <filter id="cat-boil-${id}" x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="1">${boil}</feTurbulence>
        <feDisplacementMap in="SourceGraphic" scale="2.4" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </defs>
    <g filter="url(#cat-boil-${id})">
      <g class="cat-bob">
        <path class="cat-fur" d="M44 240 C40 214 30 196 26 172 C20 140 30 108 56 90 C76 74 100 68 120 68 C140 68 164 74 184 90 C210 108 220 140 214 172 C210 196 200 214 196 240"/>
        <g class="cat-ear cat-ear-l">
          <path class="ear-fill" d="M50 98 C46 74 54 46 70 44 C84 42 94 58 100 72 L104 86 L56 106 Z"/>
          <path class="ear-line" d="M50 98 C46 74 54 46 70 44 C84 42 94 58 100 72"/>
        </g>
        <g class="cat-ear cat-ear-r">
          <path class="ear-fill" d="M190 98 C194 74 186 46 170 44 C156 42 146 58 140 72 L136 86 L184 106 Z"/>
          <path class="ear-line" d="M190 98 C194 74 186 46 170 44 C156 42 146 58 140 72"/>
        </g>
        <ellipse class="cat-blush" cx="62" cy="146" rx="23" ry="15"/>
        <ellipse class="cat-blush" cx="178" cy="146" rx="23" ry="15"/>
        <g class="eyes eyes-idle"><g class="cat-pupils">
          <ellipse cx="94" cy="132" rx="5.2" ry="6"/><ellipse cx="146" cy="132" rx="5.2" ry="6"/>
        </g></g>
        <g class="eyes eyes-big"><g class="cat-pupils">
          <circle cx="94" cy="130" r="9.5"/><circle cx="146" cy="130" r="9.5"/>
          <circle class="glint" cx="97.5" cy="126" r="3.4"/><circle class="glint" cx="149.5" cy="126" r="3.4"/>
          <circle class="glint" cx="90" cy="134" r="1.6"/><circle class="glint" cx="142" cy="134" r="1.6"/>
        </g></g>
        <g class="eyes eyes-line eyes-happy"><path d="M85 135 Q94 123 103 135"/><path d="M137 135 Q146 123 155 135"/></g>
        <g class="eyes eyes-line eyes-closed"><path d="M85 130 Q94 138 103 130"/><path d="M137 130 Q146 138 155 130"/></g>
        <g class="eyes eyes-line eyes-squint"><path d="M87 124 L101 131 L87 138"/><path d="M153 124 L139 131 L153 138"/></g>
        <g class="eyes eyes-heart">
          <path transform="translate(94 132) scale(1.3)" d="${HEART}"/>
          <path transform="translate(146 132) scale(1.3)" d="${HEART}"/>
        </g>
        <g class="brows brows-angry"><path d="M82 114 L103 122"/><path d="M158 114 L137 122"/></g>
        <g class="brows brows-sad"><path d="M84 120 L102 114"/><path d="M156 120 L138 114"/></g>
        <path class="mouth mouth-open" d="M113 144 Q120 156 127 144 Z"/>
        <ellipse class="mouth mouth-o" cx="120" cy="149" rx="4.5" ry="5.5"/>
        <path class="mouth mouth-wave" d="M111 149 q4.5 -4 9 0 q4.5 4 9 0"/>
        <g class="cat-tears">
          <path d="M90 140 C86 150 84 158 90 161 C96 158 94 150 90 140 Z"/>
          <path d="M150 140 C146 150 144 158 150 161 C156 158 154 150 150 140 Z"/>
        </g>
      </g>
      <g class="fx fx-sparkle">
        <path transform="translate(24 72)" d="${STAR}"/>
        <path transform="translate(214 58) scale(.8)" d="${STAR}"/>
        <path transform="translate(228 140) scale(.6)" d="${STAR}"/>
        <path transform="translate(12 160) scale(.55)" d="${STAR}"/>
      </g>
      <g class="fx fx-hearts">
        <path transform="translate(36 56) scale(1.5)" d="${HEART}"/>
        <path transform="translate(204 44) scale(1.9)" d="${HEART}"/>
        <path transform="translate(120 34) scale(1.2)" d="${HEART}"/>
      </g>
      <g class="fx fx-zzz"><text x="190" y="62">z</text><text x="206" y="44">z</text><text x="222" y="24">Z</text></g>
      <g class="fx fx-bang"><path d="M210 18 L203 52"/><circle cx="200" cy="66" r="4"/></g>
      <g class="fx fx-anger" transform="translate(198 66)">
        <path d="M-12 -4 Q-4 -4 -4 -12 M4 -12 Q4 -4 12 -4 M12 4 Q4 4 4 12 M-4 12 Q-4 4 -12 4"/>
      </g>
    </g>
  </svg>
</button>
<svg class="cat-paws" viewBox="0 0 240 36" aria-hidden="true">
  <g filter="url(#cat-boil-${id})">
    <path class="paw-fill" d="M62 36 L62 22 C62 4 104 4 104 22 L104 36 Z M136 36 L136 22 C136 4 178 4 178 22 L178 36 Z"/>
    <path class="paw-line" d="M62 27 L62 22 C62 4 104 4 104 22 L104 27 M136 27 L136 22 C136 4 178 4 178 22 L178 27"/>
    <path class="paw-toe" d="M76 11 v8 M90 11 v8 M150 11 v8 M164 11 v8"/>
  </g>
</svg>
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
        const dy = y - (rect.top + rect.height * 0.57);
        const dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(dist / 60, 1) * 5;
        const t = `translate(${(dx / dist) * reach}px, ${(dy / dist) * reach}px)`;
        pupils.forEach(p => { p.style.transform = t; });
      }
    };
  }

  window.CottonCat = { create, moodOf, phrase };
})();
