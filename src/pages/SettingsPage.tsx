import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setSetting, SETTING } from '../lib/db';
import { exportBackup, parseBackup, restoreBackup } from '../lib/backup';
import { deleteChild } from '../lib/repo';
import type { Child } from '../lib/types';
import { ChildEditor, gradeText } from '../components/ChildEditor';
import { useFlow } from '../flow';
import { useKids } from '../hooks';

export function SettingsPage() {
  const { toast } = useFlow();
  const kids = useKids() ?? [];
  const [editing, setEditing] = useState<Child | 'new' | null>(null);
  const counts = useLiveQuery(async () => ({
    books: await db.books.count(),
    logs: await db.logs.count(),
  }));
  const lastBackup = useLiveQuery(() => db.settings.get(SETTING.lastBackupAt), []);
  const lookupSetting = useLiveQuery(() => db.settings.get(SETTING.lookupUrl), []);
  const [lookupUrl, setLookupUrl] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLookupUrl((lookupSetting?.value as string) ?? '');
  }, [lookupSetting]);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const removeKid = async (k: Child) => {
    const n = await db.logs.where('childId').equals(k.id!).count();
    if (!confirm(`${k.name}을(를) 삭제할까요?${n ? ` 이 아이의 기록 ${n}건도 함께 삭제됩니다.` : ''}`)) return;
    await deleteChild(k.id!);
    const active = await db.settings.get(SETTING.activeChildId);
    if (active?.value === k.id) await setSetting(SETTING.activeChildId, null);
  };

  const doExport = async () => {
    const r = await exportBackup();
    if (r !== 'cancelled') toast(r === 'shared' ? '백업 파일을 공유했습니다.' : '백업 파일을 내려받았습니다.');
  };

  const doImport = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      const msg = `백업(${data.exportedAt.slice(0, 10)}): 아이 ${data.children.length}명, 책 ${data.books.length}권, 기록 ${data.logs.length}건\n\n지금 데이터를 모두 지우고 이 백업으로 바꿀까요?`;
      if (!confirm(msg)) return;
      await restoreBackup(data);
      await setSetting(SETTING.activeChildId, null);
      toast('복원했습니다.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveLookup = async () => {
    const v = lookupUrl.trim().replace(/\/+$/, '');
    if (v && !/^https:\/\//.test(v)) {
      toast('https:// 로 시작하는 주소를 입력하세요.');
      return;
    }
    await setSetting(SETTING.lookupUrl, v);
    toast(v ? '조회 서버를 저장했습니다.' : '조회 서버를 사용하지 않습니다.');
  };

  const requestPersist = async () => {
    const ok = await navigator.storage?.persist?.();
    setPersisted(!!ok);
    toast(ok ? '이 기기에 영구 저장하도록 설정했습니다.' : '브라우저가 영구 저장을 허용하지 않았습니다. 홈 화면에 추가해서 사용하세요.');
  };

  const lastBackupAt = lastBackup?.value as number | undefined;

  return (
    <>
      <header className="page-header">
        <h1>설정</h1>
      </header>

      <section className="section">
        <h2 className="section-title">아이</h2>
        <div className="list">
          {kids.map((k) =>
            editing !== 'new' && editing?.id === k.id ? (
              <ChildEditor key={k.id} child={k} usedColors={[]} onDone={() => setEditing(null)} />
            ) : (
              <div className="log-row" key={k.id} style={{ ['--child-color' as string]: k.color, alignItems: 'center' }}>
                <div className="meta">
                  <strong>{k.name}</strong> <span className="small muted">{gradeText(k.birthYear)}</span>
                </div>
                <button type="button" className="btn sm ghost" onClick={() => setEditing(k)}>
                  수정
                </button>
                <button type="button" className="btn sm ghost danger" onClick={() => removeKid(k)}>
                  삭제
                </button>
              </div>
            ),
          )}
          {editing === 'new' ? (
            <ChildEditor usedColors={kids.map((k) => k.color)} onDone={() => setEditing(null)} />
          ) : (
            <button type="button" className="btn" onClick={() => setEditing('new')}>
              + 아이 추가
            </button>
          )}
        </div>
      </section>

      <hr className="sep" />

      <section className="section stack">
        <h2 className="section-title">백업</h2>
        <p className="small muted" style={{ margin: 0 }}>
          기록은 이 폰의 브라우저에만 저장됩니다. 폰을 바꾸거나 앱 데이터가 지워지면 복구할 수 없으니 정기적으로 백업 파일을
          카톡·드라이브 등에 보관하세요.
          <br />
          현재: 책 {counts?.books ?? 0}권 · 기록 {counts?.logs ?? 0}건 · 마지막 백업{' '}
          {lastBackupAt ? new Date(lastBackupAt).toLocaleString('ko-KR') : '없음'}
        </p>
        <div className="grid-2">
          <button type="button" className="btn primary" onClick={doExport}>
            백업 내보내기
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            백업에서 복원
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
        />
        <div className="small muted">
          저장소 보호: {persisted === null ? '확인 불가' : persisted ? '영구 저장 켜짐 ✅' : '꺼짐'}{' '}
          {!persisted && (
            <button type="button" className="btn sm" onClick={requestPersist}>
              영구 저장 요청
            </button>
          )}
        </div>
      </section>

      <hr className="sep" />

      <section className="section stack">
        <h2 className="section-title">책 정보 조회 서버 (선택)</h2>
        <p className="small muted" style={{ margin: 0 }}>
          비워두면 Google Books·Open Library에서 찾습니다(영어책 위주). 한글책을 잘 찾으려면 국립중앙도서관·카카오 조회 서버(README
          참고)를 배포한 뒤 주소를 넣으세요.
        </p>
        <input
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://book-lookup.이름.workers.dev"
          value={lookupUrl}
          onChange={(e) => setLookupUrl(e.target.value)}
          aria-label="조회 서버 주소"
        />
        <button type="button" className="btn" onClick={saveLookup}>
          저장
        </button>
      </section>

      <p className="small muted" style={{ textAlign: 'center', marginTop: 32 }}>
        우리집 독서기록 v{__APP_VERSION__}
      </p>
    </>
  );
}
