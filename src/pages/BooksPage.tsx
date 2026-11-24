import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import type { Lang } from '../lib/types';
import { BookCover, LangBadge, levelText } from '../components/common';
import { useFlow } from '../flow';
import { navigate } from '../router';

export function BooksPage() {
  const { newBook, openScanner } = useFlow();
  const [q, setQ] = useState('');
  const [lang, setLang] = useState<Lang | 'all'>('all');
  const books = useLiveQuery(() => db.books.orderBy('updatedAt').reverse().toArray(), []);

  const needle = q.trim().toLowerCase();
  const filtered = (books ?? []).filter((b) => {
    if (lang !== 'all' && b.lang !== lang) return false;
    if (!needle) return true;
    return [b.title, b.author, b.series, b.publisher, b.isbn].some((v) => v?.toLowerCase().includes(needle));
  });

  return (
    <>
      <header className="page-header">
        <h1>책장</h1>
        <button type="button" className="btn sm" onClick={() => newBook()}>
          + 직접 등록
        </button>
      </header>

      <div className="stack">
        <input
          className="input"
          type="search"
          placeholder="제목·저자·시리즈·ISBN 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="책 검색"
        />
        <div className="chips">
          {(
            [
              ['all', '전체'],
              ['en', '영어책'],
              ['ko', '한글책'],
            ] as const
          ).map(([k, label]) => (
            <button type="button" key={k} className="chip" aria-pressed={lang === k} onClick={() => setLang(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">
          <span>{filtered.length}권</span>
        </h2>
        {books && books.length === 0 ? (
          <div className="empty stack">
            <div>등록된 책이 없습니다.</div>
            <button type="button" className="btn primary" onClick={openScanner}>
              📷 바코드로 첫 책 등록
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">검색 결과가 없습니다.</div>
        ) : (
          <div className="list">
            {filtered.map((b) => (
              <button type="button" className="book-row" key={b.id} onClick={() => navigate(`/books/${b.id}`)}>
                <BookCover book={b} />
                <div className="meta">
                  <div className="title">{b.title}</div>
                  <div className="sub">
                    <LangBadge book={b} />
                    {[levelText(b), b.series].filter(Boolean).join(' · ') || b.author}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
