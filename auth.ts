import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/lib/db";
import { parseTeacherEmails, resolveRole } from "@/lib/auth/roles";
import type { Role } from "@/lib/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: Role;
    };
  }
}

// AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are read from the environment by Auth.js.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile }) {
      // Only accept Google accounts whose email Google has verified.
      return Boolean(profile?.email && profile.email_verified);
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        const email = profile.email.toLowerCase();
        const role = resolveRole(email, parseTeacherEmails(process.env.TEACHER_EMAILS));
        const user = await getDb().user.upsert({
          where: { email },
          create: { email, name: profile.name ?? null, image: typeof profile.picture === "string" ? profile.picture : null, role },
          update: { name: profile.name ?? null, role },
        });
        token.userId = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.userId === "string") session.user.id = token.userId;
      if (token.role === "TEACHER" || token.role === "STUDENT") session.user.role = token.role;
      return session;
    },
  },
});
