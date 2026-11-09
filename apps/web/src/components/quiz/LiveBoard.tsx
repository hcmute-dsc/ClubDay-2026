import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Crown } from 'lucide-react';
import type { RoundStatePlayer } from '../../lib/types';
import { Avatar } from '../Avatar';

/** Thời gian một hàng trượt sang chỗ mới. */
const MOVE_MS = 750;
/** Điểm đếm dần từ số cũ lên số mới. */
const COUNT_MS = 900;
/**
 * Khi bảng được dựng NGAY LÚC công bố (điện thoại), nó hiện thứ hạng CŨ trước rồi
 * chờ chừng này mới chuyển sang thứ hạng mới — đủ để mắt kịp nhìn "ai đang ở đâu"
 * trước khi mọi người trượt đi.
 */
const SETTLE_DELAY_MS = 700;

/**
 * Có nên bỏ hoạt ảnh không?
 *
 *   - `respect` (điện thoại người chơi): theo cài đặt "giảm chuyển động" của hệ điều hành.
 *   - `always`  (màn hình chiếu của BTC): KHÔNG theo, luôn chạy hiệu ứng.
 *
 * Vì sao màn hình chiếu bỏ qua cài đặt đó: Windows tắt "Animation effects" là Chrome báo
 * `prefers-reduced-motion: reduce`, và rất nhiều máy tắt nó chỉ vì tiết kiệm pin hay
 * chạy máy ảo — không phải vì người dùng bị chóng mặt. Kết quả là hiệu ứng biến mất
 * trên đúng cái máy cần nó nhất. Màn hình chiếu là của cả hội trường chứ không phải
 * thiết bị cá nhân của một người nhạy cảm với chuyển động.
 */
export type BoardMotion = 'respect' | 'always';

function reducedMotion(motion: BoardMotion): boolean {
  if (motion === 'always') return false;
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Con số tự đếm dần khi đổi giá trị.
 *
 * Lần dựng đầu hiện thẳng giá trị (không đếm từ 0): bảng vừa mở mà mọi điểm đều
 * chạy từ 0 lên là nói dối rằng ai cũng vừa ghi điểm.
 */
function AnimatedNumber({ value, motion }: { value: number; motion: BoardMotion }) {
  const [shown, setShown] = useState(value);
  /** Giá trị đang hiển thị — để đổi giá trị giữa chừng thì đếm tiếp từ chỗ đang đứng, không giật về. */
  const current = useRef(value);

  useEffect(() => {
    if (value === current.current) return;
    if (reducedMotion(motion) || typeof requestAnimationFrame !== 'function') {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number): void => {
      const p = Math.min(1, (now - t0) / COUNT_MS);
      const eased = 1 - Math.pow(1 - p, 3); // nhanh lúc đầu, chậm dần về đích
      current.current = Math.round(from + (value - from) * eased);
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, motion]);

  return <>{shown}</>;
}

export interface LiveBoardProps {
  /** Đã xếp hạng sẵn bởi server (`rank`) — KHÔNG tự sắp lại ở đây. */
  players: RoundStatePlayer[];
  /**
   * Ảnh chụp bảng TRƯỚC khi điểm đổi. Truyền vào thì bảng dựng lên với thứ hạng và
   * điểm cũ, rồi tự chuyển sang mới — để người xem THẤY được sự thay đổi ngay cả khi
   * bảng chỉ mới xuất hiện (điện thoại chỉ dựng bảng lúc công bố).
   */
  before?: RoundStatePlayer[];
  /** Người đang xem (điện thoại). Nếu rớt ngoài top, dòng của họ vẫn được ghim ở cuối. */
  meId?: string;
  limit?: number;
  /** Đang công bố thì hiện điểm vừa nhận; đang chọn thì hiện ai đã chốt rồi. */
  phase: 'question' | 'reveal' | 'final';
  /** Cỡ chữ cho màn hình chiếu. */
  large?: boolean;
  /** Xem `BoardMotion`. Mặc định theo cài đặt hệ điều hành. */
  motion?: BoardMotion;
}

/** Bảng ở trạng thái "trước": thứ hạng + điểm cũ, nhưng tên/điểm vừa nhận lấy từ bản mới. */
function asBefore(players: RoundStatePlayer[], before: RoundStatePlayer[]): RoundStatePlayer[] {
  const old = new Map(before.map((p) => [p.id, p]));
  return players
    .map((p) => {
      const o = old.get(p.id);
      return o ? { ...p, score: o.score, rank: o.rank ?? p.rank } : p;
    })
    .sort((a, b) => (old.get(a.id)?.rank ?? 1e9) - (old.get(b.id)?.rank ?? 1e9) || (a.rank ?? 0) - (b.rank ?? 0));
}

/**
 * Bảng xếp hạng TRỰC TIẾP. Đi theo luồng SSE nên điểm đổi là bảng đổi, không poll.
 *
 * Chỉ hiện top `limit`: 50 dòng không vừa một màn hình chiếu, và dòng 30 cũng chẳng
 * ai đọc. Người xem vẫn thấy hạng của chính mình qua dòng ghim ở cuối.
 *
 * HOẠT ẢNH khi bảng đổi (kỹ thuật FLIP — đo vị trí cũ/mới rồi để trình duyệt tự
 * nội suy, nên không cần thư viện và không tính lại layout mỗi khung hình):
 *   - hàng trượt mượt sang vị trí mới;
 *   - hàng vừa VƯỢT LÊN nháy viền xanh;
 *   - người mới lọt vào top trượt vào từ bên trái;
 *   - điểm đếm dần lên số mới.
 */
export function LiveBoard({
  players,
  before,
  meId,
  limit = 10,
  phase,
  large = false,
  motion = 'respect',
}: LiveBoardProps) {
  const [settled, setSettled] = useState(!before || before.length === 0);
  useEffect(() => {
    if (settled) return;
    const t = setTimeout(() => setSettled(true), SETTLE_DELAY_MS);
    return () => clearTimeout(t);
  }, [settled]);

  const rows = useMemo(
    () => (settled || !before ? players : asBefore(players, before)),
    [settled, before, players],
  );

  const top = rows.slice(0, limit);
  const me = meId ? rows.find((p) => p.id === meId) : undefined;
  const pinMe = me && !top.some((p) => p.id === me.id);

  // ── FLIP: nhớ vị trí từng hàng ở lần dựng trước, so với lần này ──
  const listRef = useRef<HTMLOListElement>(null);
  const tops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const next = new Map<string, number>();
    const animate = !reducedMotion(motion);

    list.querySelectorAll<HTMLElement>('[data-row]').forEach((el) => {
      const id = el.dataset.row as string;
      // offsetTop KHÔNG bị ảnh hưởng bởi transform đang chạy, nên đo được vị trí
      // "thật" kể cả khi hàng đang trượt dở và bảng lại đổi.
      const y = el.offsetTop;
      next.set(id, y);
      const prev = tops.current.get(id);
      if (!animate || typeof el.animate !== 'function') return;

      if (prev === undefined) {
        // Hàng mới. Lần dựng đầu tiên (chưa có gì để so) thì không animate.
        if (tops.current.size > 0) {
          el.animate(
            [
              { opacity: 0, transform: 'translateX(-32px)' },
              { opacity: 1, transform: 'none' },
            ],
            { duration: 500, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          );
        }
        return;
      }
      if (prev === y) return;

      const movedUp = prev > y;
      el.animate(
        [
          { transform: `translateY(${prev - y}px)`, zIndex: movedUp ? 2 : 1 },
          { transform: 'none', zIndex: movedUp ? 2 : 1 },
        ],
        { duration: MOVE_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
      if (movedUp) {
        el.animate(
          [
            { outline: '4px solid var(--color-correct)', outlineOffset: '2px' },
            { outline: '4px solid transparent', outlineOffset: '2px' },
          ],
          { duration: 1600, easing: 'ease-out' },
        );
      }
    });
    tops.current = next;
  });

  if (players.length === 0) {
    return <p className="card p-6 text-center text-muted">Chưa có ai trên bảng.</p>;
  }

  const row = (p: RoundStatePlayer, pinned = false) => {
    const rank = p.rank ?? 0;
    const isMe = p.id === meId;
    return (
      <li
        key={p.id}
        data-row={p.id}
        className={`relative flex items-center gap-3 border-2 border-line ${large ? 'p-3' : 'p-2'} ${
          isMe ? 'bg-accent text-ink' : rank === 1 ? 'bg-surface-2' : 'bg-surface'
        } ${pinned ? 'mt-3' : ''}`}
      >
        <span
          className={`grid shrink-0 place-items-center font-display font-black tabular-nums ${
            large ? 'h-10 w-10 text-2xl' : 'h-7 w-7 text-base'
          } ${isMe ? '' : 'text-muted'}`}
        >
          {rank === 1 ? (
            <Crown
              aria-label="Hạng 1"
              className={large ? 'h-8 w-8 text-accent' : 'h-5 w-5 text-accent'}
              fill="currentColor"
            />
          ) : (
            rank
          )}
        </span>
        <Avatar name={p.name} seed={p.id} />
        <span className={`min-w-0 flex-1 truncate font-bold ${large ? 'text-xl' : 'text-sm'}`}>
          {p.name}
          {isMe && <span className="ml-2 text-xs font-black uppercase">(bạn)</span>}
        </span>

        {phase === 'question' && p.answered && (
          <Check aria-label="Đã chọn" className="h-5 w-5 shrink-0 text-correct" strokeWidth={4} />
        )}
        {phase === 'reveal' && (
          <span
            className={`shrink-0 font-display font-black tabular-nums ${large ? 'text-xl' : 'text-sm'} ${
              (p.delta ?? 0) > 0 ? (isMe ? 'text-ink' : 'text-correct') : 'text-muted'
            }`}
          >
            {(p.delta ?? 0) > 0 ? `+${p.delta}` : '0'}
          </span>
        )}
        <span
          className={`shrink-0 text-right font-display font-black tabular-nums ${
            large ? 'w-24 text-3xl' : 'w-16 text-xl'
          }`}
        >
          <AnimatedNumber value={p.score} motion={motion} />
        </span>
      </li>
    );
  };

  return (
    <ol ref={listRef} className="relative space-y-2" aria-label="Bảng xếp hạng trực tiếp">
      {top.map((p) => row(p))}
      {pinMe && me && row(me, true)}
    </ol>
  );
}
