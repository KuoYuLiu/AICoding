# CLAUDE.md

本檔給 Claude Code 閱讀：說明這個專案是什麼、怎麼做、要遵守哪些規則。完整規劃見 `docs/plan.md`。

## 專案目標

AICoding 是給程式設計初學者的 AI 輔助學習平台。老師建立課程、匯入修課名單與題目；學生在網頁上解題，由 AI 助理以蘇格拉底式提問一步步引導，不直接給答案；作答結束後，AI 評分員依尺規評量學生的「思考過程」，老師確認後才公佈成績。

評分與引導共用五個面向（CER + 2）：

1. 題目理解（Claim）
2. 找尋解答語法（Evidence）
3. 組合解題邏輯（Reasoning）
4. 語法理解
5. 學習反饋

## 目前階段

**階段 0：單題驗證原型。** 只做一題 Python 題目的完整流程：解題畫面 → AI 助理引導 → 執行與測資判定 → 學習反饋 → AI 評分 → 教師審核。試用場域是一門大學一年級程式設計課（5 至 10 位學生）。

不在階段 0 範圍：多課程、名單匯入、DOMjudge 匯入、講義檢索、作業期限、資料匯出、多校管理。遇到這些需求先記在 `docs/plan.md`，不要提前實作。

## 技術選型

| 元件 | 選擇 |
| --- | --- |
| 語言 | TypeScript（前後端同一個 Next.js 專案） |
| 前端 | Next.js App Router、React、Monaco Editor |
| 登入 | Google OAuth（Auth.js） |
| 資料庫 | PostgreSQL（託管），ORM 用 Prisma；之後加 pgvector |
| 程式執行 | Judge0（階段 0 用託管 API）；本機開發可用 Docker 執行器（`CODE_RUNNER=docker`）。一律經過 `lib/runner` 執行介面 |
| AI | Claude API（Anthropic TypeScript SDK），一律經過 `lib/ai` 服務層 |
| 測試 | Vitest（單元）、Playwright（端對端） |
| CI | GitHub Actions：lint、型別檢查、測試 |

## 架構規則

- **學生程式碼永遠不在本專案的伺服器上執行。** 只能透過 `lib/runner` 送到 Judge0。`DockerRunner` 只供開發者在自己電腦上與 CI 測試，`NODE_ENV=production` 時拒絕啟用（唯一例外是 CI 端對端測試明確設定 `CODE_RUNNER_ALLOW_DOCKER_IN_PRODUCTION=true`，正式部署不得設定）。之後換成自架沙箱時，只改 `lib/runner`。
- **語言由設定檔決定，不寫死。** 每種語言一份設定（Judge0 語言 id、開發用 Docker 映像與執行指令、檔名、時間與記憶體限制、給 AI 的常見錯誤提示），放在 `config/languages/`。
- **題目放在 `problems/<slug>/`**（類 DOMjudge 結構：`problem.json`、`statement.md`、`data/sample`、`data/secret`、`submissions/accepted`）。`npm run seed` 先用參考解答跑過所有測資，全部通過才寫入資料庫。給前端的題目一律經過 `lib/problems/public.ts`，不含參考解答與隱藏測資。
- **AI 助理與 AI 評分員是兩個獨立角色。** 助理只引導、不評分；評分員只讀完整作答紀錄、不和學生對話。兩者的 prompt 分別在 `prompts/assistant.md` 與 `prompts/grader.md`。
- **平台安全規則不可被老師的自訂 prompt 覆蓋。** 組 prompt 時，安全規則永遠放在最後並優先。
- **送給 AI 的內容不得包含隱藏測資、參考解答或學生個資（姓名、學號、Email）。**
- **AI 助理的回覆送出前要檢查**：程式碼區塊超過設定行數（預設 3 行）或與參考解答高度相似時，要求模型重寫。
- **成績狀態**：待評分 → AI 已評 → 教師已確認 → 已公佈。只有「已公佈」的結果學生看得到。分數的每次修改都寫入只新增的稽核紀錄。
- **編輯器禁止貼上**（paste、drop、右鍵貼上），並記錄編輯歷程，偵測「瞬間出現大段程式碼」並標記給老師。
- 截止時仍未通過測資：自動以「未完成」送交評分，「學習反饋」面向記 1。重做預設不開放。

## 寫法規範

- 介面文字、AI 回覆、錯誤訊息給使用者看的部分用繁體中文；程式碼、識別字、commit 訊息用英文。
- TypeScript `strict` 開啟，不使用 `any`。
- 每個功能都附測試；改完執行 `npm run lint && npm run typecheck && npm test` 確認通過再提交。介面流程另附 Playwright 測試（`e2e/`）：需要 `DATABASE_URL` 與 `AUTH_SECRET`，先 `npm run seed` 與 `npm run build`，再 `npm run test:e2e`；執行與提交的測試另需 `CODE_RUNNER=docker`、`CODE_RUNNER_ALLOW_DOCKER_IN_PRODUCTION=true`。端對端測試一律用 `AI_PROVIDER=fake`（固定回覆，不呼叫 Claude API）。改了 AI 助理的 prompt 或檢查時，用 `npx tsx scripts/red-team.ts > docs/red-team.md` 以真的 API 重跑紅隊測試。
- **隱藏測資只回傳判定結果**：提交測試的回應只有每筆的判定（通過、答案錯誤…），不含輸入、輸出或錯誤訊息；完整結果存在 `RunRecord.resultJson` 供老師查看。錯誤說明放在 `lib/runner/explain/`，依語言提供初學者看得懂的中文說明，不給修正方式。
- 介面設計：淺色與深色模式都要支援、桌面三欄與窄螢幕分頁都要能用；鍵盤可操作、有可見的焦點樣式。Monaco 自架在 `public/monaco`（安裝時由 `scripts/copy-monaco.mjs` 複製），不從 CDN 載入。
- 一次只做一個小功能，一個 PR 對應一個 issue。
- 機密（API key、OAuth secret、資料庫連線字串）只放在環境變數，`.env.example` 列出名稱但不放值。

## 相關文件

- `docs/plan.md`：平台規劃（功能規格、架構、商品化評估、階段路線）
- `prompts/assistant.md`：預設 AI 助理 prompt
- `prompts/grader.md`：預設評量尺規與 AI 評分員 prompt
