import { Suspense } from "react";
import { auth, signIn, signOut } from "@/auth";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">AICoding</h1>
      {/* The session is read at request time, so it streams in behind Suspense (cacheComponents). */}
      <Suspense fallback={<p className="text-zinc-500">載入中…</p>}>
        <SessionPanel />
      </Suspense>
    </main>
  );
}

async function SessionPanel() {
  const session = await auth();

  if (!session?.user) {
    return (
      <>
        <p className="text-zinc-600 dark:text-zinc-400">給程式設計初學者的 AI 輔助學習平台</p>
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button type="submit" className="rounded-lg bg-zinc-900 px-5 py-2.5 text-white dark:bg-white dark:text-zinc-900">
            使用 Google 帳號登入
          </button>
        </form>
      </>
    );
  }

  const isTeacher = session.user.role === "TEACHER";

  return (
    <>
      <h2 className="text-xl font-medium">{isTeacher ? "教師首頁" : "學生首頁"}</h2>
      <p className="text-zinc-600 dark:text-zinc-400">
        {session.user.name ?? session.user.email}，你好。{isTeacher ? "這裡之後會列出待審核的作答。" : "這裡之後會列出你的作業。"}
      </p>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit" className="rounded-lg border border-zinc-300 px-4 py-2 dark:border-zinc-700">
          登出
        </button>
      </form>
    </>
  );
}
