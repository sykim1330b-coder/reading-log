import { lazy, Suspense, useEffect } from 'react';
import { FlowProvider, useFlow } from './flow';
import { useKids } from './hooks';
import { useRoute, type Route } from './router';
import { BookFormSheet } from './components/BookFormSheet';
import { LogFormSheet } from './components/LogFormSheet';
import { ChildEditor } from './components/ChildEditor';
import { HomePage } from './pages/HomePage';
import { LogsPage } from './pages/LogsPage';
import { BooksPage } from './pages/BooksPage';
import { BookDetailPage } from './pages/BookDetailPage';
import { SettingsPage } from './pages/SettingsPage';

// 바코드 라이브러리가 커서 스캐너를 처음 열 때 불러옵니다.
const Scanner = lazy(() => import('./components/Scanner').then((m) => ({ default: m.Scanner })));

export function App() {
  return (
    <FlowProvider>
      <Shell />
    </FlowProvider>
  );
}

function Shell() {
  const route = useRoute();
  const kids = useKids();
  const { toastMsg } = useFlow();

  useEffect(() => {
    // 브라우저가 저장 공간을 임의로 비우지 않도록 요청합니다(가능한 경우).
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  if (kids === undefined) return null;

  return (
    <>
      <main className="app">{kids.length === 0 ? <Onboarding /> : <Page route={route} />}</main>
      {kids.length > 0 && <BottomNav route={route} />}
      <Sheets />
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'logs':
      return <LogsPage />;
    case 'books':
      return <BooksPage />;
    case 'book':
      return <BookDetailPage id={route.id} />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <HomePage />;
  }
}

function Onboarding() {
  return (
    <div className="stack" style={{ paddingTop: 48 }}>
      <div style={{ fontSize: 48 }}>📚</div>
      <h1 style={{ margin: 0 }}>우리집 독서기록</h1>
      <p className="muted" style={{ margin: 0 }}>
        책 바코드를 찍어 아이들의 집중듣기·흘려듣기·읽기를 기록합니다. 먼저 아이를 등록해 주세요. 아이는 나중에 설정에서 더 추가할 수
        있습니다.
      </p>
      <ChildEditor usedColors={[]} onDone={() => {}} />
      <p className="small muted">기록은 이 폰에만 저장됩니다. 홈 화면에 추가해서 사용하고, 설정에서 정기적으로 백업하세요.</p>
    </div>
  );
}

const NAV: { path: string; name: Route['name'][]; icon: string; label: string }[] = [
  { path: '/', name: ['home'], icon: '🏠', label: '오늘' },
  { path: '/logs', name: ['logs'], icon: '📅', label: '기록' },
  { path: '/books', name: ['books', 'book'], icon: '📚', label: '책장' },
  { path: '/settings', name: ['settings'], icon: '⚙️', label: '설정' },
];

function BottomNav({ route }: { route: Route }) {
  const { openScanner } = useFlow();
  const link = (n: (typeof NAV)[number]) => (
    <a
      key={n.path}
      className="nav-item"
      href={`#${n.path}`}
      aria-current={n.name.includes(route.name) ? 'page' : undefined}
    >
      <span className="ico" aria-hidden>
        {n.icon}
      </span>
      {n.label}
    </a>
  );
  return (
    <nav className="bottom-nav" aria-label="메뉴">
      <div className="inner">
        {link(NAV[0])}
        {link(NAV[1])}
        <button type="button" className="nav-scan" aria-label="바코드 스캔" onClick={openScanner}>
          📷
        </button>
        {link(NAV[2])}
        {link(NAV[3])}
      </div>
    </nav>
  );
}

function Sheets() {
  const { sheet, close } = useFlow();
  switch (sheet.kind) {
    case 'scanner':
      return (
        <Suspense fallback={<div className="scanner" />}>
          <Scanner />
        </Suspense>
      );
    case 'loading':
      return (
        <div className="overlay" onClick={close}>
          <div className="sheet">
            <div className="center-fill">
              <div className="spinner" />
              <div>책 정보를 찾는 중… ({sheet.isbn})</div>
            </div>
          </div>
        </div>
      );
    case 'bookForm':
      return <BookFormSheet key={sheet.draft.id ?? sheet.draft.isbn ?? 'new'} {...sheet} />;
    case 'logForm':
      return <LogFormSheet key={`${sheet.bookId}-${sheet.log?.id ?? 'new'}`} bookId={sheet.bookId} log={sheet.log} />;
    default:
      return null;
  }
}
