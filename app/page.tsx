import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth, signIn } from "@/auth";
import { Brand } from "@/components/brand";
import { StatusBadge } from "@/components/ui/status-badge";
import { UserMenu } from "@/components/user-menu";
import { listProblemsForUser } from "@/lib/attempts/repository";
import { getLanguage } from "@/lib/languages";

export default function Home() {
  // The session is read at request time, so it streams in behind Suspense (cacheComponents).
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  // Auth.js generates random tokens; mark this subtree as request-time before calling it.
  await connection();
  const session = await auth();
  if (!session?.user?.id) return <SignedOut />;

  const isTeacher = session.user.role === "TEACHER";
  const problems = await listProblemsForUser(session.user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <UserMenu name={session.user.name ?? session.user.email} role={session.user.role} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{isTeacher ? "題目總覽" : "我的作業"}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {isTeacher
              ? "你可以用學生視角預覽題目。作答審核功能會在後續版本加入。"
              : "選一個題目開始。AI 助理會用提問引導你一步步想出解法。"}
          </p>
        </div>

        {problems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="font-medium">目前沒有題目</p>
            <p className="mt-1 text-sm text-zinc-500">
              {isTeacher ? "在專案目錄執行 npm run seed 建立題目。" : "老師還沒有指派作業，請稍後再來看看。"}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {problems.map((problem) => (
              <li key={problem.slug}>
                <Link
                  href={`/problems/${problem.slug}`}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500/50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-medium">{problem.title}</h2>
                      <StatusBadge status={problem.attemptStatus} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">{getLanguage(problem.languageId).name}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition group-hover:bg-indigo-500">
                    {problem.attemptStatus === null ? "開始作答" : problem.attemptStatus === "IN_PROGRESS" ? "繼續作答" : "查看"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function SignedOut() {
  const features = [
    { title: "提問式引導", body: "AI 助理不直接給答案，而是用問題帶你理解題目、找語法、組合邏輯。" },
    { title: "即時執行與測試", body: "在瀏覽器裡寫 Python，馬上執行並用測資檢查結果。" },
    { title: "看見思考過程", body: "老師依五個面向評量你的解題過程，而不只是答案對錯。" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-14 w-full max-w-5xl items-center px-4 sm:px-6">
        <Brand />
      </header>
      <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            自己想出來的程式，
            <br />
            才是真的學會。
          </h1>
          <p className="mt-4 max-w-lg text-zinc-600 dark:text-zinc-400">給程式設計初學者的 AI 輔助學習平台。</p>
          <ul className="mt-8 grid gap-4">
            {features.map((feature) => (
              <li key={feature.title} className="flex gap-3">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-indigo-500" />
                <div>
                  <p className="font-medium">{feature.title}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{feature.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">登入</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">請使用學校登記的 Google 帳號。</p>
          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signIn("google");
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <GoogleIcon />
              使用 Google 帳號登入
            </button>
          </form>
          <p className="mt-6 text-xs leading-relaxed text-zinc-500">登入即表示你同意平台記錄作答過程（程式碼編輯與 AI 對話），供老師評量學習使用。</p>
        </section>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-4">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse px-4 py-24 sm:px-6" aria-busy="true" aria-label="載入中">
      <div className="h-7 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-6 grid gap-3">
        <div className="h-20 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-20 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
