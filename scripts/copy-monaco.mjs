// Self-host Monaco instead of loading it from a CDN: copies its AMD build into public/monaco/vs.
import { cpSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const source = path.join(path.dirname(require.resolve("monaco-editor/package.json")), "min", "vs");
const target = path.join(process.cwd(), "public", "monaco", "vs");

if (!existsSync(source)) {
  console.error(`monaco-editor build not found at ${source}`);
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Copied Monaco to ${path.relative(process.cwd(), target)}`);
