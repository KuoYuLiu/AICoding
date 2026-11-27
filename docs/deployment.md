# 部署與試辦準備

階段 0 的試辦規模是 5 至 10 位學生，以下用託管服務部署，不需要自己管伺服器。建議組合：

| 元件 | 建議服務 | 對應環境變數 |
| --- | --- | --- |
| 網站 | Vercel（連結 GitHub repo 自動部署） | — |
| 資料庫 | Neon 或 Supabase 的託管 PostgreSQL | `DATABASE_URL` |
| 登入 | Google Cloud OAuth 用戶端 | `AUTH_SECRET`、`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET` |
| 執行學生程式 | Judge0 CE（RapidAPI 託管，或學校自架） | `JUDGE0_URL`、`JUDGE0_API_KEY` |
| AI | Anthropic API | `ANTHROPIC_API_KEY` |
| 教師名單 | — | `TEACHER_EMAILS` |

所有金鑰只放在 Vercel 的 Environment Variables，不要寫進程式碼或 commit。

## 1. 資料庫

1. 在 Neon（或 Supabase）建立一個 PostgreSQL 專案，區域選離台灣近的（例如 Singapore、Tokyo）。
2. 複製連線字串，形如 `postgresql://user:password@host/db?sslmode=require`，這就是 `DATABASE_URL`。
3. 在自己電腦的專案目錄，用這個連線字串建立資料表並匯入題目：

```bash
DATABASE_URL="（正式資料庫連線字串）" npm run db:deploy
DATABASE_URL="（正式資料庫連線字串）" CODE_RUNNER=docker npm run seed
```

`npm run seed` 會先用參考解答跑過所有測資，全部通過才寫入。在自己電腦用開發用 Docker 執行器即可（需要 Docker Desktop）。之後每次 schema 有新的 migration，都要再執行一次 `npm run db:deploy`。

## 2. Google 登入

1. 到 Google Cloud Console 建立專案，開啟「OAuth 同意畫面」：
   - 使用者類型：學校有 Google Workspace 且只給校內帳號用，選「內部」；否則選「外部」，並把試辦學生的 Gmail 加進「測試使用者」。
   - 應用程式名稱填 AICoding，支援 Email 填自己的信箱。
2. 「憑證」→「建立憑證」→「OAuth 用戶端 ID」，類型選「網頁應用程式」：
   - 已授權的 JavaScript 來源：`https://你的網域`
   - 已授權的重新導向 URI：`https://你的網域/api/auth/callback/google`
3. 把用戶端 ID 與密鑰填進 `AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`。
4. `AUTH_SECRET` 用 `npx auth secret` 產生一組隨機值。
5. `TEACHER_EMAILS` 填老師的 Google 帳號，多位用逗號分隔。其他人登入一律是學生。

## 3. 執行學生程式（Judge0）

學生程式絕不在網站伺服器上執行，一律送到 Judge0。

- **RapidAPI 託管的 Judge0 CE**：訂閱後取得金鑰。`JUDGE0_URL=https://judge0-ce.p.rapidapi.com`，`JUDGE0_API_KEY` 填 RapidAPI 金鑰。系統看到 `rapidapi.com` 會自動改用 RapidAPI 的標頭。
- **學校自架 Judge0**：`JUDGE0_URL` 填自架網址，`JUDGE0_API_KEY` 填 Judge0 設定的 `AUTHN_TOKEN`（以 `X-Auth-Token` 送出）。

Python 3 使用 Judge0 語言 id 71（見 `config/languages/python.json`）。每次「執行」跑 2 筆範例、「提交測試」跑 6 筆隱藏測資，每位學生每分鐘最多 10 次，可依此估算 Judge0 方案的額度。

注意：學生程式碼會送到 Judge0 服務商。若學校有資料規範，選擇自架。

## 4. Anthropic API

1. 在 Anthropic Console 建立 API key，填進 `ANTHROPIC_API_KEY`。
2. 建議在 Console 設定每月花費上限。用量可在老師頁面「用量與一致率」查看估算值。
3. 預設模型是 `claude-opus-5-5`；要換模型時設定 `ANTHROPIC_MODEL`。
4. 可選：`COURSE_NAME` 設定課程名稱（AI 助理與評分員會用到）。

## 5. Vercel

1. 在 Vercel 匯入 GitHub repo `KuoYuLiu/AICoding`，Framework 會自動辨識為 Next.js。
2. 在 Project Settings → Environment Variables 填入上面所有變數（Production）。
3. **不要設定** `CODE_RUNNER`、`CODE_RUNNER_ALLOW_DOCKER_IN_PRODUCTION`、`AI_PROVIDER`。前兩個只給本機與 CI，最後一個設為 `fake` 會讓 AI 只回固定文字。
4. 部署完成後，把 Vercel 給的網域（或自訂網域）填回 Google OAuth 的來源與重新導向 URI。
5. AI 評分在學生按「結束作答」後於背景執行，最長 120 秒。若方案的函式時間較短而評分逾時，成績會停在「待評分」，老師可在審核頁按「重新執行 AI 評分」。

## 6. 上線前自我檢查

用一個老師帳號與一個學生帳號（可以是自己的另一個 Gmail）走一次：

- [ ] 學生登入後看到「從 1 加到 n」，可以寫程式、執行、看到中文錯誤說明
- [ ] 貼上程式碼被擋下
- [ ] 和 AI 助理對話；要求「直接給答案」時沒有得到完整程式
- [ ] 提交測試全部通過後，AI 主動開始學習反饋
- [ ] 按「結束作答」後，老師在「審核作答」看到這份作答，約一分鐘內變成「AI 已評」
- [ ] 老師修改一個面向、確認、公佈；公佈前學生看不到成績，公佈後看得到
- [ ] 「用量與一致率」出現這份作答的 token 與估算成本

## 7. 試辦關卡（進入階段 1 的條件）

| 關卡 | 怎麼量 | 目標 |
| --- | --- | --- |
| AI 沒有洩題 | `npx tsx scripts/red-team.ts > docs/red-team.md` 跑 10 種套答案手法；試辦期間抽查對話全文，並看「回覆被改用安全回覆」次數 | 紅隊 10/10 守住；試辦對話沒有出現完整解答 |
| AI 評分與老師一致 | 「用量與一致率」頁：等級完全一致、相差一級以內、總分平均差距 | 建議：相差一級以內 ≥ 90%，總分平均差距 ≤ 10 分 |
| 成本可接受 | 「用量與一致率」頁的每份估算成本 | 依課程預算決定 |

試辦結束後發放 [回饋問卷](pilot-survey.md)。
