import Link from "next/link";

export default function ProblemNotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <p className="text-sm font-medium text-indigo-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold">找不到這個題目</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">題目可能已被移除，或網址有誤。</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          回到我的作業
        </Link>
      </div>
    </main>
  );
}
