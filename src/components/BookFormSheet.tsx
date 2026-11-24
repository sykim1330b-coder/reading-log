import { useState } from 'react';
import { FORMAT_LABEL, LANG_LABEL, LEVEL_LABEL, OWNERSHIP_LABEL } from '../lib/constants';
import { readerTarget } from '../lib/isbn';
import { deleteBook, saveBook } from '../lib/repo';
import type { Book, BookFormat, Lang, LevelSystem, Ownership } from '../lib/types';
import { useFlow } from '../flow';
import { navigate } from '../router';
import { BookCover } from './common';

const LEVELS_BY_LANG: Record<Lang, LevelSystem[]> = {
  en: ['AR', 'LEXILE', 'HOME'],
  ko: ['GRADE', 'HOME'],
};

const LEVEL_PLACEHOLDER: Record<LevelSystem, string> = {
  AR: '예: 2.3',
  LEXILE: '예: 450L',
  GRADE: '예: 초등 1~2학년, 5세 이상',
  HOME: '예: 2단계',
};

async function copyAndOpen(isbn: string | undefined, url: string, toast: (m: string) => void) {
  if (isbn) {
    try {
      await navigator.clipboard.writeText(isbn);
      toast('ISBN을 복사했습니다. 열린 사이트의 검색창에 붙여넣으세요.');
    } catch {
      toast(`ISBN: ${isbn}`);
    }
  }
  window.open(url, '_blank', 'noopener');
}

export function BookFormSheet({ draft, thenLog, notice }: { draft: Book; thenLog: boolean; notice?: string }) {
  const { close, openLog, toast } = useFlow();
  const [book, setBook] = useState<Book>(draft);
  const [saving, setSaving] = useState(false);
  const isNew = !book.id;
  const target = readerTarget(book.addCode);

  const set = <K extends keyof Book>(key: K, value: Book[K]) => setBook((b) => ({ ...b, [key]: value }));

  const levelValue = (s: LevelSystem) => book.levels.find((l) => l.system === s)?.value ?? '';
  const setLevel = (s: LevelSystem, value: string) =>
    setBook((b) => ({ ...b, levels: [...b.levels.filter((l) => l.system !== s), { system: s, value }] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!book.title.trim()) {
      toast('제목을 입력해 주세요.');
      return;
    }
    setSaving(true);
    // 현재 언어에서 쓰지 않는 등급과 빈 값은 저장하지 않습니다.
    const levels = book.levels
      .map((l) => ({ ...l, value: l.value.trim() }))
      .filter((l) => l.value && LEVELS_BY_LANG[book.lang].includes(l.system));
    const id = await saveBook({
      ...book,
      title: book.title.trim(),
      author: book.author?.trim() || undefined,
      publisher: book.publisher?.trim() || undefined,
      series: book.series?.trim() || undefined,
      memo: book.memo?.trim() || undefined,
      levels,
    });
    if (thenLog) openLog(id);
    else {
      toast('저장했습니다.');
      close();
    }
  };

  const remove = async () => {
    if (!book.id) return;
    if (!confirm('이 책과 이 책의 모든 기록을 삭제할까요?')) return;
    await deleteBook(book.id);
    close();
    navigate('/books');
    toast('삭제했습니다.');
  };

  return (
    <div className="overlay" onClick={close}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-label="책 정보">
        <div className="sheet-head">
          <h2>{isNew ? '새 책 등록' : '책 정보 수정'}</h2>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={close}>
            ✕
          </button>
        </div>

        <div className="stack">
          {notice && <div className="banner">{notice}</div>}

          <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <BookCover book={book} size="lg" />
            <div className="stack" style={{ flex: 1 }}>
              <label className="field">
                <span className="label">제목 *</span>
                <input className="input" value={book.title} onChange={(e) => set('title', e.target.value)} required />
              </label>
              {book.isbn && <div className="small muted">ISBN {book.isbn}</div>}
              {target && <div className="small muted">독자대상: {target} (부가기호 {book.addCode})</div>}
            </div>
          </div>

          <div className="field">
            <span className="label">구분</span>
            <div className="chips">
              {(['en', 'ko'] as Lang[]).map((l) => (
                <button type="button" key={l} className="chip" aria-pressed={book.lang === l} onClick={() => set('lang', l)}>
                  {LANG_LABEL[l]}책
                </button>
              ))}
            </div>
          </div>

          <div className="grid-2">
            <label className="field">
              <span className="label">저자</span>
              <input className="input" value={book.author ?? ''} onChange={(e) => set('author', e.target.value)} />
            </label>
            <label className="field">
              <span className="label">출판사</span>
              <input className="input" value={book.publisher ?? ''} onChange={(e) => set('publisher', e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="label">시리즈</span>
            <input
              className="input"
              placeholder="예: Oxford Reading Tree, Magic Tree House"
              value={book.series ?? ''}
              onChange={(e) => set('series', e.target.value)}
            />
          </label>

          <div className="field">
            <span className="label">등급</span>
            <div className="grid-2">
              {LEVELS_BY_LANG[book.lang].map((s) => (
                <label className="field" key={s} style={s === 'GRADE' ? { gridColumn: '1 / -1' } : undefined}>
                  <span className="small muted">{LEVEL_LABEL[s]}</span>
                  <input
                    className="input"
                    placeholder={LEVEL_PLACEHOLDER[s]}
                    value={levelValue(s)}
                    onChange={(e) => setLevel(s, e.target.value)}
                    inputMode={s === 'AR' ? 'decimal' : undefined}
                  />
                </label>
              ))}
            </div>
            {book.lang === 'en' && (
              <div className="row wrap" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => copyAndOpen(book.isbn, 'https://www.arbookfind.com/', toast)}
                >
                  AR 찾아보기 ↗
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => copyAndOpen(book.isbn, 'https://hub.lexile.com/find-a-book/search', toast)}
                >
                  Lexile 찾아보기 ↗
                </button>
              </div>
            )}
          </div>

          <div className="grid-2">
            <label className="field">
              <span className="label">유형</span>
              <select
                className="select"
                value={book.format ?? ''}
                onChange={(e) => set('format', (e.target.value || undefined) as BookFormat | undefined)}
              >
                <option value="">선택 안 함</option>
                {Object.entries(FORMAT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">소장</span>
              <select
                className="select"
                value={book.ownership ?? ''}
                onChange={(e) => set('ownership', (e.target.value || undefined) as Ownership | undefined)}
              >
                <option value="">선택 안 함</option>
                {Object.entries(OWNERSHIP_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span className="label">책 메모</span>
            <textarea className="textarea" value={book.memo ?? ''} onChange={(e) => set('memo', e.target.value)} />
          </label>

          {!isNew && (
            <button type="button" className="btn danger ghost block" onClick={remove}>
              이 책 삭제
            </button>
          )}
        </div>

        <div className="sheet-foot">
          <button className="btn primary block" type="submit" disabled={saving}>
            {thenLog ? '저장하고 기록하기' : '저장'}
          </button>
        </div>
      </form>
    </div>
  );
}
