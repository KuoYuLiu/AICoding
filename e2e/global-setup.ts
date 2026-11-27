import { withDb } from "./db";
import { E2E_STUDENT, E2E_TEACHER } from "./users";

/** A known student with no attempts, so every run starts from a blank editor, and a known teacher. */
export default async function globalSetup() {
  await withDb(async (db) => {
    await db.query(
      `INSERT INTO "User" (id, email, name, role, "updatedAt") VALUES ($1, $2, $3, 'STUDENT', now())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = 'STUDENT'`,
      [E2E_STUDENT.id, E2E_STUDENT.email, E2E_STUDENT.name],
    );
    await db.query(
      `INSERT INTO "User" (id, email, name, role, "updatedAt") VALUES ($1, $2, $3, 'TEACHER', now())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = 'TEACHER'`,
      [E2E_TEACHER.id, E2E_TEACHER.email, E2E_TEACHER.name],
    );
    await db.query(`DELETE FROM "Attempt" WHERE "userId" = $1`, [E2E_STUDENT.id]);
    const { rowCount } = await db.query(`SELECT 1 FROM "Problem" WHERE slug = 'sum-to-n'`);
    if (!rowCount) throw new Error("Problem sum-to-n is missing: run `npm run seed` first");
  });
}
