import { Migrator, FileMigrationProvider } from 'kysely';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function migrateToLatest() {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });

  console.log('Running database migrations...');
  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`Migration "${it.migrationName}" executed successfully.`);
    } else if (it.status === 'Error') {
      console.error(`Failed to execute migration "${it.migrationName}".`);
    }
  });

  if (error) {
    console.error('Failed to migrate:', error);
    process.exit(1);
  }

  await pool.end();
  console.log('Migrations complete.');
}

// Run if called directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrateToLatest();
}
