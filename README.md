# 棉球小猫表情库 (mianqiu-catHub)

<p align="center">
  <b>韩系萌系「棉球小猫」（몽실몽실 냥냥이）全网表情归档、静态展示站与只读 Bot API 服务</b>
</p>

---

## 📌 作者署名与版权免责声明

- **原创作者**：**쯔니（zzni）**
- **Kakao 官方系列**：**몽실몽실 냥냥이**（中文常用译名：**棉球小猫** / 蓬蓬猫）
- **官方作者主页**：[Kakao Emoticon Shop - zzni (69020H)](https://e.kakao.com/creator/69020H)
- **作者 Instagram**：[@zz_ni_e](https://www.instagram.com/zz_ni_e)
- **非商业声明**：
  本项目为个人自用、开源技术交流与非商业表情存档库。所有表情包艺术形象、美术版权均归原作者 **쯔니（zzni）** 及 Kakao Corp 所有。请勿将本项目素材用于任何商业营利目的；如需商用请联系原作者或前往 Kakao 官方平台购买正版表情。

---

## 🌟 项目特性

- **多源智能采集管线**：
  - **Kakao 官方源一键拉取**：直接对接 Kakao 开放接口，无损拉取 1~10 弹官方动图全套素材与对应韩文名称。
  - **小红书/外部链接无水印抓取**：自动剥离 CDN 水印参数，提取高清原图。
  - **本地/QQ 收藏表情清洗**：自动扫描 QQ 本地缓存（`personal-emoji`），通过文件头魔数修正后缀（修复 GIF 被存为 JPG 的问题）并感知去重。
- **图像双轨分级与感知去重**：
  - 自动生成 `images/thumbs/` 极速 WebP 缩略图（等比宽 200px，平均 8~15KB），首屏加载加速 80% 以上。
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

---

## 🛠 目录结构

```
mianqiu-catHub/
├── data/
│   ├── memes.json          # 全量表情静态元数据索引 (兼容 GitHub Pages)
│   ├── series.json         # 套系归档目录
│   └── tags.json           # 标签字典
├── images/
│   ├── raw/                # 原始动图/静图文件 (GIF / WebP / PNG)
│   └── thumbs/             # 200px 极速 WebP 缩略图
├── scripts/
│   ├── fetch_kakao.py      # Kakao 官方全套表情抓取与解析器
│   ├── import_local.py     # 本地文件/QQ 表情缓存导入清洗器
│   ├── fetch_url.py        # 单张/批量 URL (含小红书等) 抓取器
│   ├── build_index.py      # 扫描生成 memes.json、缩略图与 dHash 去重
│   └── image_utils.py      # 格式转换、200px WebP 缩略图生成与感知哈希
├── server/
│   ├── app.py              # FastAPI 只读 Bot HTTP 服务
│   └── routes/             # 接口路由实现
├── static/
│   ├── index.html          # 前端展示单页
│   ├── app.js              # 虚拟瀑布流、拼音搜索、CDN 回退与 JSZip 打包
│   └── style.css           # 响应式猫咪主题样式
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

### 2. 抓取与导入表情
- **拉取 Kakao 官方 1~10 弹原版动图**：
  ```bash
  python -m scripts.fetch_kakao --all
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
python -m server.app --port 8000
```
访问 `http://localhost:8000` 即可在浏览器中浏览表情库；第三方 QQ Bot 访问 `http://localhost:8000/api/v1/bot/...` 即可调用只读接口。
