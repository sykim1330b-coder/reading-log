import Dexie, { type EntityTable } from 'dexie';
import type { Book, Child, ReadingLog } from './types';

export interface Setting {
  key: string;
  value: unknown;
}

export class ReadingDB extends Dexie {
  children!: EntityTable<Child, 'id'>;
  books!: EntityTable<Book, 'id'>;
  logs!: EntityTable<ReadingLog, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor(name = 'reading-log') {
    super(name);
    this.version(1).stores({
      children: '++id, name',
      books: '++id, isbn, title, lang, series, updatedAt',
      logs: '++id, date, childId, bookId, [childId+date], [bookId+date], createdAt',
      settings: 'key',
    });
  }
}

export const db = new ReadingDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export const SETTING = {
  lookupUrl: 'lookupUrl',
  lastBackupAt: 'lastBackupAt',
  activeChildId: 'activeChildId',
} as const;
