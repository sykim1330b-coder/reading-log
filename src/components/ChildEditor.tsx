import { useState } from 'react';
import { db } from '../lib/db';
import { CHILD_COLORS } from '../lib/constants';
import type { Child } from '../lib/types';

/** 아이 추가·수정 폼. 저장하면 onDone을 부릅니다. */
export function ChildEditor({ child, usedColors, onDone }: { child?: Child; usedColors: string[]; onDone: () => void }) {
  const [name, setName] = useState(child?.name ?? '');
  const [birthYear, setBirthYear] = useState(child?.birthYear ? String(child.birthYear) : '');
  const [color, setColor] = useState(child?.color ?? CHILD_COLORS.find((c) => !usedColors.includes(c)) ?? CHILD_COLORS[0]);
  const thisYear = new Date().getFullYear();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const y = Number(birthYear);
    const data = {
      name: name.trim(),
      birthYear: y >= 1990 && y <= thisYear ? y : undefined,
      color,
    };
    if (child?.id) await db.children.update(child.id, data);
    else await db.children.add({ ...data, createdAt: Date.now() });
    onDone();
  };

  return (
    <form className="card stack" onSubmit={save}>
      <div className="grid-2">
        <label className="field">
          <span className="label">이름</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span className="label">출생연도</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            placeholder={String(thisYear - 7)}
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
          />
        </label>
      </div>
      <div className="field">
        <span className="label">색상</span>
        <div className="chips">
          {CHILD_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className="chip"
              aria-label={`색상 ${c}`}
              aria-pressed={color === c}
              style={{ background: c, borderColor: color === c ? 'var(--text)' : c, borderWidth: 3, width: 36, padding: 0 }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      <div className="row">
        <button className="btn primary" type="submit">
          {child ? '저장' : '추가'}
        </button>
        <button className="btn ghost" type="button" onClick={onDone}>
          취소
        </button>
      </div>
    </form>
  );
}

/** 학년 표시: 출생연도+7년에 초등 1학년으로 봅니다(1·2월생 조기입학은 고려하지 않음). */
export function gradeText(birthYear?: number): string | undefined {
  if (!birthYear) return undefined;
  const g = new Date().getFullYear() - birthYear - 6;
  if (g >= 1 && g <= 6) return `초${g}`;
  if (g >= 7 && g <= 9) return `중${g - 6}`;
  if (g >= 10 && g <= 12) return `고${g - 9}`;
  if (g <= 0) return `${birthYear}년생`;
  return undefined;
}
