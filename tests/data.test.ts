import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { addLogs, deleteBook, findBookByIsbn, lastLogForBook, saveBook } from '../src/lib/repo';
import { buildBackup, parseBackup, restoreBackup } from '../src/lib/backup';

beforeEach(async () => {
  await Promise.all([db.children.clear(), db.books.clear(), db.logs.clear(), db.settings.clear()]);
});

async function seed() {
  const a = (await db.children.add({ name: '첫째', color: '#e07a5f', createdAt: 1 })) as number;
  const b = (await db.children.add({ name: '둘째', color: '#3d85c6', createdAt: 2 })) as number;
  const bookId = await saveBook({
    isbn: '9780140328721',
    title: 'Fantastic Mr Fox',
    lang: 'en',
    levels: [{ system: 'AR', value: '4.1' }],
    createdAt: 0,
    updatedAt: 0,
  });
  return { a, b, bookId };
}

describe('기록', () => {
  it('여러 아이를 고르면 아이마다 한 건씩 저장합니다', async () => {
    const { a, b, bookId } = await seed();
    await addLogs({ date: '2026-11-24', childIds: [a, b], bookId, activity: 'intensive', minutes: 20, count: 1 });
    const logs = await db.logs.toArray();
    expect(logs.map((l) => l.childId).sort()).toEqual([a, b].sort());
    expect(logs.every((l) => l.minutes === 20 && l.activity === 'intensive')).toBe(true);
    expect((await lastLogForBook(bookId))?.activity).toBe('intensive');
    expect((await findBookByIsbn('9780140328721'))?.id).toBe(bookId);
  });

  it('책을 지우면 그 책의 기록도 지웁니다', async () => {
    const { a, bookId } = await seed();
    await addLogs({ date: '2026-11-24', childIds: [a], bookId, activity: 'silent', count: 2 });
    await deleteBook(bookId);
    expect(await db.logs.count()).toBe(0);
  });
});

describe('백업', () => {
  it('내보낸 백업으로 그대로 복원됩니다', async () => {
    const { a, bookId } = await seed();
    await addLogs({ date: '2026-11-23', childIds: [a], bookId, activity: 'readTo', count: 1, reaction: 'love', memo: '깔깔' });
    const json = JSON.stringify(await buildBackup());

    await Promise.all([db.children.clear(), db.books.clear(), db.logs.clear()]);
    await db.children.add({ name: '임시', color: '#000', createdAt: 9 });

    await restoreBackup(parseBackup(json));
    expect((await db.children.toArray()).map((c) => c.name)).toEqual(['첫째', '둘째']);
    const log = (await db.logs.toArray())[0];
    expect(log).toMatchObject({ childId: a, bookId, reaction: 'love', memo: '깔깔' });
  });

  it('다른 파일은 거부합니다', () => {
    expect(() => parseBackup('hello')).toThrow('JSON');
    expect(() => parseBackup('{"app":"x"}')).toThrow('백업 파일이 아닙니다');
  });
});
