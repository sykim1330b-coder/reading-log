import { describe, expect, it } from 'vitest';
import { isKoreanPublisher, normalizeIsbn, readerTarget } from '../src/lib/isbn';

describe('normalizeIsbn', () => {
  it('ISBN-13을 검증합니다', () => {
    expect(normalizeIsbn('9788937460449')).toBe('9788937460449');
    expect(normalizeIsbn('978-0-14-032872-1')).toBe('9780140328721');
    expect(normalizeIsbn('9788937460440')).toBeNull(); // 체크섬 오류
    expect(normalizeIsbn('8801234567893')).toBeNull(); // 978/979가 아닌 EAN
  });
  it('ISBN-10을 13자리로 바꿉니다', () => {
    expect(normalizeIsbn('0-14-032872-6')).toBe('9780140328721');
    expect(normalizeIsbn('080442957X')).toBe('9780804429573');
  });
});

describe('한국 도서 판별·부가기호', () => {
  it('978-89와 979-11은 한국 발행', () => {
    expect(isKoreanPublisher('9788937460449')).toBe(true);
    expect(isKoreanPublisher('9791160509000')).toBe(true);
    expect(isKoreanPublisher('9780140328721')).toBe(false);
  });
  it('부가기호 첫 자리로 독자대상을 알려줍니다', () => {
    expect(readerTarget('77810')).toBe('아동');
    expect(readerTarget('43810')).toBe('청소년');
    expect(readerTarget('03810')).toBe('교양');
    expect(readerTarget('')).toBeUndefined();
    expect(readerTarget('7781')).toBeUndefined();
  });
});
