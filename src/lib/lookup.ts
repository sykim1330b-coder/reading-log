/**
 * ISBN으로 책 정보를 찾습니다.
 * 1) 카카오 책검색·국립중앙도서관(키를 넣은 경우, 동시에 조회해 합침) — 한글책
 * 2) Google Books → Open Library (키 없음) — 영어책
 * 모두 브라우저에서 바로 호출하며, 키는 이 기기에만 저장됩니다.
 */
export interface LookupResult {
  isbn: string;
  title: string;
  author?: string;
  publisher?: string;
  coverUrl?: string;
  addCode?: string;
  source: string;
}

export interface LookupKeys {
  kakaoKey?: string;
  nlKey?: string;
}

type Fetcher = typeof fetch;
type Partial_ = Omit<LookupResult, 'isbn' | 'source'>;

const TIMEOUT_MS = 7000;

export class LookupHttpError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`HTTP ${status}`);
  }
}

async function getJson(fetcher: Fetcher, url: string, headers?: Record<string, string>): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(url, { signal: ctrl.signal, headers });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new LookupHttpError(res.status, body);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const https = (u?: string) => (u ? u.replace(/^http:\/\//, 'https://') : undefined);
const clean = (s?: string) => s?.replace(/\s+/g, ' ').trim() || undefined;

// ---------- 카카오 책검색 ----------
interface Kakao {
  documents?: { title?: string; authors?: string[]; publisher?: string; thumbnail?: string }[];
}

export function parseKakao(json: unknown): Partial_ | null {
  const d = (json as Kakao)?.documents?.[0];
  if (!d?.title) return null;
  return {
    title: clean(d.title)!,
    author: clean(d.authors?.join(', ')),
    publisher: clean(d.publisher),
    coverUrl: https(d.thumbnail || undefined),
  };
}

export const kakaoUrl = (isbn: string) => `https://dapi.kakao.com/v3/search/book?target=isbn&query=${isbn}`;
export const kakaoHeaders = (key: string) => ({ Authorization: `KakaoAK ${key.trim()}` });

// ---------- 국립중앙도서관 ISBN 서지정보 ----------
interface Nl {
  RESULT?: string;
  ERR_MESSAGE?: string;
  docs?: { TITLE?: string; AUTHOR?: string; PUBLISHER?: string; EA_ADD_CODE?: string; TITLE_URL?: string }[];
}

export function parseNl(json: unknown): Partial_ | null {
  const d = (json as Nl)?.docs?.[0];
  if (!d?.TITLE) return null;
  return {
    title: clean(d.TITLE)!,
    author: clean(d.AUTHOR),
    publisher: clean(d.PUBLISHER),
    coverUrl: https(d.TITLE_URL || undefined),
    addCode: /^\d{5}$/.test(d.EA_ADD_CODE ?? '') ? d.EA_ADD_CODE : undefined,
  };
}

/** 국립중앙도서관은 키가 틀려도 HTTP 200에 RESULT: ERROR로 응답합니다. */
export function nlError(json: unknown): string | null {
  const j = json as Nl;
  return j?.RESULT === 'ERROR' ? j.ERR_MESSAGE || '오류' : null;
}

export const nlUrl = (isbn: string, key: string) =>
  `https://www.nl.go.kr/seoji/SearchApi.do?cert_key=${encodeURIComponent(key.trim())}&result_style=json&page_no=1&page_size=1&isbn=${isbn}`;

/** 제목·표지는 카카오를 우선하고, 부가기호는 국립중앙도서관에서 가져옵니다. */
export function mergeKorean(isbn: string, kakao: Partial_ | null, nl: Partial_ | null): LookupResult | null {
  if (!kakao && !nl) return null;
  return {
    isbn,
    title: kakao?.title || nl!.title,
    author: kakao?.author || nl?.author,
    publisher: kakao?.publisher || nl?.publisher,
    coverUrl: kakao?.coverUrl || nl?.coverUrl,
    addCode: nl?.addCode,
    source: [kakao && '카카오', nl && '국립중앙도서관'].filter(Boolean).join('·'),
  };
}

// ---------- Google Books ----------
interface GoogleBooks {
  items?: {
    volumeInfo?: {
      title?: string;
      subtitle?: string;
      authors?: string[];
      publisher?: string;
      imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    };
  }[];
}

export function parseGoogleBooks(json: unknown, isbn: string): LookupResult | null {
  const v = (json as GoogleBooks)?.items?.[0]?.volumeInfo;
  if (!v?.title) return null;
  return {
    isbn,
    title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title,
    author: v.authors?.join(', '),
    publisher: v.publisher,
    coverUrl: https(v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail),
    source: 'Google Books',
  };
}

// ---------- Open Library ----------
interface OpenLibraryBook {
  title?: string;
  subtitle?: string;
  authors?: { name: string }[];
  publishers?: { name: string }[];
  cover?: { medium?: string; large?: string; small?: string };
}

export function parseOpenLibrary(json: unknown, isbn: string): LookupResult | null {
  const b = (json as Record<string, OpenLibraryBook>)?.[`ISBN:${isbn}`];
  if (!b?.title) return null;
  return {
    isbn,
    title: b.subtitle ? `${b.title}: ${b.subtitle}` : b.title,
    author: b.authors?.map((a) => a.name).join(', '),
    publisher: b.publishers?.map((p) => p.name).join(', '),
    coverUrl: https(b.cover?.medium || b.cover?.large || b.cover?.small),
    source: 'Open Library',
  };
}

async function tryKorean(isbn: string, keys: LookupKeys, fetcher: Fetcher): Promise<LookupResult | null> {
  const [kakao, nl] = await Promise.all([
    keys.kakaoKey
      ? getJson(fetcher, kakaoUrl(isbn), kakaoHeaders(keys.kakaoKey)).then(parseKakao).catch(() => null)
      : null,
    keys.nlKey ? getJson(fetcher, nlUrl(isbn, keys.nlKey)).then(parseNl).catch(() => null) : null,
  ]);
  return mergeKorean(isbn, kakao, nl);
}

export async function lookupIsbn(
  isbn: string,
  opts: LookupKeys & { fetcher?: Fetcher } = {},
): Promise<LookupResult | null> {
  const fetcher = opts.fetcher ?? fetch.bind(globalThis);
  const korean = await tryKorean(isbn, opts, fetcher);
  if (korean) return korean;

  const sources: [string, (j: unknown, isbn: string) => LookupResult | null][] = [
    [`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`, parseGoogleBooks],
    [`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, parseOpenLibrary],
  ];
  for (const [url, parse] of sources) {
    try {
      const r = parse(await getJson(fetcher, url), isbn);
      if (r) return r;
    } catch {
      // 다음 출처로 넘어갑니다.
    }
  }
  return null;
}

/** 설정 화면의 '키 확인' 버튼용: 각 키로 시험 조회해 결과를 알려줍니다. */
export const TEST_ISBN = '9788937460449';

export async function checkKakaoKey(key: string, fetcher: Fetcher = fetch.bind(globalThis)): Promise<string> {
  try {
    const r = parseKakao(await getJson(fetcher, kakaoUrl(TEST_ISBN), kakaoHeaders(key)));
    return r ? `✅ 카카오 연결됨 (시험 조회: ${r.title})` : '⚠️ 카카오 연결은 됐지만 시험 책을 찾지 못했습니다.';
  } catch (e) {
    if (e instanceof LookupHttpError && (e.status === 401 || e.status === 403)) {
      return '❌ 카카오 키가 올바르지 않습니다. REST API 키를 넣었는지 확인하세요.';
    }
    return '❌ 카카오에 연결하지 못했습니다. 인터넷 연결을 확인하세요.';
  }
}

export async function checkNlKey(key: string, fetcher: Fetcher = fetch.bind(globalThis)): Promise<string> {
  try {
    const json = await getJson(fetcher, nlUrl(TEST_ISBN, key));
    const err = nlError(json);
    if (err) return `❌ 국립중앙도서관: ${err}`;
    const r = parseNl(json);
    return r ? `✅ 국립중앙도서관 연결됨 (시험 조회: ${r.title})` : '⚠️ 국립중앙도서관 연결은 됐지만 시험 책을 찾지 못했습니다.';
  } catch {
    return '❌ 국립중앙도서관에 연결하지 못했습니다. 인터넷 연결을 확인하세요.';
  }
}
