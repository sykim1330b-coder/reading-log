/**
 * 카메라 열기·고르기.
 * 폰마다 기본으로 잡히는 뒷면 카메라와 해상도가 달라서, 높은 해상도부터 차례로 요청하고
 * 뒷면 카메라가 여러 개면 바꿔 가며 쓸 수 있게 합니다. 고른 카메라는 이 기기에 기억합니다.
 */
const DEVICE_KEY = 'scanner.deviceId';

export function savedDeviceId(): string | undefined {
  try {
    return localStorage.getItem(DEVICE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function saveDeviceId(id: string | undefined) {
  try {
    if (id) localStorage.setItem(DEVICE_KEY, id);
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    // 저장하지 못해도 동작에는 문제없습니다.
  }
}

/** 높은 해상도부터 요청하고, 거절되면 한 단계씩 낮춥니다. */
export async function openCamera(deviceId?: string): Promise<MediaStream> {
  const base: MediaTrackConstraints = deviceId
    ? { deviceId: { exact: deviceId } }
    : { facingMode: { ideal: 'environment' } };
  const attempts: MediaTrackConstraints[] = [
    { ...base, width: { ideal: 3840 }, height: { ideal: 2160 } },
    { ...base, width: { ideal: 1920 }, height: { ideal: 1080 } },
    base,
  ];
  let lastError: unknown;
  for (const video of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      await raiseResolution(stream.getVideoTracks()[0]);
      return stream;
    } catch (e) {
      lastError = e;
      // 권한 거부는 다시 시도해도 같으므로 바로 알립니다.
      if ((e as Error).name === 'NotAllowedError' || (e as Error).name === 'SecurityError') throw e;
    }
  }
  throw lastError;
}

/** 시작 후에도 해상도가 낮게 잡혔다면 한 번 더 올려 봅니다. */
async function raiseResolution(track: MediaStreamTrack) {
  const s = track.getSettings();
  const pixels = (s.width ?? 0) * (s.height ?? 0);
  if (pixels >= 1920 * 1080 * 0.9) return;
  for (const [w, h] of [
    [3840, 2160],
    [1920, 1080],
  ]) {
    try {
      await track.applyConstraints({ width: { ideal: w }, height: { ideal: h } });
      const t = track.getSettings();
      if ((t.width ?? 0) * (t.height ?? 0) > pixels) return;
    } catch {
      // 지원하지 않으면 그대로 씁니다.
    }
  }
}

export interface CameraInfo {
  deviceId: string;
  label: string;
}

const BACK = /back|rear|environment|후면|facing back/i;
const FRONT = /front|user|전면|facing front/i;

/** 뒷면 카메라 목록 (권한을 받은 뒤라야 이름이 보입니다) */
export async function listBackCameras(): Promise<CameraInfo[]> {
  const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  const back = all.filter((d) => BACK.test(d.label));
  const list = back.length ? back : all.filter((d) => !FRONT.test(d.label));
  return list.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `카메라 ${i + 1}` }));
}

/** 화면에 보여 줄 짧은 카메라 이름 */
export function shortLabel(label: string): string {
  const s = label.replace(/\s*\(.*?\)\s*/g, ' ').replace(/,?\s*facing back/i, '').trim();
  // 의미 없는 긴 ID 형태의 이름은 보여 주지 않습니다.
  if (!/\s/.test(s) && s.length > 24) return '';
  return s.length > 32 ? `${s.slice(0, 31)}…` : s;
}
