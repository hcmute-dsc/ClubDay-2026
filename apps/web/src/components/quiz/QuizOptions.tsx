import { Check, X } from 'lucide-react';
import { QUIZ_OPTION_LETTERS } from '../../lib/types';

export interface QuizOptionsProps {
  options: string[];
  /** Ô người chơi đã chốt, `null` = chưa chọn. */
  picked: number | null;
  /** Ô bị 50:50 loại. */
  hidden?: number[];
  /** Đáp án đúng — CHỈ truyền khi BTC đã công bố. Có giá trị là bước sang pha reveal. */
  correct?: number | undefined;
  /** Số người chọn từng ô — hiện ở pha reveal. */
  distribution?: number[] | undefined;
  /** Không truyền = chỉ để xem (màn hình chiếu của BTC). */
  onPick?: (index: number) => void;
  disabled?: boolean;
  /** `xl` cho màn hình chiếu. */
  size?: 'md' | 'xl';
}

/**
 * Mỗi ô một màu + chữ cái A–D. Cố tình tránh xanh lá / đỏ ở trạng thái thường:
 * hai màu đó dành riêng cho "đúng" / "sai" khi công bố.
 */
const TONES = [
  'var(--color-secondary)',
  'var(--color-math)',
  'var(--color-accent)',
  'var(--color-draw)',
] as const;

/**
 * Bốn ô đáp án A/B/C/D — dùng cho cả điện thoại (bấm được) lẫn màn hình chiếu
 * (chỉ xem), nên người chơi nhìn lên màn hình và nhìn xuống điện thoại thấy
 * cùng một bộ màu và chữ cái.
 *
 * Màu đặt bằng INLINE STYLE vì `.btn:disabled` đổi nền về xám và thắng mọi class
 * tiện ích: ô vừa bấm cũng `disabled` trong lúc chờ, mà đó lại là ô cần sáng nhất.
 */
export function QuizOptions({
  options,
  picked,
  hidden = [],
  correct,
  distribution,
  onPick,
  disabled = false,
  size = 'md',
}: QuizOptionsProps) {
  const revealed = correct !== undefined;
  const xl = size === 'xl';

  return (
    <div className={`grid grid-cols-1 gap-3 ${xl ? 'md:grid-cols-2 md:gap-5' : 'sm:grid-cols-2'}`}>
      {options.map((text, i) => {
        const isHidden = hidden.includes(i);
        const isPicked = picked === i;
        const isCorrect = revealed && i === correct;
        const isWrongPick = revealed && isPicked && i !== correct;
        const interactive = !!onPick && !disabled && !revealed && !isHidden && picked === null;

        // Công bố rồi: ô đúng xanh, ô mình chọn sai đỏ, còn lại chìm xuống.
        const background = isCorrect
          ? 'var(--color-correct)'
          : isWrongPick
            ? 'var(--color-wrong)'
            : (TONES[i % TONES.length] as string);
        const dim = isHidden || (revealed && !isCorrect && !isWrongPick) || (picked !== null && !isPicked && !revealed);

        const body = (
          <>
            <span
              aria-hidden="true"
              className={`grid shrink-0 place-items-center border-[3px] border-ink bg-ink font-display font-black text-white ${
                xl ? 'h-14 w-14 text-3xl' : 'h-10 w-10 text-xl'
              }`}
            >
              {QUIZ_OPTION_LETTERS[i]}
            </span>
            <span
              className={`min-w-0 flex-1 text-left font-bold leading-snug ${
                xl ? 'text-2xl lg:text-3xl' : 'text-base sm:text-lg'
              } ${isHidden ? 'line-through' : ''}`}
            >
              {isHidden ? '— đã loại —' : text}
            </span>

            {/* Biểu tượng kết quả: không dựa riêng vào màu cho người mù màu. */}
            {isCorrect && <Check aria-label="Đáp án đúng" className={xl ? 'h-9 w-9' : 'h-6 w-6'} strokeWidth={4} />}
            {isWrongPick && <X aria-label="Bạn chọn sai" className={xl ? 'h-9 w-9' : 'h-6 w-6'} strokeWidth={4} />}
            {revealed && distribution && (
              <span className={`shrink-0 font-display font-black tabular-nums ${xl ? 'text-2xl' : 'text-sm'}`}>
                {distribution[i] ?? 0}
                <span className="font-sans text-xs font-bold opacity-70"> người</span>
              </span>
            )}
          </>
        );

        const className = `relative flex items-center gap-3 border-[3px] border-line text-ink transition-opacity ${
          xl ? 'min-h-28 px-5 py-4' : 'min-h-16 px-3 py-3'
        } ${dim ? 'opacity-40' : ''} ${isPicked && !revealed ? 'ring-4 ring-fg ring-offset-4 ring-offset-ink' : ''}`;
        const style = { background };

        if (!onPick) {
          return (
            <div key={i} className={`${className} shadow-[5px_5px_0_var(--color-edge)]`} style={style}>
              {body}
            </div>
          );
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            disabled={!interactive}
            aria-pressed={isPicked}
            aria-label={`Đáp án ${QUIZ_OPTION_LETTERS[i]}: ${text}`}
            className={`btn btn-tile !justify-start !text-left ${className}`}
            style={style}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
