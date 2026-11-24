export type Lang = 'en' | 'ko';

export type LevelSystem = 'AR' | 'LEXILE' | 'GRADE' | 'HOME';

export interface Level {
  system: LevelSystem;
  value: string;
}

export type BookFormat = 'picture' | 'reader' | 'chapter' | 'info' | 'media' | 'other';
export type Ownership = 'own' | 'library' | 'other';

export interface Child {
  id?: number;
  name: string;
  birthYear?: number;
  color: string;
  createdAt: number;
}

export interface Book {
  id?: number;
  isbn?: string;
  title: string;
  author?: string;
  publisher?: string;
  coverUrl?: string;
  lang: Lang;
  /** ISBN 부가기호 5자리 (국립중앙도서관 조회 시) */
  addCode?: string;
  levels: Level[];
  series?: string;
  format?: BookFormat;
  ownership?: Ownership;
  memo?: string;
  createdAt: number;
  updatedAt: number;
}

export type Activity = 'intensive' | 'background' | 'silent' | 'aloud' | 'readTo';
export type Reaction = 'love' | 'ok' | 'dislike';

export interface ReadingLog {
  id?: number;
  /** YYYY-MM-DD (현지 날짜) */
  date: string;
  childId: number;
  bookId: number;
  activity: Activity;
  minutes?: number;
  count: number;
  reaction?: Reaction;
  memo?: string;
  createdAt: number;
}
