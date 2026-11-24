import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { ACTIVITIES_BY_LANG, ACTIVITY_LABEL, QUICK_MINUTES, REACTION_LABEL } from '../lib/constants';
import { formatDateKey, todayKey } from '../lib/date';
import { addLogs, lastLogForBook } from '../lib/repo';
import type { Activity, Book, Child, Reaction, ReadingLog } from '../lib/types';
import { useFlow } from '../flow';
import { BookCover, LangBadge, levelText } from './common';

interface Loaded {
  book: Book;
  kids: Child[];
  last?: ReadingLog;
}

/** 책·아이 목록·직전 기록을 읽어 온 뒤 기록 폼을 띄웁니다. */
export function LogFormSheet({ bookId, log }: { bookId: number; log?: ReadingLog }) {
  const { close } = useFlow();
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    (async () => {
      const [book, kids, last] = await Promise.all([
        db.books.get(bookId),
        db.children.orderBy('id').toArray(),
        lastLogForBook(bookId),
      ]);
      if (!book) close();
      else setData({ book, kids, last });
    })();
  }, [bookId, close]);

  return (
    <div className="overlay" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {data ? (
          <LogForm {...data} editing={log} />
        ) : (
          <div className="center-fill">
            <div className="spinner" />
          </div>
        )}
      </div>
    </div>
  );
}

function LogForm({ book, kids, last, editing }: Loaded & { editing?: ReadingLog }) {
  const { close, toast, activeChildId } = useFlow();
  const activities = ACTIVITIES_BY_LANG[book.lang];
  const base = editing ?? last;

  const initialKids = editing
    ? [editing.childId]
    : activeChildId && kids.some((k) => k.id === activeChildId)
      ? [activeChildId]
      : kids.length === 1
        ? [kids[0].id!]
        : [];

  const [date, setDate] = useState(editing?.date ?? todayKey());
  const [childIds, setChildIds] = useState<number[]>(initialKids);
  const [activity, setActivity] = useState<Activity>(
    base && activities.includes(base.activity) ? base.activity : activities[0],
  );
  const [minutes, setMinutes] = useState<string>(base?.minutes ? String(base.minutes) : '');
  const [count, setCount] = useState(editing?.count ?? 1);
  const [reaction, setReaction] = useState<Reaction | undefined>(editing?.reaction);
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [saving, setSaving] = useState(false);

  const toggleKid = (id: number) => {
    if (editing) setChildIds([id]);
    else setChildIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const save = async () => {
    if (childIds.length === 0) {
      toast('누가 읽었는지 아이를 선택해 주세요.');
      return;
    }
    const min = minutes ? Math.max(0, Math.round(Number(minutes))) : undefined;
    setSaving(true);
    if (editing?.id) {
      await db.logs.update(editing.id, {
        date,
        childId: childIds[0],
        activity,
        minutes: min || undefined,
        count,
        reaction,
        memo: memo.trim() || undefined,
      });
      toast('수정했습니다.');
    } else {
      await addLogs({ date, childIds, bookId: book.id!, activity, minutes: min || undefined, count, reaction, memo });
      const names = kids.filter((k) => childIds.includes(k.id!)).map((k) => k.name);
      toast(`${names.join(', ')} · ${ACTIVITY_LABEL[activity]} 기록했습니다.`);
    }
    close();
  };

  const remove = async () => {
    if (!editing?.id || !confirm('이 기록을 삭제할까요?')) return;
    await db.logs.delete(editing.id);
    toast('삭제했습니다.');
    close();
  };

  return (
    <>
      <div className="sheet-head">
        <h2>{editing ? '기록 수정' : '독서 기록'}</h2>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={close}>
          ✕
        </button>
      </div>

      <div className="stack">
        <div className="row" style={{ gap: 12 }}>
          <BookCover book={book} />
          <div style={{ minWidth: 0 }}>
            <div className="title">{book.title}</div>
            <div className="sub">
              <LangBadge book={book} />
              {levelText(book)}
            </div>
          </div>
        </div>

        <label className="field">
          <span className="label">날짜 · {formatDateKey(date)}</span>
          <input
            className="input"
            type="date"
            value={date}
            max={todayKey()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="label">누가{!editing && kids.length > 1 ? ' (여러 명 선택 가능)' : ''}</span>
          <div className="chips wrap">
            {kids.map((k) => (
              <button
                type="button"
                key={k.id}
                className="chip"
                aria-pressed={childIds.includes(k.id!)}
                onClick={() => toggleKid(k.id!)}
              >
                <span className="dot" style={{ background: k.color }} />
                {k.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">활동</span>
          <div className="chips wrap">
            {activities.map((a) => (
              <button type="button" key={a} className="chip" aria-pressed={activity === a} onClick={() => setActivity(a)}>
                {ACTIVITY_LABEL[a]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">시간(분)</span>
          <div className="chips wrap">
            {QUICK_MINUTES.map((m) => (
              <button
                type="button"
                key={m}
                className="chip"
                aria-pressed={minutes === String(m)}
                onClick={() => setMinutes(minutes === String(m) ? '' : String(m))}
              >
                {m}분
              </button>
            ))}
            <input
              className="input"
              style={{ width: 90, minHeight: 36 }}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="직접"
              aria-label="시간 직접 입력(분)"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <span className="label">횟수</span>
          <div className="stepper">
            <button type="button" aria-label="횟수 줄이기" onClick={() => setCount((c) => Math.max(1, c - 1))}>
              −
            </button>
            <span aria-live="polite">{count}회</span>
            <button type="button" aria-label="횟수 늘리기" onClick={() => setCount((c) => Math.min(99, c + 1))}>
              +
            </button>
          </div>
        </div>

        <div className="field">
          <span className="label">반응</span>
          <div className="chips">
            {(Object.keys(REACTION_LABEL) as Reaction[]).map((r) => (
              <button
                type="button"
                key={r}
                className="chip"
                aria-pressed={reaction === r}
                onClick={() => setReaction(reaction === r ? undefined : r)}
              >
                {REACTION_LABEL[r].emoji} {REACTION_LABEL[r].label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="label">메모</span>
          <textarea
            className="textarea"
            placeholder="예: 따라 말하기를 좋아함"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>

        {editing && (
          <button type="button" className="btn danger ghost block" onClick={remove}>
            이 기록 삭제
          </button>
        )}
      </div>

      <div className="sheet-foot">
        <button type="button" className="btn primary block" onClick={save} disabled={saving}>
          {editing ? '수정 저장' : '기록 저장'}
        </button>
      </div>
    </>
  );
}
