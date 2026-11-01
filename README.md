# 棉球小猫表情库 (mianqiu-catHub)

<p align="center">
  <b>韩系萌系「棉球小猫」（몽실몽실 냥냥이）全网表情归档、静态展示站与只读 Bot API 服务</b>
</p>

生产站：[mianhuacat.elma-gohan.xyz](https://mianhuacat.elma-gohan.xyz/) · 公开源码：[dailiuyi/mianqiu-catHub](https://github.com/dailiuyi/mianqiu-catHub)（默认分支 `main`）。

---

## 📌 作者署名与版权免责声明

- **原创作者**：**쯔니（zzni）**
- **Kakao 官方系列**：**몽실몽실 냥냥이**（中文常用译名：**棉球小猫** / 蓬蓬猫）
- **官方作者主页**：[Kakao Emoticon Shop - zzni (69020H)](https://e.kakao.com/creator/69020H)
- **作者 Instagram**：[@zz_ni_e](https://www.instagram.com/zz_ni_e)
- **非商业声明**：
  本项目为个人自用、开源技术交流与非商业表情存档库。所有表情包艺术形象、美术版权均归原作者 **쯔니（zzni）** 及 Kakao Corp 所有。请勿将本项目素材用于任何商业营利目的；如需商用请联系原作者或前往 Kakao 官方平台购买正版表情。
  仓库公开不代表表情素材获得开源或再分发授权，素材版权与代码可见性分开处理。

---

## 🌟 项目特性

- **多源智能采集管线**：
  - **Kakao 系列拉取**：主线 Vol.1~10（240 张）、Mini.1~5（175 张），以及暗中跟踪猫（32 张）、短毛猫 1~2（48 张）；`--all` 覆盖这 18 个已知系列。
  - **社区高清与二创梗图入库**：`community_clean` 24 张、`community_caption` 50 张。当前索引共 569 张、20 个系列，其中动图 529 张、静图 40 张（2026-11-01）；来源及本地二创流程见采集脚本。
  - **小红书/外部链接无水印抓取**：自动剥离 CDN 水印参数，提取高清原图。
  - **本地/QQ 收藏表情清洗**：自动扫描 QQ 本地缓存（`personal-emoji`），通过文件头魔数修正后缀（修复 GIF 被存为 JPG 的问题）并感知去重。
- **图像双轨分级与感知去重**：
  - 自动生成 `images/thumbs/` 的等比 200px WebP 静态首帧，列表先显示缩略图，再按需加载原图动图。
  - `images/raw/` 保留原始高清动静图（GIF / APNG / WebP / PNG）。
  - 基于 **dHash（差异感知哈希）** 计算汉明距离去重，自动识别重复表情并区分原版与二创改字版。
- **参考 Phoebe-Hub 并大幅改良的前端展示**：
  - **拒绝全量卡顿**：采用视口监听（IntersectionObserver）与触底无限加载，解决 Phoebe-Hub 一次性渲染 1000+ DOM 节点卡死的问题。
  - **多源 CDN 回退**：支持自定义域名 / GitHub Pages / jsDelivr CDN / GitHub Raw 三级智能降级加载。
  - **多维实时检索**：支持中文汉字、拼音首字母/全拼、韩文原名、OCR 识别文字及分类标签过滤。
  - **浏览器端并发批量打包**：集成 JSZip 客户端并发限流打包下载，不消耗服务器算力。
- **极度稳定的第三方 QQ Bot 只读 HTTP 接口**：
  - 版本化约定（`/api/v1/bot/...`），数据结构向后兼容，字段只增不减。
  - 同时生成全量静态 JSON 快照（`data/memes.json`），即便不运行后端服务，Bot 亦可直接通过静态 CDN 读取调用。

---

## 🤖 第三方 QQ Bot 只读 HTTP 接口约定

为方便第三方 QQ 机器人（如基于 OneBot、Lagrange、NoneBot、Mirai 等开发）调用，接口统一返回 JSON 格式，严格遵循以下契约。

生产接口基址为 `https://mianhuacat.elma-gohan.xyz`，不需要密钥。下方 JSON 为结构示例，ID、计数和域名不是实时数据；真实 ID 从查询结果或 `/data/memes.json` 获取，返回的相对图片路径按接口所在站点解析。

### 1. 随机表情
- **路径**：`GET /api/v1/bot/random`
- **查询参数**：
  - `series` (string, 可选): 指定系列（如 `Kakao-Vol.1`、`community`）
  - `tag` (string, 可选): 指定标签（如 `可爱`、`早八`、`偷看`）
  - `animated` (bool, 可选): `true` 仅返回动图，`false` 仅返回静图
- **返回示例** (HTTP 200)：
  ```json
  {
    "code": 0,
    "msg": "ok",
    "data": {
      "id": "mq-01-003",
      "title": "暗中观察",
      "title_ko": "빼꼼",
      "series": "Kakao-Vol.1",
      "is_animated": true,
      "format": "gif",
      "tags": ["偷看", "探头", "可爱", "观察"],
      "ocr_text": "暗中观察",
      "width": 360,
      "height": 360,
      "url": "https://your-domain.com/images/raw/mq-01-003.gif",
      "thumb_url": "https://your-domain.com/images/thumbs/mq-01-003.webp"
    }
  }
  ```

### 2. 关键词与标签检索
- **路径**：`GET /api/v1/bot/search`
- **查询参数**：
  - `q` (string, 必填): 搜索关键词（支持中文、拼音、韩文、OCR 文本）
  - `limit` (int, 默认 10, 最大 50): 返回数量
  - `offset` (int, 默认 0): 翻页偏移量
- **返回示例** (HTTP 200)：
  ```json
  {
    "code": 0,
    "msg": "ok",
    "data": {
      "total": 1,
      "items": [
        {
          "id": "mq-01-003",
          "title": "暗中观察",
          "title_ko": "빼꼼",
          "series": "Kakao-Vol.1",
          "is_animated": true,
          "format": "gif",
          "tags": ["偷看", "探头", "可爱"],
          "url": "https://your-domain.com/images/raw/mq-01-003.gif",
          "thumb_url": "https://your-domain.com/images/thumbs/mq-01-003.webp"
        }
      ]
    }
  }
  ```

### 3. 单个表情详情
- **路径**：`GET /api/v1/bot/emotes/{id}`
- **返回示例** (HTTP 200)：单条表情的完整元数据。

### 4. 所有可用标签与计数
- **路径**：`GET /api/v1/bot/tags`
- **返回示例** (HTTP 200)：
  ```json
  {
    "code": 0,
    "msg": "ok",
    "data": [
      { "name": "可爱", "count": 120 },
      { "name": "早八", "count": 15 },
      { "name": "打工人", "count": 22 }
    ]
  }
  ```

### 5. 系列与整体统计
- `GET /api/v1/bot/series`：全部系列及各自数量。
- `GET /api/v1/bot/summary`：表情总数、动静图数量、系列数、标签数。
- 原图位于 `/images/raw/{id}.webp`；本仓库已为当前全部 569 张生成 `/images/gif/{id}.gif`，供不支持 WebP 的客户端使用。素材后缀仍以实际索引为准。

---

## 🛠 目录结构

```
mianqiu-catHub/
├── data/
│   ├── memes.json          # 全量表情静态元数据索引 (兼容 GitHub Pages)
│   ├── series.json         # 套系归档目录
│   └── tags.json           # 标签字典
├── images/
│   ├── raw/                # 原始动图/静图文件 (动图基本都是 Animated WebP)
│   ├── thumbs/             # 200px 极速 WebP 缩略图（静态首帧）
│   └── gif/                # 由 scripts/export_gif.py 预生成的 GIF 版，供下载
├── scripts/
│   ├── fetch_kakao.py      # Kakao 官方全套表情抓取与解析器
│   ├── import_local.py     # 本地文件/QQ 表情缓存导入清洗器
│   ├── fetch_url.py        # 单张/批量 URL (含小红书等) 抓取器
│   ├── export_gif.py       # 动图转 GIF（供下载，保留透明与时长）
│   ├── build_index.py      # 扫描生成 memes.json、缩略图与 dHash 去重
│   └── image_utils.py      # 格式转换、200px WebP 缩略图生成与感知哈希
├── server/
│   ├── app.py              # FastAPI 只读 Bot HTTP 服务
│   └── routes/             # 接口路由实现
├── static/
│   ├── index.html          # 前端展示单页（根目录 index.html 是它的副本，供 Cloudflare Pages 使用，两者需同步）
│   ├── app.js              # 无限加载、动图按需播放、拼音搜索、套系托盘、小猫互动、CDN 回退与 JSZip 打包
│   ├── cat.js              # 参考图轮廓 SVG 小猫，17 种心情与随机 favicon
│   ├── style.css           # 固定亮粉贴纸主题，含小屏与减少动态效果适配
│   └── fonts/              # ZCOOL 快乐体子集 woff2（OFL 授权，见 ZCOOLKuaiLe-OFL.txt）
├── deploy/                 # 生产发布脚本、systemd 与 nginx 配置
├── tests/                  # Bot API、访问统计及图像工具回归
├── requirements.txt        # Python 依赖
└── README.md               # 本项目说明文档
```

---

## 🚀 快速启动

### 1. 环境准备
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. 抓取与导入表情（扩充素材时可选）
仓库已包含当前索引、原图、缩略图和 GIF，预览或部署无需重新抓取。重新采集会改动数据及素材，请在独立工作分支执行。
- **拉取全部已知 Kakao 系列（含主线、迷你、跟踪猫及短毛猫）**：
  ```bash
  python -m scripts.fetch_kakao --all
  # 或仅抓取迷你系列 (Mini.1~5)
  python -m scripts.fetch_kakao --mini
  ```
- **导入与扩充社区高清图源及二创梗图**：
  ```bash
  python -m scripts.populate_community
  ```
- **导入本地 QQ 收藏表情或下载文件夹**：
  ```bash
  python -m scripts.import_local /path/to/folder --series "community" --tags "可爱,日常"
  ```
- **抓取单张或多张网络图片**：
  ```bash
  python -m scripts.fetch_url "https://example.com/cat.gif" --title "可爱猫猫"
  ```
- **重建索引与生成缩略图**：
  ```bash
  python -m scripts.build_index
  ```

### 3. 启动 Bot API 服务与本地预览
```bash
python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```
访问 `http://localhost:8000` 即可在浏览器中浏览表情库；第三方 QQ Bot 访问 `http://localhost:8000/api/v1/bot/...` 即可调用只读接口。

---

## 生产部署（elma-gohan 服务器）

- 域名：`mianhuacat.elma-gohan.xyz`（2026-11-01 上线，HTTPS，A 记录 → `47.107.95.249`）。
- 布局：`/opt/mianqiu-cathub/releases/rel-*`（保留最近 3 个）+ `current` 软链；Python venv 在 `/opt/mianqiu-cathub/venv`；systemd 单元 `mianqiu-cathub`，以专用系统用户 `mianqiu` 运行，监听 `127.0.0.1:8093`，沙箱 `ProtectSystem=strict`、`NoNewPrivileges`。
- nginx：`/etc/nginx/conf.d/mianhuacat.elma-gohan.xyz.conf`，80 → 301 到 443，只放行 `/`、`/static/`、`/data/`、`/images/`、`/api/v1/bot/` 和 `/api/stats*`，其余一律 404（服务端源码、`/docs`、`/openapi.json` 均不暴露）。
- 证书：Let's Encrypt（webroot `/var/www/certbot`），2027-01-30 到期，由服务器上的 `certbot.timer` 自动续期。
- 发布：`deploy/deploy.sh [user@host]`，健康检查失败自动回滚软链；nginx 配置测试失败则撤掉本站点配置。

### 发布与回滚

1. 在功能分支完成改动及文档，运行下方检查；提交后将已验证的分支合并到 `main`。发布脚本上传的是**当前工作区文件**，并不自动读取 GitHub，也不检查分支或脏工作区。
2. 确认 SSH 可用、生产磁盘空间足够、`nginx -t` 通过，并列出旧版本清理清单；脚本成功后仅保留最近 3 个 release，不清理 `/var/lib/mianqiu-cathub/stats.json`。
3. 从已提交的 `main` 发布，再验证公网页面与 API，最后推送 GitHub：
   ```bash
   SSH_KEY="$HOME/.ssh/id_ed25519_elma_gohan" bash deploy/deploy.sh root@elma-gohan.xyz
   curl -fsS https://mianhuacat.elma-gohan.xyz/api/v1/bot/summary
   curl -fsS https://mianhuacat.elma-gohan.xyz/api/stats
   git push origin main
   ```
   SSH 私钥和统计数据只留在本机/服务器，不进入仓库；GitHub 已有同名公开仓库，无需重复创建。
4. 脚本打印 `DEPLOYED rel-...` 仅表示后端本机健康检查与 nginx 配置检查通过。还需用真实浏览器检查小猫表情、搜索、图片/动图、下载及页脚统计；生产验收会产生真实访问量。
5. 手动回滚：先用 `readlink -f /opt/mianqiu-cathub/current` 记录当前版本，确认要恢复的 release 仍在，然后在服务器执行 `ln -sfn /opt/mianqiu-cathub/releases/<旧版本> /opt/mianqiu-cathub/current`、`systemctl restart mianqiu-cathub`，再验本机和公网接口。统计文件不回退。脚本的自动回滚仅覆盖后端健康检查失败；nginx 检查失败会移除本站配置并退出，需从同目录的 `.bak-rel-*` 恢复配置，通过 `nginx -t` 后再 reload，不能视为整站自动回滚。

### 发布前检查与本地验收

在已安装 `requirements.txt` 的虚拟环境中运行：

```bash
python -m pytest -q
node --check static/cat.js
node --check static/app.js
cmp index.html static/index.html
bash -n deploy/deploy.sh
```

2026-11-01 表情扩充版本：上述检查通过，现有测试 21 项通过；另有一条 Starlette TestClient/httpx 弃用警告，不影响本次测试结果。索引的 569 个 ID 无重复，原图、缩略图和 GIF 均可在仓库找到。浏览器已验证情绪关键词、卡片悬停、无结果状态、戳猫送图、390px 小屏及减少动态效果；这些是实际交互检查，不代表自动化测试覆盖全部前端。视觉相似度仍由用户验收。

### 2026-11-01 生产发布记录

- 应用版本 `d0ea35e`，从 `feat/cute-frontend` 快进合并到 `main`；服务器当前 release 为 `rel-20261101T150927Z`。此后的发布记录提交只改 README，不改变已部署应用文件。
- `mianqiu-cathub` 服务 active，nginx 配置检查通过；HTTP 跳转 HTTPS 返回 301，公网首页 HTTPS 200，Bot summary 返回 569 张（动图 529、静图 40）。首页、两个 JS、CSS、字体、索引及后端源码共 7 个核心文件的 SHA-256 与本地一致。
- 公网真实浏览器验证：「大哭」「干饭」「墨镜」「头疼」「发愁」触发对应新表情，悬停「加班」触发大笑，空搜索结果最终回到委屈，戳猫可送图并打开大图。实际下载 `community_caption-41.gif`（266746 字节）与仓库文件逐字节一致；对应 WebP 在 6 次页面截图采样中出现 5 个不同画面，确认正在播放。
- 390px 视口无横向溢出，减少动态效果时头部和舌头动画均为 `none`；页脚显示真实统计，发布前后计数未清零。验收请求和页面浏览也计入生产统计。
- 保留的前两个 release：`rel-20261101T144436Z`、`rel-20261101T140259Z`；优先使用前者回滚。仅清理了预检列出的 `rel-20261101T130714Z`，统计存储目录保持不变。

## 📊 真实访问统计（2026-11-01）

页脚那行「小猫已经替机器人跑了 N 趟，页面被翻了 N 次，N 位朋友来过」来自两个真实计数器，不是写死的数字。

- **接口调用量**：`server/app.py` 的 HTTP 中间件只在 `/api/v1/bot/*` 上 +1，排除 CORS 预检和来自 `127.0.0.1` 的请求（部署脚本的健康检查走本机，不会虚增）。
- **页面浏览量**：没有走 nginx 日志（nginx 直接发静态文件，不经过 Python），而是前端加载后 `POST /api/stats/view` 记一次。不执行 JS 的爬虫和 `curl` 不计入，所以比原始 access log 更接近「真的有人来看过」。
- **独立访客**：同一次上报夹带浏览器 `localStorage` 里的随机 id，服务端用 SHA-256 前 16 位压成 64 位整数去重；隐私模式拿不到 localStorage 时只记浏览量不记访客。访客 id 数量上限 10 万。
- **存储**：`/var/lib/mianqiu-cathub/stats.json`（systemd `StateDirectory`，即应用以 `ProtectSystem=strict` 运行也能写），发布、重启、回滚都不清空。内存累计，每 10 秒最多原子落盘一次，进程被强杀最多丢 10 秒；正常 shutdown 会立即落盘。本地开发不设 `MIANQIU_STATS_PATH` 时写到仓库内 `.state/stats.json`（已 gitignore）。
- **统计范围**：只统计 elma-gohan 这一份生产站。Cloudflare Pages 的 `functions/` 副本各自独立，不共享数字；只支持单 worker，多开会各存一份互相覆盖。
- **接口**：`GET /api/stats` 返回 `{api_calls, page_views, visitors, since}`，`POST /api/stats/view` 记一次浏览（204）。两个接口自身不计数。
- **已知局限**：`/api/stats/view` 没有频控，人为刷会给页面浏览量注水；数字按原样展示，不做估算或平滑。

## 前端视觉（2026-11-01 重构，同日两次调整配色）

- 方向：固定亮粉渐变，不随系统深色模式切换。页面底色是从 `#ff9ccd` 到 `#ffe2ef` 的斜向粉色渐变，叠一层白色圆点；表情卡片、按钮、搜索框是深梅色描边、玫粉投影的白色贴纸，主按钮用粉色渐变。配色经过三版：天蓝（否决）→ 淡粉白（用户嫌不够亮）→ 现在这版，颜色变量集中在 `static/style.css` 顶部 `:root`。
- 页面文案里的「몽실몽실 냥냥이」已按用户要求改为「棉花小猫」（两份 HTML 的标题和首屏文案同步）；署名/版权说明和 Bot API 返回的 `series_name` 仍保留原作韩文名，后者是对外接口字段，没改。
- 吉祥物 `static/cat.js`（2026-11-01 重绘及表情扩充）：以用户选定的「粉色爱心背景、弯短眼」小猫为准，在参考图坐标里描绘耳朵、脸颊和下颌，不再使用不同姿势素材的平均轮廓。保留短圆耳之间的开口、宽扁白脸、弯短眼、粉色腮红及四道浅红笔触；取消持续的噪声抖动，默认只轻微呼吸和眨眼。在原有 11 种表情上新增大笑、嚎啕大哭、馋嘴、得意、晕乎、紧张，共 17 种；用独立眼形、嘴形、泪流、吐舌、汗滴及动作区分，未改轮廓路径。眨眼改为一侧睁眼，害羞增加捂脸小爪，疑惑增加高低眼和单侧挑眉。减少动态效果时全部动画停用。首屏、右下角伙伴及随机 favicon 共用轮廓路径；静态默认 favicon 同步绘制。两份 HTML 的资源版本为 `cat-expressions-1`，避免旧缓存干扰验收。最后参考图是位图，SVG 为重绘，视觉相似度由用户验收。
- 小猫互动（逻辑在 `static/app.js` 的「小猫互动」一节）：
  - 眼睛跟着鼠标转。鼠标停在某张表情上时，依次从图中文字、标题、情绪标签判断心情；“可爱”等通用标签不作为触发词。没有情绪信息时，按表情 id 固定挑开心、喜欢、惊讶、眨眼、害羞、大笑、得意中的一种。
  - 戳一下小猫，它会从当前筛选结果里随机送一张表情，点气泡里的图就打开大图；3 秒内戳 6 下它会生气。
  - 搜不到结果时小猫哭；25 秒不操作它会睡着，一动就醒。
  - 首屏小猫滚出视口后，右下角会探出一只小猫伙伴接替上面这些互动。
  - 表情验收：搜索「大哭」「干饭」「墨镜」「头疼」「发愁」分别触发大哭、馋嘴、得意、晕乎、紧张；搜索「加班」后悬停该表情可查看无情绪文字时的大笑选择。「笑哭」优先匹配大笑，「大哭」优先于普通委屈，「哼哼」优先于生气。无搜索结果仍显示委屈，不伪造匹配结果。
- 动图播放：缩略图（`images/thumbs/`）是静态首帧。贴纸进入视口后，前端在后台预载 `images/raw/` 里的原图动图，加载完再替换，避免闪白。全部 569 张原图共 100 MB。滚到哪里才加载到哪里。
- 下载格式：源图以 Animated WebP 为主，QQ、微信等客户端对 WebP 表情支持不稳定，所以用 `scripts/export_gif.py` 预先把全部表情转成 GIF 放在 `images/gif/`（569 个，共 69 MB）。大图弹窗有「下载 GIF」和「下载原图」两个按钮；批量托盘可选 GIF 或原图，打包用 JSZip 在前端完成，GIF 缺失时自动回退原图。
  - 转换要点：逐帧时长从 WebP 的 ANMF 块直接读（Pillow 解码前读不到 `duration`）；GIF 延迟只能按 10ms 存，按累计时间补偿取整，否则每帧 119ms、149ms 会被截成 110ms、140ms，几十帧累积成几百毫秒；透明色用调色板保留索引 255，帧间用 `disposal=2`。
  - 新增表情后重跑：`python -m scripts.export_gif`（默认只补缺失的，`--force` 全部重建）。
- 标题字体：ZCOOL 快乐体（Google Fonts，OFL）。当前子集含 724 个字符，woff2 约 71 KiB，覆盖本轮页面、脚本、表情标题和 OCR 文本中原字体支持的字符；原字体不含的韩文、emoji 等由系统字体显示。本轮表情新增台词后已重建子集，并为字体 URL 添加 `cat-expressions-1` 缓存版本。**新增带新汉字的文案、台词或表情标题后，需要重新生成子集**，否则缺字会回落到系统字体：
  ```bash
  # 1. 从 static/index.html、static/app.js、static/cat.js 和 data/memes.json 的 title/ocr_text 收集字符到 chars.txt
  # 2. 用 Google Fonts 的 ZCOOLKuaiLe-Regular.ttf 生成子集
  uv run --with fonttools --with brotli pyftsubset ZCOOLKuaiLe-Regular.ttf \
    --text-file=chars.txt --flavor=woff2 --layout-features='*' \
    --output-file=static/fonts/zcool-kuaile-subset.woff2
  ```
- 套系托盘：用每个套系的第一张表情当封面；`Kakao-Vol.N` 显示为「第N弹」，`Kakao-Mini.N` 显示为「迷你N弹」，跟踪猫、短毛猫和社区两类也有中文映射（见 `static/app.js` 的 `seriesLabel`）。
- 首屏快捷词取自表情的图中文字（`ocr_text`），点一下就搜索，再点一下清空。
- 标签栏图标：`static/favicon.svg` 是默认的弯眼小猫，`static/cat.js` 的 `randomFavicon()` 在每次加载时用 7 种表情 × 5 种底色 × 4 种腮红随机组合，转成 data URI 替换 `<link id="favicon">`；用 localStorage 记住上一次的组合，最多尝试 8 次避开连续重复。该随机逻辑并非全历史唯一。
- 小屏（≤720px）时筛选抽屉不吸顶，避免占掉三分之一屏幕。
