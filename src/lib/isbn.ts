/** 입력에서 숫자(와 끝자리 X)만 남깁니다. */
export function cleanIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn13(isbn: string): boolean {
  if (!/^97[89]\d{10}$/.test(isbn)) return false;
  const sum = isbn
    .slice(0, 12)
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}

export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  const sum = isbn
    .split('')
    .reduce((acc, c, i) => acc + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
  return sum % 11 === 0;
}

export function isbn10to13(isbn10: string): string {
  const body = '978' + isbn10.slice(0, 9);
  const sum = body.split('').reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return body + ((10 - (sum % 10)) % 10);
}

/** 올바른 ISBN이면 ISBN-13으로 정규화하고, 아니면 null을 돌려줍니다. */
export function normalizeIsbn(raw: string): string | null {
  const c = cleanIsbn(raw);
  if (c.length === 13 && isValidIsbn13(c)) return c;
  if (c.length === 10 && isValidIsbn10(c)) return isbn10to13(c);
  return null;
}

/** 한국 발행 도서(978-89, 979-11)인지 추정합니다. 언어 기본값을 정할 때만 씁니다. */
export function isKoreanPublisher(isbn13: string): boolean {
  return isbn13.startsWith('97889') || isbn13.startsWith('97911');
}

/** ISBN 부가기호 첫 자리(독자대상기호)의 의미 */
const READER_TARGET: Record<string, string> = {
  '0': '교양',
  '1': '실용',
  '4': '청소년',
  '5': '중고등 학습참고서',
  '6': '초등 학습참고서',
  '7': '아동',
  '9': '전문',
};

export function readerTarget(addCode?: string): string | undefined {
  if (!addCode || !/^\d{5}$/.test(addCode)) return undefined;
  return READER_TARGET[addCode[0]];
}
