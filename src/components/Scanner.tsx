import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { normalizeIsbn } from '../lib/isbn';
import { useFlow } from '../flow';

export function createIsbnReader() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
}

function cameraErrorMessage(e: unknown): string {
  const name = (e as Error)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라를 허용하거나, 아래에 ISBN을 직접 입력하세요.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return '사용할 수 있는 카메라가 없습니다. ISBN을 직접 입력하세요.';
  }
  if (!window.isSecureContext) {
    return '카메라는 https 주소에서만 사용할 수 있습니다.';
  }
  return '카메라를 시작하지 못했습니다. ISBN을 직접 입력하세요.';
}

export function Scanner() {
  const { close, handleIsbn, newBook, toast } = useFlow();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    let cancelled = false;
    const reader = createIsbnReader();
    const lastBad = { code: '', at: 0 };

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        videoRef.current!,
        (result) => {
          if (!result || doneRef.current) return;
          const text = result.getText();
          const isbn = normalizeIsbn(text);
          if (!isbn) {
            // ISBN이 아닌 EAN-13(가격 바코드 등)은 무시하고 안내만 합니다.
            if (lastBad.code !== text || Date.now() - lastBad.at > 3000) {
              toast('책 ISBN 바코드가 아닙니다. 978/979로 시작하는 바코드를 비춰주세요.');
              lastBad.code = text;
              lastBad.at = Date.now();
            }
            return;
          }
          doneRef.current = true;
          navigator.vibrate?.(60);
          controlsRef.current?.stop();
          handleIsbn(isbn);
        },
      )
      .then((controls) => {
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      })
      .catch((e) => {
        if (!cancelled) setError(cameraErrorMessage(e));
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [handleIsbn, toast]);

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manual.trim()) return;
    controlsRef.current?.stop();
    const ok = await handleIsbn(manual);
    if (!ok) setManual('');
  };

  return (
    <div className="scanner" role="dialog" aria-label="바코드 스캔">
      <video ref={videoRef} playsInline muted autoPlay />
      {!error && <div className="frame" aria-hidden />}
      <div className="top">
        <strong>책 바코드 스캔</strong>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={close}>
          ✕
        </button>
      </div>
      <div className="bottom">
        {error ? (
          <div className="error">{error}</div>
        ) : (
          <div className="hint">책 뒷면의 ISBN 바코드를 네모 안에 맞춰주세요</div>
        )}
        <form className="manual" onSubmit={submitManual}>
          <input
            className="input"
            inputMode="numeric"
            placeholder="ISBN 직접 입력 (13자리)"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            aria-label="ISBN 직접 입력"
          />
          <button className="btn primary" type="submit">
            확인
          </button>
        </form>
        <button
          type="button"
          className="btn ghost block"
          style={{ color: '#fff', marginTop: 8 }}
          onClick={() => newBook()}
        >
          바코드 없는 책·DVD·음원 직접 등록
        </button>
      </div>
    </div>
  );
}
