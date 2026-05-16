import mysql from "mysql2/promise";

const database = process.env.DB_NAME ?? "";

if (
  !/(^|[_-])test($|[_-])/.test(database) ||
  !/^[A-Za-z0-9_]+$/.test(database)
) {
  console.error(
    `Refusing to reset non-test MySQL DB_NAME=${database || "<unset>"}`,
  );
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "utopiaintel",
    password: process.env.DB_PASSWORD ?? "",
  });

  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await conn.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Failed to reset MySQL test database ${database}: ${message}`);
  process.exit(1);
});
