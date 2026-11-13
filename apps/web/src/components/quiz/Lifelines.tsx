import { Lock, Percent, X as Multiply, type LucideIcon } from 'lucide-react';
import { QUIZ_DOUBLE_MIN_LEVEL, QUIZ_LIFELINES, type LifelineKind } from '../../lib/types';

const META: Record<LifelineKind, { label: string; hint: string; icon: LucideIcon }> = {
  fifty: { label: '50:50', hint: 'Bỏ 2 đáp án sai', icon: Percent },
  double: { label: 'Nhân đôi', hint: 'Câu này đúng thì x2 điểm', icon: Multiply },
};

export interface LifelinesProps {
  /** Quyền đã dùng → ở câu số mấy. Có mặt là hết quyền. */
  used: Partial<Record<LifelineKind, number>>;
  /** Quyền đang có hiệu lực ở CÂU NÀY (đã bấm, kết quả đang hiện). */
  activeNow?: Partial<Record<LifelineKind, boolean>>;
  /** Mức của câu đang mở (1 dễ, 2 vừa, 3 khó) — quyết định x2 có mở khoá không. */
  level: 1 | 2 | 3;
  /** Khoá cả hàng: đã chốt đáp án, đã công bố, hoặc đang chờ server. */
  disabled: boolean;
  onUse: (kind: LifelineKind) => void;
}

/**
 * Hai quyền trợ giúp, mỗi quyền MỘT lần trong cả lượt.
 *
 * Đã dùng thì gạch bỏ và ghi "câu N" — người chơi cần nhớ mình còn quyền nào để
 * dành cho câu khó, và một nút xám trơn không nói được điều đó.
 *
 * Nhân đôi bị KHOÁ ở câu dễ và nói thẳng lý do ("từ mức Vừa") kèm ổ khoá, thay vì
 * chỉ xám đi: nút xám mà không giải thích là bẫy, người chơi sẽ tưởng nó hỏng. Cùng
 * hằng số `QUIZ_DOUBLE_MIN_LEVEL` với server, nên nút khoá khi nào thì server từ
 * chối đúng khi đó.
 */
export function Lifelines({ used, activeNow = {}, level, disabled, onUse }: LifelinesProps) {
  return (
    <ul className="grid grid-cols-2 gap-3" aria-label="Quyền trợ giúp">
      {QUIZ_LIFELINES.map((kind) => {
        const { label, hint, icon: Icon } = META[kind];
        const spent = used[kind] !== undefined;
        const live = !!activeNow[kind];
        const locked = kind === 'double' && level < QUIZ_DOUBLE_MIN_LEVEL;
        const note = spent
          ? `đã dùng ở câu ${(used[kind] ?? 0) + 1}`
          : locked
            ? 'mở từ câu mức Vừa'
            : live
              ? 'đang bật'
              : hint;
        return (
          <li key={kind}>
            <button
              type="button"
              onClick={() => onUse(kind)}
              disabled={disabled || spent || locked}
              aria-label={`${label}: ${note}`}
              className={`btn btn-sm w-full flex-col !gap-1 !py-2.5 text-center ${
                live ? 'btn-accent' : 'btn-ghost'
              }`}
            >
              <span className="flex items-center gap-2">
                {locked ? (
                  <Lock aria-hidden="true" className="h-5 w-5" />
                ) : (
                  <Icon aria-hidden="true" className={`h-5 w-5 ${spent ? 'opacity-50' : ''}`} />
                )}
                <span className={`text-base ${spent ? 'line-through' : ''}`}>{label}</span>
              </span>
              <span className="text-[0.7rem] font-semibold normal-case leading-tight opacity-80">{note}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
