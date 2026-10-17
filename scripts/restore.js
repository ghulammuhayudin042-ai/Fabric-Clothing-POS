// Usage (stop the server first): node scripts/restore.js data/backup-123.db
import fs from 'node:fs'; const f = process.argv[2];
if (!f || !fs.existsSync(f)) { console.error('Give a backup file, e.g. node scripts/restore.js data/backup-123.db'); process.exit(1); }
fs.copyFileSync(f, 'data/pos.db'); console.log('Restored. Start the server again.');
