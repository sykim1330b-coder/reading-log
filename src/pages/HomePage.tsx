import { useLiveQuery } from 'dexie-react-hooks';
import { db, SETTING } from '../lib/db';
import { ACTIVITY_LABEL } from '../lib/constants';
import { formatDateKey, formatMinutes, todayKey } from '../lib/date';
import type { Activity, ReadingLog } from '../lib/types';
import { BookCover, ChildSwitcher, LangBadge, LogRow, levelText } from '../components/common';
import { useFlow } from '../flow';
import { useBookMap, useKidMap, useKids } from '../hooks';
import { navigate } from '../router';

const BACKUP_REMIND_DAYS = 7;

function summarize(logs: ReadingLog[]) {
  const byActivity = new Map<Activity, number>();
  let minutes = 0;
  for (const l of logs) {
    minutes += l.minutes ?? 0;
    byActivity.set(l.activity, (byActivity.get(l.activity) ?? 0) + (l.minutes ?? 0));
  }
  return { minutes, count: logs.length, byActivity };
}

export function HomePage() {
  const { activeChildId, setActiveChildId, openScanner, openLog, editLog } = useFlow();
  const kids = useKids() ?? [];
  const kidMap = useKidMap();
  const today = todayKey();

  const todayLogs = useLiveQuery(() => db.logs.where('date').equals(today).sortBy('createdAt'), [today]) ?? [];
  const recentBooks = useLiveQuery(() => db.books.orderBy('updatedAt').reverse().limit(8).toArray(), []) ?? [];
  const lastBackupAt = useLiveQuery(() => db.settings.get(SETTING.lastBackupAt), []);
  const logCount = useLiveQuery(() => db.logs.count(), []) ?? 0;

  const visibleLogs = todayLogs.filter((l) => activeChildId === null || l.childId === activeChildId).reverse();
  const bookMap = useBookMap(visibleLogs.map((l) => l.bookId));
  const shownKids = activeChildId === null ? kids : kids.filter((k) => k.id === activeChildId);

  const lastBackup = lastBackupAt?.value as number | undefined;
  const needBackup =
    logCount > 0 && (!lastBackup || Date.now() - lastBackup > BACKUP_REMIND_DAYS * 24 * 60 * 60 * 1000);

  return (
    <>
      <header className="page-header">
        <div>
          <div className="small muted">{formatDateKey(today)}</div>
          <h1>오늘의 독서</h1>
        </div>
      </header>

      <ChildSwitcher kids={kids} value={activeChildId} onChange={setActiveChildId} />

      {needBackup && (
        <div className="section">
          <button type="button" className="banner" style={{ width: '100%', border: 'none', textAlign: 'left' }} onClick={() => navigate('/settings')}>
            {lastBackup ? `마지막 백업 후 ${BACKUP_REMIND_DAYS}일이 지났습니다.` : '아직 백업한 적이 없습니다.'} 기록은 이 폰에만
            저장되니 설정에서 백업해 주세요 →
          </button>
        </div>
      )}

      <div className="section">
        <button type="button" className="scan-hero" onClick={openScanner}>
          <span aria-hidden>📷</span> 바코드 찍고 기록하기
        </button>
      </div>

      <section className="section">
        <h2 className="section-title">오늘 요약</h2>
        <div className="stat-grid">
          {shownKids.map((k) => {
            const s = summarize(todayLogs.filter((l) => l.childId === k.id));
            const detail = [...s.byActivity.entries()]
              .filter(([, m]) => m > 0)
              .map(([a, m]) => `${ACTIVITY_LABEL[a]} ${formatMinutes(m)}`)
              .join(' · ');
            return (
              <div className="stat" key={k.id} style={{ ['--child-color' as string]: k.color }}>
                <div className="small muted">{k.name}</div>
                <div className="big">{s.minutes ? formatMinutes(s.minutes) : `${s.count}건`}</div>
                <div className="small muted">{s.count ? detail || `${s.count}건 기록` : '아직 기록 없음'}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">
          오늘 기록 <span className="small muted">{visibleLogs.length}건</span>
        </h2>
        {visibleLogs.length === 0 ? (
          <div className="empty">아직 오늘 기록이 없어요. 책 바코드를 찍어 시작해 보세요.</div>
        ) : (
          <div className="list">
            {visibleLogs.map((l) => (
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

      {recentBooks.length > 0 && (
        <section className="section">
          <h2 className="section-title">최근 읽은 책 · 바로 기록</h2>
          <div className="list">
            {recentBooks.map((b) => (
              <div className="book-row" key={b.id} onClick={() => openLog(b.id!)} role="button" tabIndex={0}>
                <BookCover book={b} />
                <div className="meta">
                  <div className="title">{b.title}</div>
                  <div className="sub">
                    <LangBadge book={b} />
                    {levelText(b) || b.series || b.author}
                  </div>
                </div>
                <span className="btn sm primary">기록</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
