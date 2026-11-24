import { describe, expect, it } from 'vitest';
import { lookupIsbn, parseGoogleBooks, parseOpenLibrary } from '../src/lib/lookup';

const ISBN = '9780140328721';

const google = {
  totalItems: 1,
  items: [
    {
      volumeInfo: {
        title: 'Fantastic Mr Fox',
        authors: ['Roald Dahl'],
        publisher: 'Puffin',
        imageLinks: { thumbnail: 'http://books.google.com/x.jpg' },
      },
    },
  ],
};

const openLibrary = {
  [`ISBN:${ISBN}`]: {
    title: 'Fantastic Mr. Fox',
    authors: [{ name: 'Roald Dahl' }],
    publishers: [{ name: 'Puffin' }],
    cover: { medium: 'https://covers.openlibrary.org/b/id/1-M.jpg' },
  },
};

function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return new Response('', { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as typeof fetch;
}

describe('파서', () => {
  it('Google Books 결과를 읽고 표지를 https로 바꿉니다', () => {
    expect(parseGoogleBooks(google, ISBN)).toMatchObject({
      title: 'Fantastic Mr Fox',
      author: 'Roald Dahl',
      coverUrl: 'https://books.google.com/x.jpg',
    });
    expect(parseGoogleBooks({ totalItems: 0 }, ISBN)).toBeNull();
  });
  it('Open Library 결과를 읽습니다', () => {
    expect(parseOpenLibrary(openLibrary, ISBN)).toMatchObject({ title: 'Fantastic Mr. Fox', publisher: 'Puffin' });
    expect(parseOpenLibrary({}, ISBN)).toBeNull();
  });
});

describe('lookupIsbn', () => {
  it('조회 서버 결과를 먼저 씁니다', async () => {
    const r = await lookupIsbn(ISBN, {
      workerUrl: 'https://w.example/',
      fetcher: fakeFetch({
        'w.example/isbn/': { title: '멋진 여우 씨', addCode: '77840', source: '카카오·국립중앙도서관' },
        googleapis: google,
      }),
    });
    expect(r).toMatchObject({ title: '멋진 여우 씨', addCode: '77840', source: '카카오·국립중앙도서관' });
  });
  it('앞 출처가 실패하면 다음 출처로 넘어갑니다', async () => {
    const r = await lookupIsbn(ISBN, {
      workerUrl: 'https://w.example',
      fetcher: fakeFetch({ openlibrary: openLibrary }),
    });
    expect(r?.source).toBe('Open Library');
  });
  it('모두 실패하면 null', async () => {
    expect(await lookupIsbn(ISBN, { fetcher: fakeFetch({}) })).toBeNull();
  });
});
