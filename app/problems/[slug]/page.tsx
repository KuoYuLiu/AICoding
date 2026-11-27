import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { listChat } from "@/lib/ai/assistant";
import { Brand } from "@/components/brand";
import { UserMenu } from "@/components/user-menu";
import { Workspace } from "@/components/workspace/workspace";
import { WorkspaceSkeleton } from "@/components/workspace/workspace-skeleton";
import { getOrCreateAttempt } from "@/lib/attempts/repository";
import { getPublishedGrade } from "@/lib/grading/student";
import { latestRunViews } from "@/lib/attempts/run";
import { getLanguage } from "@/lib/languages";
import { findProblemId, getPublicProblem } from "@/lib/problems/repository";

export default function ProblemPage({ params }: PageProps<"/problems/[slug]">) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <ProblemWorkspace params={params} />
    </Suspense>
  );
}

async function ProblemWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  // Auth.js generates random tokens; mark this subtree as request-time before calling it.
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const { slug } = await params;
  const [problem, problemId] = await Promise.all([getPublicProblem(slug), findProblemId(slug)]);
  if (!problem || !problemId) notFound();

  const attempt = await getOrCreateAttempt(session.user.id, problemId);
  const language = getLanguage(problem.languageId);
  const [initialResults, initialChat, grade] = await Promise.all([
    latestRunViews(attempt.id, language.id),
    listChat(attempt.id),
    attempt.status === "IN_PROGRESS" ? null : getPublishedGrade(attempt.id),
  ]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950">
        <nav aria-label="導覽路徑" className="flex min-w-0 items-center gap-2 text-sm">
          <Brand compact />
          <Link href="/" className="hidden shrink-0 text-zinc-500 hover:text-zinc-900 sm:inline dark:hover:text-zinc-100">
            我的作業
          </Link>
          <span aria-hidden className="hidden text-zinc-300 sm:inline dark:text-zinc-700">
            /
          </span>
          <span aria-current="page" className="truncate font-medium">
            {problem.title}
          </span>
        </nav>
        <UserMenu name={session.user.name ?? session.user.email} role={session.user.role} />
      </header>
      <Workspace
        problem={problem}
        attempt={attempt}
        language={{ name: language.name, editorMode: language.editorMode, fileName: language.fileName, limits: language.limits }}
        initialResults={initialResults}
        initialChat={initialChat}
        grade={grade}
      />
    </div>
  );
}
