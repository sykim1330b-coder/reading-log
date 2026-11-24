import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { ACTIVITY_LABEL, FORMAT_LABEL, OWNERSHIP_LABEL, REACTION_LABEL } from '../lib/constants';
import { formatDateKey, formatMinutes } from '../lib/date';
import { readerTarget } from '../lib/isbn';
import type { Reaction } from '../lib/types';
import { BookCover, LangBadge, levelText } from '../components/common';
import { useFlow } from '../flow';
import { useKidMap } from '../hooks';
import { navigate } from '../router';

/** 2026-11-24 → 26.11.24 */
const shortDate = (key: string) => key.slice(2).replace(/-/g, '.');

export function BookDetailPage({ id }: { id: number }) {
  const { openLog, editBook, editLog } = useFlow();
  const book = useLiveQuery(() => db.books.get(id).then((b) => b ?? null), [id]);
  const logs = useLiveQuery(() => db.logs.where('bookId').equals(id).toArray(), [id]) ?? [];
  const kidMap = useKidMap();

  if (book === undefined) {
    return (
      <div className="center-fill">
        <div className="spinner" />
      </div>
    );
  }
  if (book === null) {
    return (
      <div className="center-fill">
        <div className="muted">책을 찾을 수 없습니다.</div>
        <button type="button" className="btn" onClick={() => navigate('/books')}>
          책장으로
        </button>
      </div>
    );
  }

  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const totalCount = logs.reduce((a, l) => a + l.count, 0);
  const totalMin = logs.reduce((a, l) => a + (l.minutes ?? 0), 0);
  const dates = logs.map((l) => l.date).sort();
  const reactions = logs.reduce<Record<string, number>>((acc, l) => {
    if (l.reaction) acc[l.reaction] = (acc[l.reaction] ?? 0) + 1;
    return acc;
  }, {});
  const target = readerTarget(book.addCode);
  const info = [
    book.author,
    book.publisher,
    book.series && `시리즈: ${book.series}`,
    book.format && FORMAT_LABEL[book.format],
    book.ownership && OWNERSHIP_LABEL[book.ownership],
    target && `독자대상: ${target}`,
    book.isbn && `ISBN ${book.isbn}`,
  ].filter(Boolean);

  return (
    <>
      <header className="page-header">
        <button type="button" className="btn ghost sm" onClick={() => navigate('/books')}>
          ‹ 책장
        </button>
        <button type="button" className="btn sm" onClick={() => editBook(book)}>
          수정
        </button>
      </header>

      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <BookCover book={book} size="lg" />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, margin: '0 0 6px', lineHeight: 1.3 }}>{book.title}</h1>
          <div style={{ marginBottom: 4 }}>
            <LangBadge book={book} />
            <span className="small">{levelText(book)}</span>
          </div>
          {info.map((t) => (
            <div className="small muted" key={t as string}>
              {t}
            </div>
          ))}
        </div>
      </div>
      {book.memo && <p className="small">{book.memo}</p>}

      <div className="section">
        <button type="button" className="btn primary block" onClick={() => openLog(book.id!)}>
          이 책 기록하기
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="small muted">누적 횟수</div>
          <div className="big">{totalCount}회</div>
        </div>
        <div className="stat">
          <div className="small muted">누적 시간</div>
          <div className="big">{totalMin ? formatMinutes(totalMin) : '-'}</div>
        </div>
        <div className="stat">
          <div className="small muted">처음 · 최근</div>
          <div className="small" style={{ fontWeight: 700 }}>
            {dates.length
              ? dates[0] === dates[dates.length - 1]
                ? shortDate(dates[0])
                : `${shortDate(dates[0])} → ${shortDate(dates[dates.length - 1])}`
              : '-'}
          </div>
        </div>
        <div className="stat">
          <div className="small muted">반응</div>
          <div style={{ fontWeight: 700 }}>
            {Object.keys(reactions).length
              ? (Object.keys(REACTION_LABEL) as Reaction[])
                  .filter((r) => reactions[r])
                  .map((r) => `${REACTION_LABEL[r].emoji}${reactions[r]}`)
                  .join(' ')
              : '-'}
          </div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">기록 이력</h2>
        {sorted.length === 0 ? (
          <div className="empty">아직 기록이 없습니다.</div>
        ) : (
          <div className="list">
            {sorted.map((l) => {
              const k = kidMap.get(l.childId);
              return (
                <div
                  className="log-row"
                  key={l.id}
                  style={{ ['--child-color' as string]: k?.color }}
                  role="button"
                  tabIndex={0}
                  onClick={() => editLog(l)}
                >
                  <div className="meta">
                    <div style={{ fontWeight: 700 }}>
                      {formatDateKey(l.date)} · {k?.name ?? '?'}
                    </div>
                    <div className="sub">
                      {[ACTIVITY_LABEL[l.activity], l.minutes && formatMinutes(l.minutes), l.count > 1 && `${l.count}회`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {l.memo && <div className="small muted">{l.memo}</div>}
                  </div>
                  {l.reaction && <span style={{ fontSize: 22 }}>{REACTION_LABEL[l.reaction].emoji}</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
