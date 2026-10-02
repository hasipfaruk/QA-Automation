import fs from 'node:fs';
import path from 'node:path';

/** Delete a user with all scans, reports, baselines, tokens and sessions. */
export function deleteUserAndData({ db, config }, userId) {
  const scanIds = db.prepare('SELECT id FROM scans WHERE user_id = ?').all(userId).map((r) => r.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId); // cascades to sessions, tokens and scans
  for (const id of scanIds) fs.rmSync(path.join(config.reportsDir, id), { recursive: true, force: true });
  fs.rmSync(path.join(config.baselinesDir, String(userId)), { recursive: true, force: true });
}
