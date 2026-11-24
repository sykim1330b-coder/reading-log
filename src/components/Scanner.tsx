import { useEffect, useRef, useState } from 'react';
import { detectInPhoto, getDetector } from '../lib/barcode';
import { listBackCameras, openCamera, saveDeviceId, savedDeviceId, shortLabel, type CameraInfo } from '../lib/camera';
import { normalizeIsbn } from '../lib/isbn';
import { useFlow } from '../flow';

interface ExtraCapabilities {
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
  focusMode?: string[];
}

function cameraErrorMessage(e: unknown): string {
  const name = (e as Error)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라를 허용하거나, 사진으로 인식 또는 ISBN 직접 입력을 이용하세요.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return '사용할 수 있는 카메라가 없습니다. 사진으로 인식하거나 ISBN을 직접 입력하세요.';
  }
  if (!window.isSecureContext) return '카메라는 https 주소에서만 사용할 수 있습니다.';
  return '카메라를 시작하지 못했습니다. 사진으로 인식하거나 ISBN을 직접 입력하세요.';
}

const SCAN_INTERVAL_MS = 60;
/** 인식에 넘기는 이미지의 최대 가로 크기. 4K 영상도 이 크기로 줄여 처리 속도를 유지합니다. */
const MAX_DECODE_WIDTH = 1920;

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}
const ImageCaptureCtor = (globalThis as unknown as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike })
  .ImageCapture;

export function Scanner() {
  const { close, handleIsbn, newBook, toast } = useFlow();
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<{ min: number; max: number; on: boolean } | null>(null);
  const [torch, setTorch] = useState<{ on: boolean } | null>(null);
  const [deviceId, setDeviceId] = useState<string | undefined>(savedDeviceId);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [info, setInfo] = useState('');

  const finish = (isbn: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    navigator.vibrate?.(60);
    trackRef.current?.stop();
    handleIsbn(isbn);
  };

  // 실시간 스캔
  useEffect(() => {
    if (!camOn) return;
    let stopped = false;
    let timer: number | undefined;
    let stream: MediaStream | null = null;
    const lastBad = { code: '', at: 0 };
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let frame = 0;

    (async () => {
      try {
        const [s, detector] = await Promise.all([
          // 기억해 둔 카메라가 없어졌으면 기본 뒷면 카메라로 엽니다.
          openCamera(deviceId).catch((e) => {
            if (!deviceId || (e as Error).name === 'NotAllowedError') throw e;
            saveDeviceId(undefined);
            return openCamera();
          }),
          getDetector(),
        ]);
        stream = s;
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        const track = s.getVideoTracks()[0];
        trackRef.current = track;
        const caps = (track.getCapabilities?.() ?? {}) as ExtraCapabilities;
        if (caps.focusMode?.includes('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
        }
        if (caps.zoom && caps.zoom.max >= 1.5) setZoom({ min: caps.zoom.min, max: caps.zoom.max, on: false });
        if (caps.torch) setTorch({ on: false });
        const settings = track.getSettings();
        setInfo(
          `${settings.width ?? '?'}×${settings.height ?? '?'} · ${shortLabel(track.label) || '카메라'} · ${
            detector.engine === 'native' ? '내장 인식기' : 'zxing'
          }`,
        );
        listBackCameras()
          .then((list) => !stopped && setCameras(list))
          .catch(() => {});

        const video = videoRef.current!;
        video.srcObject = s;
        await video.play().catch(() => {});

        const tick = async () => {
          if (stopped || doneRef.current) return;
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (vw && vh && video.readyState >= 2) {
            // 대부분은 가운데 넓은 영역만, 세 번에 한 번은 화면 전체를 봅니다.
            const full = frame++ % 3 === 2;
            const sx = full ? 0 : vw * 0.04;
            const sy = full ? 0 : vh * 0.2;
            const sw = full ? vw : vw * 0.92;
            const sh = full ? vh : vh * 0.6;
            const scale = Math.min(1, MAX_DECODE_WIDTH / sw);
            canvas.width = Math.round(sw * scale);
            canvas.height = Math.round(sh * scale);
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            try {
              for (const code of await detector.detect(canvas)) {
                const isbn = normalizeIsbn(code);
                if (isbn) return finish(isbn);
                if (lastBad.code !== code || Date.now() - lastBad.at > 3000) {
                  toast('책 ISBN 바코드가 아닙니다. 978/979로 시작하는 바코드를 비춰주세요.');
                  lastBad.code = code;
                  lastBad.at = Date.now();
                }
              }
            } catch {
              // 한 프레임 실패는 무시하고 계속합니다.
            }
          }
          timer = window.setTimeout(tick, SCAN_INTERVAL_MS);
        };
        tick();
      } catch (e) {
        if (!stopped) setError(cameraErrorMessage(e));
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, [camOn, deviceId]);

  // 사진 촬영을 취소하면(지원하는 브라우저) 실시간 스캔을 다시 켭니다.
  useEffect(() => {
    const input = photoRef.current;
    const onCancel = () => setCamOn(true);
    input?.addEventListener('cancel', onCancel);
    return () => input?.removeEventListener('cancel', onCancel);
  }, []);

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const current = trackRef.current?.getSettings().deviceId ?? deviceId;
    const idx = cameras.findIndex((c) => c.deviceId === current);
    const next = cameras[(idx + 1) % cameras.length];
    saveDeviceId(next.deviceId);
    setZoom(null);
    setTorch(null);
    setDeviceId(next.deviceId);
  };

  /** Android Chrome: 화면을 떠나지 않고 카메라 최대 화질로 한 장 찍어 인식합니다. */
  const snapHighRes = async () => {
    const track = trackRef.current;
    if (!track || !ImageCaptureCtor) return;
    setBusy(true);
    try {
      const blob = await new ImageCaptureCtor(track).takePhoto();
      const isbn = (await detectInPhoto(blob)).map(normalizeIsbn).find(Boolean);
      if (isbn) return finish(isbn);
      toast('바코드를 찾지 못했습니다. 바코드가 선명하게 보일 때 다시 눌러주세요.');
    } catch {
      toast('고화질 촬영을 지원하지 않습니다. 사진으로 인식을 이용하세요.');
    } finally {
      setBusy(false);
    }
  };

  const toggleZoom = () => {
    if (!zoom || !trackRef.current) return;
    const on = !zoom.on;
    const value = on ? Math.min(2, zoom.max) : Math.max(1, zoom.min);
    trackRef.current
      .applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] })
      .then(() => setZoom({ ...zoom, on }))
      .catch(() => toast('이 폰에서는 확대를 쓸 수 없습니다.'));
  };

  const toggleTorch = () => {
    if (!torch || !trackRef.current) return;
    const on = !torch.on;
    trackRef.current
      .applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      .then(() => setTorch({ on }))
      .catch(() => toast('이 폰에서는 플래시를 쓸 수 없습니다.'));
  };

  const openPhoto = () => {
    // 일부 폰(특히 iPhone)은 카메라를 동시에 쓸 수 없으므로 실시간 스캔을 멈춥니다.
    setCamOn(false);
    photoRef.current?.click();
  };

  const onPhoto = async (file?: File) => {
    if (photoRef.current) photoRef.current.value = '';
    if (!file) {
      setCamOn(true);
      return;
    }
    setBusy(true);
    try {
      const codes = await detectInPhoto(file);
      const isbn = codes.map(normalizeIsbn).find(Boolean);
      if (isbn) return finish(isbn);
      toast(
        codes.length
          ? '책 ISBN 바코드가 아닙니다. 978/979로 시작하는 바코드를 찍어주세요.'
          : '사진에서 바코드를 찾지 못했습니다. 바코드가 크고 선명하게 나오도록 다시 찍어주세요.',
      );
    } catch {
      toast('사진을 읽지 못했습니다. 다시 찍어주세요.');
    } finally {
      setBusy(false);
    }
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manual.trim()) return;
    const isbn = normalizeIsbn(manual);
    if (isbn) return finish(isbn);
    await handleIsbn(manual); // 잘못된 값이면 안내 메시지를 띄웁니다.
    setManual('');
  };

  return (
    <div className="scanner" role="dialog" aria-label="바코드 스캔">
      {camOn && <video ref={videoRef} playsInline muted autoPlay />}
      {camOn && !error && <div className="frame" aria-hidden />}
      <div className="top">
        <div>
          <strong>책 바코드 스캔</strong>
          {info && camOn && <div className="cam-info">{info}</div>}
        </div>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={close}>
          ✕
        </button>
      </div>

      {!camOn && (
        <div className="paused">
          {busy ? (
            <>
              <div className="spinner" />
              <div>사진에서 바코드를 찾는 중…</div>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setCamOn(true)}>
              실시간 스캔 다시 켜기
            </button>
          )}
        </div>
      )}

      <div className="bottom">
        {error ? (
          <div className="error">{error}</div>
        ) : (
          camOn && (
            <div className="hint">
              바코드를 네모 안에 <b>가로로 크게</b> 비춰주세요.
              <br />
              <span className="small">흐리게 보이면 책을 조금 멀리(15~20cm) 두세요.</span>
            </div>
          )
        )}

        <div className="tools">
          {zoom && camOn && (
            <button type="button" className="tool" aria-pressed={zoom.on} onClick={toggleZoom}>
              🔍 {zoom.on ? '2배 끄기' : '2배 확대'}
            </button>
          )}
          {torch && camOn && (
            <button type="button" className="tool" aria-pressed={torch.on} onClick={toggleTorch}>
              🔦 플래시
            </button>
          )}
          {cameras.length > 1 && camOn && (
            <button type="button" className="tool" onClick={switchCamera}>
              🔄 카메라 전환
            </button>
          )}
          {ImageCaptureCtor && camOn && !error && (
            <button type="button" className="tool" onClick={snapHighRes} disabled={busy}>
              {busy ? '찾는 중…' : '⚡ 고화질 찰칵'}
            </button>
          )}
          <button type="button" className="tool primary" onClick={openPhoto} disabled={busy}>
            📸 사진으로 인식
          </button>
        </div>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          aria-label="바코드 사진"
          onChange={(e) => onPhoto(e.target.files?.[0])}
        />

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
        <button type="button" className="btn ghost block" style={{ color: '#fff', marginTop: 8 }} onClick={() => newBook()}>
          바코드 없는 책·DVD·음원 직접 등록
        </button>
      </div>
    </div>
  );
}
