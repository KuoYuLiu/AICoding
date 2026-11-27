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
