/**
 * ISBN으로 책 정보를 찾습니다.
 * 순서: 조회 서버(국립중앙도서관+카카오, 설정 시) → Google Books → Open Library
 * 조회 서버가 없어도 Google Books·Open Library는 키 없이 브라우저에서 바로 호출됩니다.
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

type Fetcher = typeof fetch;

const TIMEOUT_MS = 7000;

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const https = (u?: string) => (u ? u.replace(/^http:\/\//, 'https://') : undefined);

// ---------- 조회 서버(worker) ----------
export function parseWorker(json: unknown, isbn: string): LookupResult | null {
  const j = json as Partial<LookupResult> | null;
  if (!j || !j.title) return null;
  return {
    isbn,
    title: j.title,
    author: j.author || undefined,
    publisher: j.publisher || undefined,
    coverUrl: https(j.coverUrl),
    addCode: j.addCode || undefined,
    source: j.source || '조회 서버',
  };
}

// ---------- Google Books ----------
interface GoogleBooks {
  totalItems?: number;
  items?: { volumeInfo?: { title?: string; subtitle?: string; authors?: string[]; publisher?: string; imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }[];
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

export async function lookupIsbn(
  isbn: string,
  opts: { workerUrl?: string; fetcher?: Fetcher } = {},
): Promise<LookupResult | null> {
  const fetcher = opts.fetcher ?? fetch.bind(globalThis);
  const sources: [string, (j: unknown, isbn: string) => LookupResult | null][] = [];
  if (opts.workerUrl) {
    sources.push([`${opts.workerUrl.replace(/\/+$/, '')}/isbn/${isbn}`, parseWorker]);
  }
  sources.push([`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`, parseGoogleBooks]);
  sources.push([`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, parseOpenLibrary]);

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
