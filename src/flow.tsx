import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, SETTING } from './lib/db';
import { isKoreanPublisher, normalizeIsbn } from './lib/isbn';
import { lookupIsbn } from './lib/lookup';
import { findBookByIsbn } from './lib/repo';
import type { Book, ReadingLog } from './lib/types';

/** 화면 위에 뜨는 시트(스캐너, 책 등록, 활동 기록)와 토스트를 관리합니다. */
type Sheet =
  | { kind: 'none' }
  | { kind: 'scanner' }
  | { kind: 'loading'; isbn: string }
  | { kind: 'bookForm'; draft: Book; thenLog: boolean; notice?: string }
  | { kind: 'logForm'; bookId: number; log?: ReadingLog };

interface FlowApi {
  sheet: Sheet;
  activeChildId: number | null;
  setActiveChildId: (id: number | null) => void;
  openScanner: () => void;
  handleIsbn: (raw: string) => Promise<boolean>;
  newBook: (partial?: Partial<Book>) => void;
  editBook: (book: Book) => void;
  openLog: (bookId: number) => void;
  editLog: (log: ReadingLog) => void;
  close: () => void;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const FlowContext = createContext<FlowApi | null>(null);

export function emptyBook(partial: Partial<Book> = {}): Book {
  return {
    title: '',
    lang: 'en',
    levels: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

export function FlowProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' });
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const activeSetting = useLiveQuery(() => db.settings.get(SETTING.activeChildId), []);
  const activeChildId = (activeSetting?.value as number | null | undefined) ?? null;
  const setActiveChildId = useCallback((id: number | null) => {
    db.settings.put({ key: SETTING.activeChildId, value: id });
  }, []);

  const toastTimer = useRef<number | undefined>(undefined);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const handleIsbn = useCallback(
    async (raw: string) => {
      const isbn = normalizeIsbn(raw);
      if (!isbn) {
        toast('올바른 ISBN이 아닙니다. 책 뒷면의 978/979로 시작하는 바코드를 찍어주세요.');
        return false;
      }
      const existing = await findBookByIsbn(isbn);
      if (existing?.id) {
        setSheet({ kind: 'logForm', bookId: existing.id });
        return true;
      }
      setSheet({ kind: 'loading', isbn });
      const workerUrl = await getSetting<string>(SETTING.lookupUrl, '');
      const found = await lookupIsbn(isbn, { workerUrl: workerUrl || undefined });
      const lang = isKoreanPublisher(isbn) ? 'ko' : 'en';
      const next: Sheet = found
        ? {
            kind: 'bookForm',
            thenLog: true,
            notice: `${found.source}에서 책 정보를 가져왔습니다. 확인 후 저장하세요.`,
            draft: emptyBook({
              isbn,
              lang,
              title: found.title,
              author: found.author,
              publisher: found.publisher,
              coverUrl: found.coverUrl,
              addCode: found.addCode,
            }),
          }
        : {
            kind: 'bookForm',
            thenLog: true,
            notice: '책 정보를 찾지 못했습니다. 제목을 직접 입력해 주세요.',
            draft: emptyBook({ isbn, lang }),
          };
      // 조회 중에 사용자가 창을 닫았다면 결과를 띄우지 않습니다.
      setSheet((prev) => (prev.kind === 'loading' && prev.isbn === isbn ? next : prev));
      return true;
    },
    [toast],
  );

  const openScanner = useCallback(() => setSheet({ kind: 'scanner' }), []);
  const newBook = useCallback(
    (partial?: Partial<Book>) => setSheet({ kind: 'bookForm', draft: emptyBook(partial), thenLog: true }),
    [],
  );
  const editBook = useCallback((book: Book) => setSheet({ kind: 'bookForm', draft: book, thenLog: false }), []);
  const openLog = useCallback((bookId: number) => setSheet({ kind: 'logForm', bookId }), []);
  const editLog = useCallback((log: ReadingLog) => setSheet({ kind: 'logForm', bookId: log.bookId, log }), []);
  const close = useCallback(() => setSheet({ kind: 'none' }), []);

  const api = useMemo<FlowApi>(
    () => ({
      sheet,
      activeChildId,
      setActiveChildId,
      openScanner,
      handleIsbn,
      newBook,
      editBook,
      openLog,
      editLog,
      close,
      toast,
      toastMsg,
    }),
    [sheet, activeChildId, setActiveChildId, openScanner, handleIsbn, newBook, editBook, openLog, editLog, close, toast, toastMsg],
  );

  return <FlowContext.Provider value={api}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowApi {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('FlowProvider missing');
  return ctx;
}
