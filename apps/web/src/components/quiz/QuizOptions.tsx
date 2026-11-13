import { Check, X } from 'lucide-react';
import { QUIZ_OPTION_LETTERS } from '../../lib/types';

export interface QuizOptionsProps {
  /**
   * Nội dung bốn đáp án. Bỏ trống khi `lettersOnly`: đội trưởng chỉ có nút A–D, còn chữ
   * nằm ở điện thoại các đồng đội — đó là điều buộc cả đội phải nói chuyện với nhau.
   */
  options?: string[];
  /** Chỉ vẽ nút A–D, KHÔNG có chữ đáp án (đội trưởng khi đội từ 2 người trở lên). */
  lettersOnly?: boolean;
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
  /**
   * Bỏ chữ cái A–D, chỉ còn nội dung. Dùng ở màn chiếu: mỗi đội thấy các ô theo một thứ tự
   * riêng nên "B" trên màn chiếu không phải "B" trên điện thoại của đội nào cả.
   */
  hideLetters?: boolean;
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
 * Bốn ô đáp án A/B/C/D — dùng cho cả điện thoại (bấm được) lẫn màn hình chiếu (chỉ xem).
 * Mỗi đội thấy các ô theo thứ tự RIÊNG nên chữ cái chỉ có nghĩa trên điện thoại của đội đó;
 * màn chiếu vì thế bỏ chữ (`hideLetters`) và để nội dung đáp án làm mốc chung.
 *
 * Màu đặt bằng INLINE STYLE vì `.btn:disabled` đổi nền về xám và thắng mọi class
 * tiện ích: ô vừa bấm cũng `disabled` trong lúc chờ, mà đó lại là ô cần sáng nhất.
 */
export function QuizOptions({
  options,
  lettersOnly = false,
  picked,
  hidden = [],
  correct,
  distribution,
  onPick,
  disabled = false,
  size = 'md',
  hideLetters = false,
}: QuizOptionsProps) {
  const revealed = correct !== undefined;
  const xl = size === 'xl';
  const texts = options ?? QUIZ_OPTION_LETTERS.map(() => '');

  return (
    <div
      className={`grid gap-3 ${lettersOnly ? 'grid-cols-2' : 'grid-cols-1'} ${
        xl ? 'md:grid-cols-2 md:gap-5' : lettersOnly ? '' : 'sm:grid-cols-2'
      }`}
    >
      {texts.map((text, i) => {
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
            {!hideLetters && (
              <span
                aria-hidden="true"
                className={`grid shrink-0 place-items-center border-[3px] border-ink bg-ink font-display font-black text-white ${
                  xl ? 'h-14 w-14 text-3xl' : 'h-10 w-10 text-xl'
                }`}
              >
                {QUIZ_OPTION_LETTERS[i]}
              </span>
            )}
            <span
              className={`min-w-0 flex-1 text-left font-bold leading-snug ${
                xl ? 'text-2xl lg:text-3xl' : 'text-base sm:text-lg'
              } ${isHidden ? 'line-through' : ''}`}
            >
              {isHidden ? '— đã loại —' : lettersOnly ? '' : text}
            </span>

            {/* Biểu tượng kết quả: không dựa riêng vào màu cho người mù màu. */}
            {isCorrect && <Check aria-label="Đáp án đúng" className={xl ? 'h-9 w-9' : 'h-6 w-6'} strokeWidth={4} />}
            {isWrongPick && <X aria-label="Bạn chọn sai" className={xl ? 'h-9 w-9' : 'h-6 w-6'} strokeWidth={4} />}
            {revealed && distribution && (
              <span className={`shrink-0 font-display font-black tabular-nums ${xl ? 'text-2xl' : 'text-sm'}`}>
                {distribution[i] ?? 0}
                <span className="font-sans text-xs font-bold opacity-70"> đội</span>
              </span>
            )}
          </>
        );

        const className = `relative flex items-center gap-3 border-[3px] border-line text-ink transition-opacity ${
          lettersOnly ? 'min-h-24 justify-center' : ''
        } ${xl ? 'min-h-20 px-5 py-3' : 'min-h-16 px-3 py-3'} ${dim ? 'opacity-40' : ''} ${isPicked && !revealed ? 'ring-4 ring-fg ring-offset-4 ring-offset-ink' : ''}`;
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
            aria-label={lettersOnly ? `Đáp án ${QUIZ_OPTION_LETTERS[i]}` : `Đáp án ${QUIZ_OPTION_LETTERS[i]}: ${text}`}
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

/**
 * Những đáp án MỘT người đọc được — phần của người đọc trong đội.
 *
 * Mỗi người chỉ nhận một phần bốn đáp án nên chữ cái ở đây nhảy cóc (ví dụ B và D):
 * giữ nguyên chữ cái thật để đọc to cho đội trưởng là "B" chứ không phải "đáp án đầu".
 * Ô bị 50:50 loại vẫn hiện nhưng gạch đi, để người đọc biết đội đã bỏ nó.
 */
export function ReaderOptions({
  visible,
  hidden = [],
}: {
  visible: { index: number; text: string }[];
  hidden?: number[];
}) {
  return (
    <ul className="grid grid-cols-1 gap-3" aria-label="Đáp án bạn đọc được">
      {visible.map(({ index, text }) => {
        const out = hidden.includes(index);
        return (
          <li
            key={index}
            className={`flex items-center gap-3 border-[3px] border-line px-3 py-3 text-ink ${out ? 'opacity-40' : ''}`}
            style={{ background: TONES[index % TONES.length] as string }}
          >
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center border-[3px] border-ink bg-ink font-display text-xl font-black text-white"
            >
              {QUIZ_OPTION_LETTERS[index]}
            </span>
            <span className={`min-w-0 flex-1 text-base font-bold leading-snug sm:text-lg ${out ? 'line-through' : ''}`}>
              <span className="sr-only">Đáp án {QUIZ_OPTION_LETTERS[index]}: </span>
              {text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
