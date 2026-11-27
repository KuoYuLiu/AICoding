export interface ErrorExplanation {
  /** Short beginner-friendly title, e.g. 「縮排錯誤」. */
  title: string;
  /** One or two sentences on what usually causes it. Never a fix. */
  detail: string;
  /** Line in the student's file the error points to, when known. */
  line: number | null;
}
