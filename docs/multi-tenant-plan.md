# 多租戶 SaaS 改造計畫

> 目標：讓任何 user 註冊登入後填自己的 OpenAI API key 與 LINE Webhook，每位 user 完全資料隔離。
> Cost 完全由 user 承擔（強制自帶 OpenAI key）。

## Phase 0 — 關鍵決策

| 議題 | 決定 | 理由 |
|---|---|---|
| 認證方式 | JWT email+password（沿用現有 `auth.ts`），日後再加 OAuth | 改動最小，已有可用 helper |
| Session 儲存 | 從 `localStorage` 改 **httpOnly cookie** | SaaS 安全標準；admin 一併改 |
| Email 驗證 | MVP 跳過，schema 留 `emailVerifiedAt` 欄位 | 縮短時程 |
| 密碼重設 | MVP 跳過，admin 後台留「重設」按鈕應急 | 同上 |
| AdminUser 合併到 User | **合併**（role='admin'） | 乾淨，未來可升降權限 |
| 既有 `DingTalkWebhook` | rename → `UserWebhook`，加 `userId` | 還沒上線資料可直接重塑 |
| 既有 `AppSetting` | 換成 `UserSetting (userId, key)` 複合 PK | per-user 隔離 |

## Phase 1 — DB Schema 重構

```prisma
model User {
  id              String    @id @default(uuid())
  email           String    @unique
  passwordHash    String
  name            String?
  role            String    @default("user")     // 'user' | 'admin'
  status          String    @default("active")   // 'active' | 'disabled'
  emailVerifiedAt DateTime?
  createdAt       DateTime  @default(now())
  lastLoginAt     DateTime?

  meetingTasks MeetingTask[]
  webhooks     UserWebhook[]
  settings     UserSetting[]
}

model UserSetting {
  userId    String
  key       String          // 'OPENAI_API_KEY'（未來可擴展）
  value     String
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([userId, key])
}

model UserWebhook {
  id          String   @id @default(uuid())
  userId      String
  name        String
  groupId     String     // LINE group id
  accessToken String     // LINE channel access token
  isDefault   Boolean  @default(false)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model MeetingTask {
  // ... existing fields
  userId String
  user   User @relation(fields: [userId], references: [id])
  @@index([userId])
}
```

- 刪除：`AdminUser`、`DingTalkWebhook`、`AppSetting`
- `Minutes` / `Transcript` / `PushLog` / `SystemLog` 透過 `MeetingTask.userId` 間接隔離（不直接加 FK）

## Phase 2 — 認證 API

| Method | Path | 說明 |
|---|---|---|
| POST | `/api/v1/auth/register` | email + password，回 JWT cookie |
| POST | `/api/v1/auth/login` | 現有 endpoint 改接 User（含 admin） |
| POST | `/api/v1/auth/logout` | 清 cookie |
| GET  | `/api/v1/me` | 回目前登入 user |

`src/lib/utils/auth.ts` 拆成 `requireUser(req)` / `requireAdmin(req)`，回傳 `{ sub, email, role }`。

## Phase 3 — 資料隔離（最關鍵）

每個既有 API 加 ownership scope：

| 既有 endpoint | 改動 |
|---|---|
| `POST /api/v1/tasks` | 強制 `userId = me.sub`；先檢查 `UserSetting` 有沒有 OPENAI_API_KEY，沒有 → 400 |
| `GET  /api/v1/tasks/:id` | `where: { id, userId: me.sub }`（admin 例外） |
| `GET  /api/v1/tasks/:id/sse` | 同上，SSE event 也要 scope |
| `GET  /api/v1/tasks/:id/status` | 同上 |
| `POST /api/v1/tasks/:id/push` | 同上 + webhook 也要屬於 me |
| `POST /api/v1/tasks/:id/regenerate` | 同上 |
| `GET  /api/v1/admin/*` | 改成 `requireAdmin`，可 cross-user |
| `GET  /api/v1/prompts` | 保留公開（template 是 system-wide） |

**安全測試**：寫 e2e「user A 拿 user B 的 task id → 必須 404」。Multi-tenant 最常見的 IDOR 漏洞。

## Phase 4 — Worker 改寫

`transcribe.processor.ts` / `summarize.processor.ts`：
- 拿到 task 時 `include: { user: { include: { settings: true } } }`
- 從 `task.user.settings` 取 `OPENAI_API_KEY` 給 OpenAI client
- push processor 用 `task.user.webhooks` 找 default webhook
- 不再走全域 `getApiKey()`

`src/lib/services/ai.service.ts` / `stt.service.ts` 改成接受 `apiKey: string` 參數。

## Phase 5 — UI

| 路徑 | 變更 |
|---|---|
| `/` 未登入 | landing + 登入/註冊按鈕 |
| `/` 已登入 | 上傳頁（有 OPENAI key 才開放 submit） |
| `/login` | 新（user 版） |
| `/register` | 新 |
| `/me/settings` | 新（OpenAI key + LINE webhook 管理） |
| `/history` | 自動 scope to me |
| `/tasks/[id]` | 加 ownership 檢查 |
| `/admin/setup` | **刪除**（OpenAI 改 per-user） |
| `/admin/webhooks` | **刪除**（webhook 改 per-user） |
| `/admin/users` | 新（list users、disable、查 task） |
| `/admin/prompts` | 保留（system-wide） |
| `/admin/dashboard` | 保留，跨 user 統計 |
| `/admin/logs` | 保留 |

## Phase 6 — Session 安全強化

- JWT 從 `localStorage` 移到 `Set-Cookie: HttpOnly; SameSite=Lax; Secure`（prod）
- API route 從 `Authorization: Bearer` 改讀 cookie
- 保留 Bearer 模式做未來 API 客戶端支援
- CSRF：SameSite=Lax 即可

## Phase 7 — Migration / Cleanup

- `prisma db push` 改寫 schema
- 既有 `admin@wiwi.local` → 自動建為 `User(role='admin')`，舊 `AdminUser` 刪除
- `DingTalkWebhook` / `AppSetting` 表直接 drop（還沒上線資料）
- `/admin/setup`、`/admin/webhooks` 頁面刪除

## 任務排序（建議）

1. ✅ Schema migration + seed 改寫
2. 認證 helper 拆分 + register/me endpoint
3. UI: register / login / me/settings
4. 資料 ownership scope（所有 task / webhook / setting API）+ IDOR 測試
5. 上傳流程 gating（必填 OpenAI key）
6. worker 改寫
7. admin 後台調整（刪 setup/webhooks、新增 users）
8. httpOnly cookie 切換
9. 視需要：email 驗證、密碼重設

## 估時
- 核心 1-7：5-7 個工作天
- httpOnly cookie 安全強化：+1 天
- email 驗證 / 密碼重設：+2 天（MVP 可跳）

## 風險
- **Phase 3 是漏洞溫床**：IDOR、SSE 串到別人 task、worker 拿錯 key。建議 test-first
- **Migration 不可逆**：production 一旦有資料就不能 `db push` 重塑，要先決定好
- **GPT cost transfer**：user 沒填 key 就完全不能用，註冊轉換率會降；UI 要把「為什麼要填」說清楚

## 進度

- [x] Phase 0 — 決策確認
- [ ] Phase 1 — Schema + lib/service shim（進行中）
- [ ] Phase 2 — 認證 API（register, me, logout, 拆 requireUser/requireAdmin）
- [ ] Phase 3 — Ownership scope + IDOR 測試
- [ ] Phase 4 — Worker 改寫
- [ ] Phase 5 — UI（login/register/me/settings）
- [ ] Phase 6 — httpOnly cookie
- [ ] Phase 7 — 後台清理
