import { db } from './db';
import type { Activity, Book, ReadingLog, Reaction } from './types';

export async function findBookByIsbn(isbn: string): Promise<Book | undefined> {
  return db.books.where('isbn').equals(isbn).first();
}

export async function saveBook(book: Book): Promise<number> {
  const now = Date.now();
  if (book.id) {
    await db.books.put({ ...book, updatedAt: now });
    return book.id;
  }
  return (await db.books.add({ ...book, createdAt: now, updatedAt: now })) as number;
}

export interface LogInput {
  date: string;
  childIds: number[];
  bookId: number;
  activity: Activity;
  minutes?: number;
  count: number;
  reaction?: Reaction;
  memo?: string;
}

/** 아이마다 한 건씩 기록합니다. */
export async function addLogs(input: LogInput): Promise<void> {
  const now = Date.now();
  const rows: ReadingLog[] = input.childIds.map((childId) => ({
    date: input.date,
    childId,
    bookId: input.bookId,
    activity: input.activity,
    minutes: input.minutes,
    count: input.count,
    reaction: input.reaction,
    memo: input.memo?.trim() || undefined,
    createdAt: now,
  }));
  await db.transaction('rw', db.logs, db.books, async () => {
    await db.logs.bulkAdd(rows);
    // 최근 읽은 책 정렬을 위해 책의 updatedAt을 갱신합니다.
    await db.books.update(input.bookId, { updatedAt: now });
  });
}

/** 이 책의 마지막 기록 (기록 화면 기본값용) */
export async function lastLogForBook(bookId: number): Promise<ReadingLog | undefined> {
  const logs = await db.logs.where('bookId').equals(bookId).sortBy('createdAt');
  return logs[logs.length - 1];
}

export async function deleteBook(bookId: number): Promise<void> {
  await db.transaction('rw', db.logs, db.books, async () => {
    await db.logs.where('bookId').equals(bookId).delete();
    await db.books.delete(bookId);
  });
}

export async function deleteChild(childId: number): Promise<void> {
  await db.transaction('rw', db.logs, db.children, async () => {
    await db.logs.where('childId').equals(childId).delete();
    await db.children.delete(childId);
  });
}
