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
  it('앞 출처가 실패하면 다음 출처로 넘어갑니다', async () => {
    const r = await lookupIsbn(ISBN, { fetcher: fakeFetch({ openlibrary: openLibrary }) });
    expect(r?.source).toBe('Open Library');
  });
  it('모두 실패하면 null', async () => {
    expect(await lookupIsbn(ISBN, { fetcher: fakeFetch({}) })).toBeNull();
  });
});

import { checkKakaoKey, checkNlKey, mergeKorean, parseKakao, parseNl } from '../src/lib/lookup';

const KO = '9788937460449';
const nl = {
  TOTAL_COUNT: '1',
  docs: [{ TITLE: '데미안 ', AUTHOR: '헤르만 헤세 지음 ;   전영애 옮김', PUBLISHER: '민음사', EA_ADD_CODE: '03850', TITLE_URL: '' }],
};
const kakao = {
  documents: [{ title: '데미안', authors: ['헤르만 헤세'], publisher: '민음사', thumbnail: 'https://search1.kakaocdn.net/thumb/x.jpg' }],
};

describe('한글책 조회', () => {
  it('카카오·국립중앙도서관 응답을 읽고 합칩니다', () => {
    expect(parseNl(nl)).toMatchObject({ title: '데미안', author: '헤르만 헤세 지음 ; 전영애 옮김', addCode: '03850' });
    expect(mergeKorean(KO, parseKakao(kakao), parseNl(nl))).toEqual({
      isbn: KO,
      title: '데미안',
      author: '헤르만 헤세',
      publisher: '민음사',
      coverUrl: 'https://search1.kakaocdn.net/thumb/x.jpg',
      addCode: '03850',
      source: '카카오·국립중앙도서관',
    });
    expect(mergeKorean(KO, null, null)).toBeNull();
  });

  it('키가 있으면 한글 출처를 먼저 쓰고, 카카오 키 헤더를 보냅니다', async () => {
    let auth = '';
    const fetcher = (async (url: string, init?: RequestInit) => {
      if (String(url).includes('dapi.kakao.com')) {
        auth = (init?.headers as Record<string, string>).Authorization;
        return new Response(JSON.stringify(kakao));
      }
      if (String(url).includes('nl.go.kr')) return new Response(JSON.stringify(nl));
      return new Response(JSON.stringify(google));
    }) as typeof fetch;
    const r = await lookupIsbn(KO, { kakaoKey: ' abc ', nlKey: 'k', fetcher });
    expect(r).toMatchObject({ title: '데미안', addCode: '03850', source: '카카오·국립중앙도서관' });
    expect(auth).toBe('KakaoAK abc');
  });

  it('한글 출처가 실패하면 Google Books로 넘어갑니다', async () => {
    const fetcher = (async (url: string) =>
      String(url).includes('googleapis')
        ? new Response(JSON.stringify(google))
        : new Response('{}', { status: 401 })) as typeof fetch;
    expect((await lookupIsbn(KO, { kakaoKey: 'bad', fetcher }))?.source).toBe('Google Books');
  });

  it('키 확인 결과를 알려줍니다', async () => {
    const ok = (async () => new Response(JSON.stringify(kakao))) as unknown as typeof fetch;
    const bad = (async () => new Response('{"errorType":"AccessDeniedError"}', { status: 401 })) as unknown as typeof fetch;
    const nlBad = (async () => new Response('{"RESULT":"ERROR","ERR_MESSAGE":"유효하지 않은 인증키 값입니다."}')) as unknown as typeof fetch;
    expect(await checkKakaoKey('k', ok)).toContain('✅');
    expect(await checkKakaoKey('k', bad)).toContain('키가 올바르지 않습니다');
    expect(await checkNlKey('k', nlBad)).toContain('유효하지 않은 인증키');
  });
});
