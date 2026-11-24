import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setSetting, SETTING } from '../lib/db';
import { checkKakaoKey, checkNlKey } from '../lib/lookup';
import { useFlow } from '../flow';

/** 한글책 조회용 API 키 입력. 키는 이 기기에만 저장되고 백업 파일에는 들어가지 않습니다. */
export function KeySettings() {
  const { toast } = useFlow();
  const kakaoSaved = useLiveQuery(() => db.settings.get(SETTING.kakaoKey), []);
  const nlSaved = useLiveQuery(() => db.settings.get(SETTING.nlKey), []);
  const [kakao, setKakao] = useState('');
  const [nl, setNl] = useState('');
  const [result, setResult] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => setKakao((kakaoSaved?.value as string) ?? ''), [kakaoSaved]);
  useEffect(() => setNl((nlSaved?.value as string) ?? ''), [nlSaved]);

  const save = async () => {
    const k = kakao.trim();
    const n = nl.trim();
    await Promise.all([setSetting(SETTING.kakaoKey, k), setSetting(SETTING.nlKey, n)]);
    if (!k && !n) {
      setResult([]);
      toast('키를 지웠습니다.');
      return;
    }
    setChecking(true);
    setResult(await Promise.all([k ? checkKakaoKey(k) : null, n ? checkNlKey(n) : null]).then((r) => r.filter(Boolean) as string[]));
    setChecking(false);
  };

  return (
    <section className="section stack">
      <h2 className="section-title">한글책 정보 조회 (API 키)</h2>
      <p className="small muted" style={{ margin: 0 }}>
        키가 없으면 Google Books·Open Library에서만 찾아 한글책은 대부분 나오지 않습니다. <b>카카오 키 하나만 넣어도</b> 한글책이
        검색됩니다. 키는 이 폰에만 저장되고 백업 파일에는 포함되지 않습니다.
      </p>

      <label className="field">
        <span className="label">카카오 REST API 키 (추천)</span>
        <input
          className="input"
          autoComplete="off"
          spellCheck={false}
          placeholder="32자리 영문·숫자"
          value={kakao}
          onChange={(e) => setKakao(e.target.value)}
        />
      </label>
      <details className="small muted">
        <summary>카카오 키 받는 법 (5분)</summary>
        <ol style={{ paddingLeft: 18, margin: '6px 0' }}>
          <li>
            <a href="https://developers.kakao.com" target="_blank" rel="noopener">
              developers.kakao.com
            </a>
            에 카카오 계정으로 로그인
          </li>
          <li>내 애플리케이션 → 애플리케이션 추가하기 (앱 이름 예: 독서기록)</li>
          <li>만든 앱 → 앱 키(플랫폼 키) 화면의 <b>REST API 키</b>를 복사해 위에 붙여넣기</li>
        </ol>
      </details>

      <label className="field">
        <span className="label">국립중앙도서관 인증키 (선택: 부가기호·독자대상 표시)</span>
        <input
          className="input"
          autoComplete="off"
          spellCheck={false}
          placeholder="인증키"
          value={nl}
          onChange={(e) => setNl(e.target.value)}
        />
      </label>
      <details className="small muted">
        <summary>국립중앙도서관 인증키 받는 법</summary>
        <ol style={{ paddingLeft: 18, margin: '6px 0' }}>
          <li>
            <a href="https://www.nl.go.kr/seoji/" target="_blank" rel="noopener">
              국립중앙도서관 ISBN·ISSN 서지정보
            </a>
            에서 회원가입 후 로그인
          </li>
          <li>메뉴의 Open API → 인증키 신청 (승인까지 시간이 걸릴 수 있음)</li>
          <li>발급된 인증키를 위에 붙여넣기</li>
        </ol>
      </details>

      <button type="button" className="btn primary" onClick={save} disabled={checking}>
        {checking ? '확인 중…' : '저장하고 연결 확인'}
      </button>
      {result.map((r) => (
        <div key={r} className="small" role="status">
          {r}
        </div>
      ))}
    </section>
  );
}
