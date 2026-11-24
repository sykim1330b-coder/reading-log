/**
 * 책 정보 조회 서버 (Cloudflare Worker)
 * GET /isbn/{ISBN13} → { title, author, publisher, coverUrl, addCode, source }
 *
 * 국립중앙도서관 ISBN 서지정보(부가기호 포함)와 카카오 책검색을 함께 조회해 합칩니다.
 * API 키는 Worker 비밀값으로만 보관하고, 독서기록 데이터는 받지도 저장하지도 않습니다.
 *
 * 비밀값(wrangler secret put): NL_CERT_KEY, KAKAO_REST_KEY (둘 중 하나만 있어도 동작)
 * 변수(wrangler.toml [vars]): ALLOWED_ORIGINS = "https://아이디.github.io" (쉼표로 여러 개)
 */

const CACHE_SECONDS = 60 * 60 * 24 * 30;

export function parseNl(json) {
  const d = json?.docs?.[0];
  if (!d?.TITLE) return null;
  return {
    title: d.TITLE.trim(),
    author: d.AUTHOR?.trim() || undefined,
    publisher: d.PUBLISHER?.trim() || undefined,
    coverUrl: d.TITLE_URL || undefined,
    addCode: /^\d{5}$/.test(d.EA_ADD_CODE ?? '') ? d.EA_ADD_CODE : undefined,
  };
}

export function parseKakao(json) {
  const d = json?.documents?.[0];
  if (!d?.title) return null;
  return {
    title: d.title.trim(),
    author: d.authors?.join(', ') || undefined,
    publisher: d.publisher || undefined,
    coverUrl: d.thumbnail || undefined,
  };
}

/** 제목·표지는 카카오를 우선하고, 부가기호는 국립중앙도서관에서 가져옵니다. */
export function merge(nl, kakao) {
  if (!nl && !kakao) return null;
  const sources = [kakao && '카카오', nl && '국립중앙도서관'].filter(Boolean);
  return {
    title: kakao?.title || nl.title,
    author: kakao?.author || nl?.author,
    publisher: kakao?.publisher || nl?.publisher,
    coverUrl: kakao?.coverUrl || nl?.coverUrl,
    addCode: nl?.addCode,
    source: sources.join('·'),
  };
}

async function fetchJson(url, init) {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function lookup(isbn, env) {
  const [nlJson, kakaoJson] = await Promise.all([
    env.NL_CERT_KEY
      ? fetchJson(
          `https://www.nl.go.kr/seoji/SearchApi.do?cert_key=${encodeURIComponent(env.NL_CERT_KEY)}&result_style=json&page_no=1&page_size=1&isbn=${isbn}`,
        )
      : null,
    env.KAKAO_REST_KEY
      ? fetchJson(`https://dapi.kakao.com/v3/search/book?target=isbn&query=${isbn}`, {
          headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
        })
      : null,
  ]);
  return merge(parseNl(nlJson), parseKakao(kakaoJson));
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = allowed.includes(origin) || origin.startsWith('http://localhost:');
  return ok ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    }
    const m = new URL(request.url).pathname.match(/^\/isbn\/(97[89]\d{10})$/);
    if (request.method !== 'GET' || !m) return json({ error: 'GET /isbn/{ISBN13}' }, 404, cors);
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'origin not allowed' }, 403, {});

    const isbn = m[1];
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.local/isbn/${isbn}`);
    let res = await cache.match(cacheKey);
    if (!res) {
      const book = await lookup(isbn, env);
      if (!book) return json({ error: 'not found' }, 404, cors);
      res = json(book, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
