import { db, setSetting, SETTING } from './db';
import type { Book, Child, ReadingLog } from './types';

export interface BackupFile {
  app: 'reading-log';
  version: 1;
  exportedAt: string;
  children: Child[];
  books: Book[];
  logs: ReadingLog[];
}

export async function buildBackup(): Promise<BackupFile> {
  const [children, books, logs] = await Promise.all([
    db.children.toArray(),
    db.books.toArray(),
    db.logs.toArray(),
  ]);
  return { app: 'reading-log', version: 1, exportedAt: new Date().toISOString(), children, books, logs };
}

export function parseBackup(text: string): BackupFile {
  let data: Partial<BackupFile>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 파일이 아닙니다.');
  }
  if (data.app !== 'reading-log' || data.version !== 1) {
    throw new Error('이 앱의 백업 파일이 아닙니다.');
  }
  if (!Array.isArray(data.children) || !Array.isArray(data.books) || !Array.isArray(data.logs)) {
    throw new Error('백업 파일 내용이 올바르지 않습니다.');
  }
  return data as BackupFile;
}

/** 현재 데이터를 모두 지우고 백업 내용으로 바꿉니다. id를 그대로 유지합니다. */
export async function restoreBackup(data: BackupFile): Promise<void> {
  await db.transaction('rw', db.children, db.books, db.logs, async () => {
    await Promise.all([db.children.clear(), db.books.clear(), db.logs.clear()]);
    await db.children.bulkAdd(data.children);
    await db.books.bulkAdd(data.books);
    await db.logs.bulkAdd(data.logs);
  });
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `reading-log-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** 공유 시트(카톡·드라이브 등)로 보내고, 지원하지 않으면 파일로 내려받습니다. */
export async function exportBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const data = await buildBackup();
  const name = backupFileName();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });

  let result: 'shared' | 'downloaded' | 'cancelled';
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '독서기록 백업' });
      result = 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      downloadBlob(blob, name);
      result = 'downloaded';
    }
  } else {
    downloadBlob(blob, name);
    result = 'downloaded';
  }
  await setSetting(SETTING.lastBackupAt, Date.now());
  return result;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
