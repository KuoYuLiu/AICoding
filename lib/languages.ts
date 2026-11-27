import python from "@/config/languages/python.json";

export interface LanguageConfig {
  id: string;
  name: string;
  editorMode: string;
  fileName: string;
  judge0LanguageId: number;
  limits: { timeSec: number; memoryMb: number };
  aiHints: string;
}

const languages: Record<string, LanguageConfig> = {
  [python.id]: python,
};

export function getLanguage(id: string): LanguageConfig {
  const language = languages[id];
  if (!language) {
    throw new Error(`Unknown language: ${id}`);
  }
  return language;
}

export function listLanguages(): LanguageConfig[] {
  return Object.values(languages);
}
