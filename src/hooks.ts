import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/db';
import type { Book, Child } from './lib/types';

export function useKids(): Child[] | undefined {
  return useLiveQuery(() => db.children.orderBy('id').toArray(), []);
}

export function useKidMap(): Map<number, Child> {
  const kids = useKids() ?? [];
  return new Map(kids.map((k) => [k.id!, k]));
}

export function useBookMap(bookIds: number[]): Map<number, Book> {
  const key = [...new Set(bookIds)].sort().join(',');
  const books = useLiveQuery(
    () => (key ? db.books.bulkGet(key.split(',').map(Number)) : Promise.resolve([] as (Book | undefined)[])),
    [key],
  );
  return new Map((books ?? []).filter((b): b is Book => !!b).map((b) => [b.id!, b]));
}
