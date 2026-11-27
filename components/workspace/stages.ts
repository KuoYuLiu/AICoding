/** The five guidance stages shared by the AI assistant and the rubric. */
export const STAGES = [
  { id: 1, name: "題目理解", hint: "用自己的話說出輸入、輸出與要求" },
  { id: 2, name: "找尋語法", hint: "找出需要用到的語法並說明理由" },
  { id: 3, name: "組合邏輯", hint: "先列步驟，再寫成程式" },
  { id: 4, name: "語法理解", hint: "解釋自己程式中的關鍵語法" },
  { id: 5, name: "學習反饋", hint: "測資全部通過後回顧整個過程" },
] as const;
