import type { Activity, BookFormat, Lang, LevelSystem, Ownership, Reaction } from './types';

export const ACTIVITY_LABEL: Record<Activity, string> = {
  intensive: '집중듣기',
  background: '흘려듣기',
  silent: '읽기(묵독)',
  aloud: '읽기(낭독)',
  readTo: '읽어주기',
};

export const ACTIVITIES_BY_LANG: Record<Lang, Activity[]> = {
  en: ['intensive', 'background', 'silent', 'aloud', 'readTo'],
  ko: ['silent', 'aloud', 'readTo'],
};

export const REACTION_LABEL: Record<Reaction, { emoji: string; label: string }> = {
  love: { emoji: '😍', label: '좋아함' },
  ok: { emoji: '🙂', label: '보통' },
  dislike: { emoji: '😑', label: '싫어함' },
};

export const LANG_LABEL: Record<Lang, string> = { en: '영어', ko: '한글' };

export const FORMAT_LABEL: Record<BookFormat, string> = {
  picture: '그림책',
  reader: '리더스',
  chapter: '챕터북',
  info: '지식책',
  media: 'DVD·음원',
  other: '기타',
};

export const OWNERSHIP_LABEL: Record<Ownership, string> = {
  own: '소장',
  library: '도서관',
  other: '기타',
};

export const LEVEL_LABEL: Record<LevelSystem, string> = {
  AR: 'AR',
  LEXILE: 'Lexile',
  GRADE: '권장 학년·연령',
  HOME: '우리집 단계',
};

export const CHILD_COLORS = ['#e07a5f', '#3d85c6', '#81b29a', '#f2b84b', '#9b72cf', '#e86a92'];

export const QUICK_MINUTES = [5, 10, 20, 30, 60];
