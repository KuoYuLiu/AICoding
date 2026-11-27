import type { ErrorExplanation } from "./types";

const EXCEPTIONS: Record<string, Omit<ErrorExplanation, "line">> = {
  SyntaxError: { title: "語法錯誤", detail: "Python 看不懂這一行的寫法。檢查括號、引號是否成對，冒號有沒有漏掉。" },
  IndentationError: { title: "縮排錯誤", detail: "這一行的縮排（行首空白）不對。同一個區塊裡的每一行要對齊，if、for 後面的內容要往內縮。" },
  TabError: { title: "縮排混用", detail: "縮排同時用了 Tab 和空白。請統一只用空白。" },
  NameError: { title: "找不到名稱", detail: "用到了一個還沒定義的變數或函式。檢查拼字、大小寫，以及是不是在定義之前就使用了。" },
  TypeError: { title: "型別錯誤", detail: "對不適合的資料型別做了運算，例如把字串和數字相加。想想看每個變數現在是什麼型別。" },
  ValueError: { title: "數值錯誤", detail: "資料的型別對了，但內容不能轉換或使用，例如用 int() 轉換不是數字的文字。" },
  ZeroDivisionError: { title: "除以零", detail: "程式做了除以 0 的運算。想想看什麼情況下除數會變成 0。" },
  IndexError: { title: "索引超出範圍", detail: "用了不存在的位置去取串列或字串的元素。記得索引從 0 開始，最後一個是長度減 1。" },
  KeyError: { title: "找不到鍵", detail: "字典裡沒有這個鍵。先確認鍵是否存在，再去取值。" },
  AttributeError: { title: "沒有這個屬性或方法", detail: "這種資料沒有你呼叫的方法或屬性。檢查拼字，以及變數現在的型別。" },
  EOFError: { title: "讀不到更多輸入", detail: "程式呼叫 input() 的次數比輸入的行數還多。對照題目的輸入格式，看看要讀幾行。" },
  RecursionError: { title: "遞迴太深", detail: "函式一直呼叫自己停不下來。檢查遞迴有沒有正確的結束條件。" },
  ModuleNotFoundError: { title: "找不到模組", detail: "import 的模組不存在或無法使用。這個環境只提供 Python 標準函式庫。" },
  OverflowError: { title: "數值太大", detail: "計算結果超出了可以表示的範圍。" },
};

const FALLBACK: Omit<ErrorExplanation, "line"> = {
  title: "執行時發生錯誤",
  detail: "程式在執行途中停止了。看看下方的原始錯誤訊息最後一行，它通常會說明原因。",
};

/** Line numbers in our own file only (tracebacks also mention library files). */
function lastLineInFile(stderr: string, fileName: string): number | null {
  const pattern = new RegExp(`File "(?:[^"]*/)?${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}", line (\\d+)`, "g");
  let line: number | null = null;
  for (const match of stderr.matchAll(pattern)) line = Number(match[1]);
  return line;
}

export function explainPythonError(stderr: string, fileName: string): ErrorExplanation {
  const lastLine = stderr.trim().split("\n").at(-1) ?? "";
  const name = /^(\w+(?:Error|Exception))\b/.exec(lastLine)?.[1] ?? "";
  const known = EXCEPTIONS[name] ?? FALLBACK;
  return { ...known, line: lastLineInFile(stderr, fileName) };
}
