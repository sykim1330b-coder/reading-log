import { describe, expect, it } from 'vitest';
// @ts-expect-error 타입 선언 없는 JS 모듈
import { merge, parseKakao, parseNl } from '../worker/index.js';

const nl = {
  TOTAL_COUNT: '1',
  docs: [{ TITLE: '마당을 나온 암탉 ', AUTHOR: '황선미 지음', PUBLISHER: '사계절', EA_ADD_CODE: '73810', TITLE_URL: '' }],
};
const kakao = {
  documents: [
    {
      title: '마당을 나온 암탉',
      authors: ['황선미'],
      publisher: '사계절',
      thumbnail: 'https://search1.kakaocdn.net/thumb/x.jpg',
    },
  ],
};

describe('worker', () => {
  it('국립중앙도서관 응답에서 부가기호를 읽습니다', () => {
    expect(parseNl(nl)).toMatchObject({ title: '마당을 나온 암탉', addCode: '73810' });
    expect(parseNl({ docs: [] })).toBeNull();
  });
  it('카카오를 우선하고 부가기호는 국립중앙도서관에서 합칩니다', () => {
    expect(merge(parseNl(nl), parseKakao(kakao))).toEqual({
      title: '마당을 나온 암탉',
      author: '황선미',
      publisher: '사계절',
      coverUrl: 'https://search1.kakaocdn.net/thumb/x.jpg',
      addCode: '73810',
      source: '카카오·국립중앙도서관',
    });
    expect(merge(null, null)).toBeNull();
  });
});
