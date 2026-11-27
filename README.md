# AICoding

給程式設計初學者的 AI 輔助學習平台。AI 助理以蘇格拉底式提問引導學生解題、不直接給答案；AI 評分員依「題目理解、找尋語法、組合邏輯、語法理解、學習反饋」五個面向評量學生的思考過程，老師確認後才公佈。

目前狀態：專案骨架完成，準備開始階段 0（單題驗證原型）。

- 規劃摘要：[docs/plan.md](docs/plan.md)
- 預設 AI 助理 prompt：[prompts/assistant.md](prompts/assistant.md)
- 預設評量尺規與評分員 prompt：[prompts/grader.md](prompts/grader.md)
- 給 Claude Code 的專案說明：[CLAUDE.md](CLAUDE.md)

## 開發

```bash
npm install                  # 會自動執行 prisma generate
cp .env.example .env.local   # 填入 Judge0、Claude API、Google OAuth、資料庫設定
npm run db:deploy            # 套用資料庫 migration
npm run dev                  # http://localhost:3000
```

## 檢查

```bash
npm run lint && npm run typecheck && npm test
```

## 目錄

- `app/`：Next.js 頁面
- `lib/runner/`：程式執行介面（Judge0），學生程式碼只透過這裡執行
- `lib/ai/`：AI 服務層與防止給答案的檢查
- `config/languages/`：語言設定檔，新增語言只需新增一份
- `auth.ts`、`lib/auth/`：Google 登入與角色（`TEACHER_EMAILS` 列出的 Email 為教師）
- `prisma/`：資料庫結構與 migration；修改結構時執行 `npm run db:migrate`
