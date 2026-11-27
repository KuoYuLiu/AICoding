import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

/** Plain SQL: Playwright loads tests as CommonJS, which the generated Prisma client (ESM) does not support. */
export async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Deletes the e2e student's attempts (and with them edit history and runs), so a spec starts from a blank editor. */
export async function resetStudentAttempts(userId: string) {
  await withDb((db) => db.query(`DELETE FROM "Attempt" WHERE "userId" = $1`, [userId]));
}
