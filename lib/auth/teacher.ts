import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";

/** For teacher pages: signed-out visitors go to sign-in, students go home. */
export async function requireTeacher() {
  // Auth.js generates random tokens; mark the subtree as request-time first.
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  if (session.user.role !== "TEACHER") redirect("/");
  return session.user;
}
