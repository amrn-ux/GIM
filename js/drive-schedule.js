const DAY = 86400000;
const IST = 330 * 60000;

export function latestBackupDeadline(now = Date.now()) {
  const date = new Date(now + IST);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23) - IST;
  return now >= today ? today : today - DAY;
}

export function backupDue(lastUpload, now = Date.now()) {
  return Number(lastUpload || 0) < latestBackupDeadline(now);
}

export function nextBackupDeadline(now = Date.now()) {
  return latestBackupDeadline(now) + DAY;
}
