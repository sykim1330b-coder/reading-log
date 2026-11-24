import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { formatDateKey, formatMinutes, shiftDateKey, todayKey } from '../lib/date';
import { ChildSwitcher, LogRow } from '../components/common';
import { useFlow } from '../flow';
import { useBookMap, useKidMap, useKids } from '../hooks';

export function LogsPage() {
  const { activeChildId, setActiveChildId, editLog } = useFlow();
  const [date, setDate] = useState(todayKey());
  const kids = useKids() ?? [];
  const kidMap = useKidMap();
  const logs = useLiveQuery(() => db.logs.where('date').equals(date).sortBy('createdAt'), [date]) ?? [];
  const visible = logs.filter((l) => activeChildId === null || l.childId === activeChildId);
  const bookMap = useBookMap(visible.map((l) => l.bookId));
  const totalMin = visible.reduce((a, l) => a + (l.minutes ?? 0), 0);
  const isToday = date === todayKey();

  return (
    <>
      <header className="page-header">
        <h1>날짜별 기록</h1>
      </header>

      <div className="card date-nav">
        <button type="button" className="icon-btn" aria-label="이전 날" onClick={() => setDate(shiftDateKey(date, -1))}>
          ‹
        </button>
        <label className="label">
          {formatDateKey(date)}
          {isToday && <span className="small muted"> · 오늘</span>}
          <input type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="날짜 선택" />
        </label>
        <button
          type="button"
          className="icon-btn"
          aria-label="다음 날"
          disabled={isToday}
          onClick={() => setDate(shiftDateKey(date, 1))}
        >
          ›
        </button>
      </div>

      <div className="section">
        <ChildSwitcher kids={kids} value={activeChildId} onChange={setActiveChildId} />
      </div>

      <section className="section">
        <h2 className="section-title">
          {visible.length}건 <span className="small muted">{totalMin ? `총 ${formatMinutes(totalMin)}` : ''}</span>
        </h2>
        {visible.length === 0 ? (
          <div className="empty">이 날의 기록이 없습니다.</div>
        ) : (
          <div className="list">
            {visible.map((l) => (
              <LogRow
                key={l.id}
                log={l}
                book={bookMap.get(l.bookId)}
                child={kidMap.get(l.childId)}
                showChild={activeChildId === null && kids.length > 1}
                onClick={() => editLog(l)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
