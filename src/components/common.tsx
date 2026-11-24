import type { Book, Child, ReadingLog } from '../lib/types';
import { ACTIVITY_LABEL, LANG_LABEL, LEVEL_LABEL, REACTION_LABEL } from '../lib/constants';
import { formatMinutes } from '../lib/date';

export function BookCover({ book, size }: { book?: Book; size?: 'lg' }) {
  const cls = size === 'lg' ? 'cover lg' : 'cover';
  if (book?.coverUrl) {
    return <img className={cls} src={book.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />;
  }
  return <div className={cls}>{book?.format === 'media' ? '💿' : '📘'}</div>;
}

export function LangBadge({ book }: { book: Book }) {
  return <span className={`badge ${book.lang}`}>{LANG_LABEL[book.lang]}</span>;
}

export function levelText(book: Book): string {
  return book.levels
    .filter((l) => l.value)
    .map((l) => (l.system === 'HOME' ? l.value : `${LEVEL_LABEL[l.system]} ${l.value}`))
    .join(' · ');
}

export function ChildSwitcher({
  kids,
  value,
  onChange,
  allowAll = true,
}: {
  kids: Child[];
  value: number | null;
  onChange: (id: number | null) => void;
  allowAll?: boolean;
}) {
  if (kids.length < 2 && allowAll) return null;
  return (
    <div className="chips" role="group" aria-label="아이 선택">
      {allowAll && (
        <button type="button" className="chip" aria-pressed={value === null} onClick={() => onChange(null)}>
          전체
        </button>
      )}
      {kids.map((k) => (
        <button type="button" key={k.id} className="chip" aria-pressed={value === k.id} onClick={() => onChange(k.id!)}>
          <span className="dot" style={{ background: k.color }} />
          {k.name}
        </button>
      ))}
    </div>
  );
}

export function LogRow({
  log,
  book,
  child,
  showChild,
  onClick,
}: {
  log: ReadingLog;
  book?: Book;
  child?: Child;
  showChild: boolean;
  onClick?: () => void;
}) {
  const parts = [ACTIVITY_LABEL[log.activity]];
  if (log.minutes) parts.push(formatMinutes(log.minutes));
  if (log.count > 1) parts.push(`${log.count}회`);
  return (
    <div
      className="log-row"
      style={{ ['--child-color' as string]: child?.color }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <BookCover book={book} />
      <div className="meta">
        <div className="title">{book?.title ?? '(삭제된 책)'}</div>
        <div className="sub">
          {showChild && child ? `${child.name} · ` : ''}
          {parts.join(' · ')}
        </div>
        {log.memo && <div className="small muted">{log.memo}</div>}
      </div>
      {log.reaction && (
        <span title={REACTION_LABEL[log.reaction].label} style={{ fontSize: 22 }}>
          {REACTION_LABEL[log.reaction].emoji}
        </span>
      )}
    </div>
  );
}
