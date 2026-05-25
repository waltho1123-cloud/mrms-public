# MRMS — Meeting Recording & Minutes System

自動化會議錄音轉錄與摘要系統。上傳音檔 → 自動轉錄 (STT) → AI 摘要 → 推送至 LINE 群組。

## 功能

- 音檔上傳（mp3 / m4a / wav / ogg / webm，最大 200MB）
- 背景非同步處理（BullMQ + Redis）
- 語音轉錄（OpenAI gpt-4o-mini-transcribe）
- AI 摘要（OpenAI gpt-5.4-mini）
- 即時進度追蹤（SSE）
- 自訂 prompt 範本
- LINE Messaging API 推送（重用 `DingTalkWebhook` 表名）
- Admin dashboard（會議紀錄、prompt 管理、推送設定、系統日誌）

## 技術棧

- Next.js 16 (App Router, Turbopack)
- React 19
- PostgreSQL + Prisma 5
- Redis + BullMQ
- TypeScript, Tailwind CSS 4

## 環境需求

- Node.js 20+
- PostgreSQL 14+
- Redis 6+
- OpenAI API key（轉錄與摘要共用）

## 安裝步驟

```bash
# 1. 安裝依賴
npm install

# 2. 複製環境變數樣板並填入
cp .env.example .env
# 編輯 .env，填入 DATABASE_URL / REDIS_URL / OPENAI_API_KEY

# 3. 啟動 PostgreSQL + Redis（自行決定方式，Docker 範例如下）
docker run -d --name mrms-postgres -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mrms postgres:14
docker run -d --name mrms-redis -p 6379:6379 redis:6

# 4. 建立資料表
npx prisma db push
npx prisma generate

# 5. 建立 admin 帳號與預設 prompt 範本
npm run seed
```

## 啟動

需要兩個 process：

```bash
# Terminal 1：Web server
npm run dev

# Terminal 2：背景 worker（處理轉錄與摘要）
npm run worker
```

打開 http://localhost:3000

- 前台：`/` 上傳音檔
- 後台：`/admin` 管理（預設帳號見 `.env` 的 `ADMIN_EMAIL` / `ADMIN_PASSWORD`）

## 環境變數

見 `.env.example`，最少需要：

| 變數 | 說明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `REDIS_URL` | Redis 連線字串 |
| `OPENAI_API_KEY` | OpenAI（STT 與摘要共用）|
| `NEXTAUTH_SECRET` | JWT 簽章用，**正式環境務必更換** |
| `UPLOAD_DIR` | 音檔暫存目錄，預設 `/tmp/mrms-uploads` |
| `MAX_FILE_SIZE_MB` | 上傳大小上限，預設 200 |
| `AUTO_PUSH` | 摘要完成是否自動推 LINE，`true` / `false` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seed 建立的初始 admin |

## 專案結構

```
src/
├── app/
│   ├── (frontend)/        # 公開前台：上傳、歷史紀錄、詳情
│   ├── admin/             # Admin 後台
│   └── api/v1/            # REST API
├── components/ui/         # 共用 UI 元件
└── lib/
    ├── services/          # 業務邏輯（ai / stt / line / task）
    ├── queue/             # BullMQ worker 與 processors
    ├── hooks/             # React hooks（SSE、上傳）
    └── utils/             # 工具（auth、errors、format）
prisma/
├── schema.prisma
└── seed.ts
```

## 開發指令

```bash
npm run dev          # 啟動 dev server
npm run worker       # 啟動背景 worker
npm run build        # 正式 build
npm run start        # 正式 server
npm run typecheck    # TypeScript 檢查
npm run lint         # ESLint
npm run seed         # 重跑 seed
```

## 部署備註

- 正式環境**務必**換掉 `NEXTAUTH_SECRET`（至少 32 字元隨機字串）
- `UPLOAD_DIR` 在容器化部署時建議掛載 persistent volume
- worker 與 web server 是兩個獨立 process，可分開部署
- 預設 admin 密碼必須改

## Zeabur 部署

1. 在 Zeabur 新增 PostgreSQL 與 Redis service
2. 新增本專案的 Web service（從 GitHub repo），Service Variables 設定：

   | Key | 來源 |
   |---|---|
   | `DATABASE_URL` | `${POSTGRES.DATABASE_URL}` |
   | `REDIS_URL` | `${REDIS.REDIS_URL}` |
   | `NEXTAUTH_SECRET` | 自行產生 32+ 字隨機字串 |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seed 用 |
   | `OPENAI_API_KEY` | 可選，部署後也能從 admin UI 設定 |
   | `UPLOAD_DIR` | 預設 `/tmp/mrms-uploads`，需要 redeploy 保留請改掛 volume |

3. Web service 的 build 預設跑 `npm run build`（包含 `prisma generate`），start 預設跑 `npm run start`（包含 `prisma db push` 自動 sync schema）
4. 另開一個 Worker service，使用相同 repo，把 start command 設為 `npm run worker`
5. 首次部署完，在 Web service 進入 console 跑一次 `npm run seed` 建立 admin 帳號
6. 登入 `/admin` 後，在「系統設定」頁填入 / 修改 `OPENAI_API_KEY`（會存到 Postgres，redeploy 後仍保留）

### API Key 儲存策略
API keys 統一存 PostgreSQL（`AppSetting` table）。讀取優先序：DB → 環境變數 → 未設定。讀寫都有 30 秒 in-memory cache，跨 process（web/worker）會在 30 秒內同步。

## 授權

請依使用者需求自行決定。

