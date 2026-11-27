import type { Role } from "@/lib/generated/prisma/enums";

/** Parses TEACHER_EMAILS ("a@x.com, b@y.com") into a lowercase set. */
export function parseTeacherEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email !== ""),
  );
}

/** Stage 0: teachers are listed in TEACHER_EMAILS; everyone else who signs in is a student. */
export function resolveRole(email: string, teacherEmails: Set<string>): Role {
  return teacherEmails.has(email.trim().toLowerCase()) ? "TEACHER" : "STUDENT";
}
