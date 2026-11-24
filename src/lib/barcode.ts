/**
 * 바코드 인식기.
 * - 폰에 내장 인식기(BarcodeDetector, 주로 Android Chrome)가 있으면 그것을 씁니다.
 * - 없으면(iPhone 등) zxing-cpp를 WebAssembly로 컴파일한 zxing-wasm을 씁니다.
 */
type Source = HTMLCanvasElement;
export type Detect = (canvas: Source) => Promise<string[]>;

interface NativeDetector {
  detect(src: Source): Promise<{ rawValue: string }[]>;
}
interface NativeDetectorCtor {
  new (opts: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

let cached: Promise<{ detect: Detect; engine: 'native' | 'wasm' }> | null = null;

async function createNative(): Promise<Detect | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const formats = await Ctor.getSupportedFormats();
    if (!formats.includes('ean_13')) return null;
    const d = new Ctor({ formats: ['ean_13'] });
    return async (canvas) => (await d.detect(canvas)).map((r) => r.rawValue);
  } catch {
    return null;
  }
}

async function createWasm(): Promise<Detect> {
  const [{ prepareZXingModule, readBarcodes }, { default: wasmUrl }] = await Promise.all([
    import('zxing-wasm/reader'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  // wasm 파일을 CDN이 아닌 앱과 같은 곳에서 받아 오프라인에서도 동작하게 합니다.
  await prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    fireImmediately: true,
  });
  return async (canvas) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const results = await readBarcodes(img, { formats: ['EAN13'], tryHarder: true, maxNumberOfSymbols: 1 });
    return results.map((r) => r.text);
  };
}

export function getDetector() {
  cached ??= (async () => {
    const native = await createNative();
    if (native) return { detect: native, engine: 'native' as const };
    return { detect: await createWasm(), engine: 'wasm' as const };
  })();
  return cached;
}

/** 사진 파일에서 바코드를 찾습니다. 큰 사진은 몇 가지 크기로 줄여 가며 시도합니다. */
export async function detectInPhoto(file: Blob): Promise<string[]> {
  const { detect } = await getDetector();
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const longSide = Math.max(bitmap.width, bitmap.height);
    for (const target of [2400, 1600, 1000]) {
      const scale = Math.min(1, target / longSide);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const found = await detect(canvas);
      if (found.length) return found;
      if (scale === 1 && target !== 2400) break;
    }
    return [];
  } finally {
    bitmap.close();
  }
}
