import 'dotenv/config';
import { closeDatabase, getDbPool } from '../config/database.js';
import { CLIENT_PACKAGE_DEFINITIONS, createSqlCatalogWriter } from './sync-client-catalog.js';

try {
  const pool = await getDbPool();
  const writer = createSqlCatalogWriter(pool);
  const packages = CLIENT_PACKAGE_DEFINITIONS.filter(item => item.eventType === 'Wedding');
  for (const item of packages) await writer.upsertPackage(item);
  console.log(`Synced ${packages.length} Wedding packages.`);
} finally {
  await closeDatabase();
}
