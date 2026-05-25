# 使用者設定指南

註冊登入後，您需要設定兩件事才能使用本服務：

1. **OpenAI API Key**（必填）— 用於語音轉錄與 AI 摘要
2. **LINE Bot**（選填）— 若您希望摘要完成後自動推送到 LINE 個人或群組

所有設定都在 **後台 → 我的設定（`/me/settings`）** 內完成，僅您本人可見可改。

---

## 1. OpenAI API Key 設定

### 為什麼需要您自己的 Key？
- 費用直接從您的 OpenAI 帳號扣款，**不會經過本服務**
- 用量、額度、計費明細都在您的 OpenAI 後台
- 您隨時可以撤銷、輪換、或更換 Key

### 預估費用（gpt-5.4-mini，2026/05 牌價）

| 用量 | Input | Output |
|---|---|---|
| 每 1M token | $0.75 USD | $4.50 USD |

範例：1 小時會議錄音（約 12,000 字逐字稿），轉錄 + 摘要約 **$0.05–0.10 USD**。

### 取得 Key 步驟

1. 前往 [OpenAI Platform → API keys](https://platform.openai.com/api-keys)
2. 若還沒有 OpenAI 帳號，先註冊並完成手機驗證
3. 進入 **Settings → Billing**，至少儲值 $5 USD（OpenAI 規定 Pre-paid credit；無此將出現 `insufficient_quota`）
4. 回到 **API keys** 頁，點右上 **Create new secret key**
5. 命名（例如 `MRMS`），複製 **完整的 key**（`sk-...` 開頭）
   - ⚠️ 關閉視窗後 OpenAI **不會再顯示完整 key**，請當下複製存好

### 在 MRMS 設定

1. 登入 → 右上「我的設定」
2. 「OpenAI API Key」區塊 → 貼入剛複製的 key → 點 **儲存**
3. 點 **測試連線**，應顯示綠色「OpenAI API key 驗證成功」
4. 即可回首頁上傳音檔

> 儲存即生效。可隨時更換或清除；清除後將無法上傳。

---

## 2. LINE Bot 設定

LINE Bot 推送目前支援兩種目標：

| 類型 | ID 開頭 | 適用 |
|---|---|---|
| **個人 User ID** | `U` + 32 hex（例 `U1234567890abcdef...`） | 推送到您本人的 LINE 帳號 |
| **群組 Group ID** | `C` + 32 hex（例 `C1234567890abcdef...`） | 推送到您加入的 LINE 群組 |

### 步驟一：建立 LINE Messaging API Channel

1. 前往 [LINE Developers Console](https://developers.line.biz/console/)
2. 用 LINE 帳號登入，建立或選擇一個 **Provider**（公司／個人均可）
3. 點 **Create a Messaging API channel**
4. 填寫 channel name（例如「MRMS 會議紀錄」）、上傳 icon、選擇分類即可建立

### 步驟二：取得 Channel Access Token

1. 進入剛建立的 channel
2. 點頂部 **Messaging API** tab
3. 捲到最下面 **Channel access token (long-lived)** 區塊
4. 點 **Issue** → 複製出現的 token
   - 同樣⚠️ 離開頁面後再回來可看到 token，但建議當下存好

### 步驟三：取得 Target ID

#### 選項 A：推送到「個人」（最簡單，建議第一次測試用）

1. 在 LINE Developers Console → 您的 channel → **Basic settings** tab
2. 捲到 **Your user ID** 區塊（在頁面下方）
3. 複製 `U` 開頭的 ID
4. **記得用您本人 LINE 加 Bot 為好友**（同頁有 QR code 可掃），否則無法推送

#### 選項 B：推送到「群組」

LINE 沒有提供 UI 直接看 Group ID，需要透過 webhook 取得：

1. **暫時設定 webhook URL**：
   - 到 [webhook.site](https://webhook.site)（免註冊），複製它給您的「Your unique URL」
   - 回 LINE Developers Console → 您的 channel → **Messaging API** tab → **Webhook URL**
   - 貼上 webhook.site 的 URL → 點 **Verify**（應該成功）
   - 開啟 **Use webhook**

2. **把 Bot 加入群組**：
   - 在 Basic settings 取得 Bot 的 QR code 或加好友連結
   - 用 LINE 加 Bot 為好友
   - 在您想推送的群組裡 **點右上選單 → 邀請 → 選 Bot 加入**

3. **在群組發任意訊息**（隨便打一個字）

4. **回 webhook.site 看 payload**，找類似這段：
   ```json
   {
     "events": [{
       "type": "message",
       "source": {
         "type": "group",
         "groupId": "C1234567890abcdef..."  // ← 這就是 Group ID
       },
       ...
     }]
   }
   ```
5. 複製該 `groupId`

6. **設定完 MRMS 後可移除 webhook**：把 webhook URL 清空、關掉 Use webhook，避免不需要的請求

### 步驟四：在 MRMS 設定

1. 「我的設定」→ 「LINE Bot 推送設定」→ **新增**
2. 填寫：
   - **Bot 名稱**：自訂顯示用，例如「業務群組」「我本人」
   - **LINE Target ID**：步驟三取得的 `U...` 或 `C...`（系統會自動辨識並標記類型）
   - **Channel Access Token**：步驟二複製的 token
   - 勾選 **設為預設**（若要讓所有摘要都推到這個目標）
3. 點 **建立**

### 步驟五：測試推送

回到剛新增的卡片，點 **測試** 按鈕：
- 成功 → 您的 LINE 會收到「📋 MRMS 測試訊息」
- 失敗 → 看錯誤訊息，常見原因見下方

---

## 常見問題

### OpenAI

| 錯誤 | 原因 | 解法 |
|---|---|---|
| `Incorrect API key provided` | Key 打錯或被撤銷 | 重新貼一次完整 key |
| `insufficient_quota` | 沒儲值 / 額度用完 | OpenAI Billing 加值 |
| `model_not_found` | model id 不對（如帳號還沒解鎖 gpt-5.4-mini） | 暫時改用 `gpt-4o-mini` 或聯絡 OpenAI 開通 |
| 摘要長時間沒回應 | 大檔超時 | 把音檔切短再上傳，或檢查網路 |

### LINE Bot

| 錯誤 | 原因 | 解法 |
|---|---|---|
| `Invalid reply token` / 401 | Channel Access Token 錯誤 | 在 LINE Console 重新 issue 一次 token |
| `Not found` 或推送沒收到 | 個人 ID：Bot 沒被加為好友<br>群組 ID：Bot 不在該群組 | 重新加好友 / 邀請 Bot 入群 |
| `User has not subscribed to the OA` | 對方還沒加 Bot 好友 | 對方須先加 Bot |
| 測試成功但實際摘要沒推送 | 沒設「預設」或設了多個目標 | 確認該 Bot 卡片有 ✓ **預設** 標籤 |
| 群組訊息收到 webhook.site 沒看到 groupId | source.type 是 `user` 而非 `group` | 確認您在「群組」內發訊息，且 Bot 確實已加入群組 |

---

## 安全注意

- API Key 與 Channel Token 屬於敏感資訊；本服務只儲存在資料庫，僅您本人可見
- 若懷疑外洩：到 OpenAI / LINE Console 撤銷後重 issue，並在 MRMS 重存
- 系統不會主動 log 完整 key 的內容；測試或顯示時只會看到 mask 過的前後 4 碼

## 相關連結

- [OpenAI API 定價](https://openai.com/api/pricing/)
- [OpenAI Platform Dashboard](https://platform.openai.com/)
- [LINE Developers Console](https://developers.line.biz/console/)
- [LINE Messaging API 官方文件](https://developers.line.biz/en/docs/messaging-api/)
