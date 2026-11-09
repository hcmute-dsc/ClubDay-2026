import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleX, Clock, Lightbulb, Zap } from 'lucide-react';
import { Countdown } from '../components/Countdown';
import { Spinner } from '../components/Chips';
import { GameError } from '../components/GameStatus';
import { LiveBoard } from '../components/quiz/LiveBoard';
import { Lifelines } from '../components/quiz/Lifelines';
import { QuizOptions } from '../components/quiz/QuizOptions';
import { serverNow } from '../lib/api';
import { quizApi, type QuizHints, type QuizMe } from '../lib/api-quiz';
import { classifyGameError } from '../lib/game-errors';
import { useCountdown } from '../lib/useCountdown';
import {
  QUIZ_OPTION_LETTERS,
  QUIZ_QUESTION_MS,
  quizPoints,
  type GameProps,
  type LifelineKind,
  type RoundStatePlayer,
} from '../lib/types';

const LEVEL_LABEL = { 1: 'Dễ', 2: 'Vừa', 3: 'Khó' } as const;

/**
 * AI LÀ TRIỆU PHÚ (màn hình người chơi).
 *
 * Câu hỏi, đồng hồ và bảng hạng đến từ SSE (`state.quiz`, `state.players`) — cả phòng
 * thấy cùng một thứ cùng lúc. Ở đây chỉ giữ phần RIÊNG của mình: ô đã chọn và kết
 * quả các quyền trợ giúp, lấy từ `quizApi.me` để tải lại trang không mất gì.
 *
 * Không tự chấm đúng/sai: đáp án đúng chỉ xuất hiện trong `state.quiz.correct` sau khi
 * BTC công bố. Trước đó client không có gì để mà lộ.
 */
export function QuizGame({ roundId, playerId, state }: GameProps) {
  const quiz = state.quiz;
  const index = quiz?.index ?? -1;
  const phase = quiz?.phase;

  const [me, setMe] = useState<QuizMe | null>(null);
  /** Ô vừa bấm — tô sáng NGAY, không chờ server (chờ 100ms là người ta bấm lại). */
  const [picked, setPicked] = useState<number | null>(null);
  const [hints, setHints] = useState<QuizHints>({});
  const [used, setUsed] = useState<QuizMe['used']>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** Câu mà `picked`/`hints` thuộc về — để không dính sang câu kế khi mạng chậm. */
  const forIndex = useRef(-1);
  /**
   * Bảng xếp hạng ở lần dựng CUỐI CÙNG của pha chọn đáp án — tức thứ hạng TRƯỚC khi
   * công bố. Đưa cho `LiveBoard` để nó trượt từ hạng cũ sang hạng mới; thiếu cái này
   * thì bảng chỉ mới xuất hiện lúc công bố và người xem chẳng thấy gì "thay đổi".
   */
  const boardBefore = useRef<RoundStatePlayer[]>([]);
  if (state.quiz?.phase === 'question') boardBefore.current = state.players;

  const remaining = useCountdown(quiz?.endsAt);

  // Nạp trạng thái riêng khi vào lượt, khi sang câu mới và khi đáp án được công bố
  // (để lấy điểm mới nhất và ô đã chọn đã được server ghi nhận).
  useEffect(() => {
    if (index < 0) return;
    let alive = true;
    quizApi
      .me(roundId, playerId)
      .then((m) => {
        if (!alive) return;
        setMe(m);
        setUsed(m.used);
        if (m.index === index) {
          forIndex.current = index;
          setPicked(m.answer);
          setHints(m.hints);
        }
      })
      .catch(() => {
        if (alive) setError('Không tải được trạng thái của bạn.');
      });
    return () => {
      alive = false;
    };
  }, [roundId, playerId, index, phase]);

  // Sang câu mới: bỏ lựa chọn và gợi ý của câu cũ ngay, không chờ mạng.
  useEffect(() => {
    setPicked(null);
    setHints({});
    forIndex.current = index;
  }, [index]);

  const pick = useCallback(
    async (choice: number) => {
      if (!quiz || picked !== null || busy || quiz.phase !== 'question') return;
      setPicked(choice);
      setBusy(true);
      try {
        await quizApi.answer(roundId, playerId, quiz.index, choice);
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        if (code === 'ALREADY_ANSWERED') {
          // Máy khác/tab khác của chính mình đã chốt rồi — lấy đáp án thật của server.
          quizApi.me(roundId, playerId).then((m) => setPicked(m.answer)).catch(() => undefined);
        } else if (classifyGameError(err) === 'over' || code === 'QUESTION_CLOSED') {
          setPicked(null); // quá hạn: SSE sắp chuyển sang pha công bố
        } else {
          setPicked(null); // TOO_FAST, HIDDEN_OPTION, lỗi mạng…: cho chọn lại
          if (code !== 'TOO_FAST') setError('Chưa gửi được đáp án, thử lại nhé.');
        }
      } finally {
        setBusy(false);
      }
    },
    [quiz, picked, busy, roundId, playerId],
  );

  async function useLifeline(kind: LifelineKind) {
    if (!quiz || busy || picked !== null || quiz.phase !== 'question') return;
    setBusy(true);
    setError('');
    try {
      const res = await quizApi.lifeline(roundId, playerId, quiz.index, kind);
      setHints(res.hints);
      setUsed((u) => ({ ...u, [kind]: quiz.index }));
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(
        code === 'LIFELINE_LOCKED'
          ? 'Nhân đôi chỉ dùng được từ câu mức Vừa trở lên.'
          : 'Không dùng được quyền trợ giúp này.',
      );
      quizApi.me(roundId, playerId).then((m) => { setUsed(m.used); setHints(m.hints); }).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  // Phím tắt: A–D hoặc 1–4 (chơi trên máy tính).
  useEffect(() => {
    if (!quiz || quiz.phase !== 'question' || picked !== null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      const i = QUIZ_OPTION_LETTERS.indexOf(k as (typeof QUIZ_OPTION_LETTERS)[number]);
      const n = i >= 0 ? i : Number(k) - 1;
      if (!Number.isInteger(n) || n < 0 || n >= quiz.options.length) return;
      if (hints.hidden?.includes(n)) return;
      e.preventDefault();
      void pick(n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quiz, picked, hints.hidden, pick]);

  if (!quiz) return <Spinner label="Đang chờ câu hỏi…" />;
  if (error && !me) return <GameError message={error} />;

  const revealed = quiz.phase === 'reveal';
  const mine = state.players.find((p) => p.id === playerId);
  const myPick = revealed ? (me?.index === quiz.index ? me.answer : picked) : picked;
  const gotItRight = revealed && myPick !== null && myPick === quiz.correct;
  const doubled = !!hints.doubled || me?.hints.doubled;

  // Điểm nếu chốt NGAY BÂY GIỜ — giảm dần theo từng giây, để người chơi thấy
  // thời gian là tiền. Dùng đúng hàm mà server chấm.
  const livePoints = quizPoints(serverNow(), quiz.startedAt, quiz.endsAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-display text-lg font-black uppercase tabular-nums">
          Câu {quiz.index + 1}
          <span className="text-muted">/{quiz.total}</span>
        </span>
        <span className="flex items-center gap-2 text-xs font-bold uppercase text-muted">
          <span className="border-2 border-line px-2 py-0.5">{LEVEL_LABEL[quiz.level]}</span>
          <span>{mine ? `Hạng ${mine.rank ?? '–'}/${state.players.length}` : ''}</span>
        </span>
      </div>

      {!revealed && <Countdown endsAt={quiz.endsAt} total={QUIZ_QUESTION_MS} />}

      <div key={quiz.index} className="card animate-pop px-4 py-6 sm:px-6">
        <p className="break-words font-display text-2xl font-black leading-snug sm:text-3xl">{quiz.text}</p>
      </div>

      {!revealed && (
        <p
          role="status"
          className={`flex items-center justify-center gap-2 border-2 border-line px-3 py-2 text-sm font-bold ${
            picked === null ? 'bg-surface-2' : 'bg-surface text-muted'
          }`}
        >
          <Zap aria-hidden="true" className="h-4 w-4 text-accent" fill="currentColor" />
          {picked !== null
            ? `Đã chốt đáp án ${QUIZ_OPTION_LETTERS[picked]} — chờ cả phòng…`
            : remaining > 0
              ? `Chốt ngay bây giờ: +${doubled ? livePoints * 2 : livePoints} điểm${doubled ? ' (đã nhân đôi)' : ''}`
              : 'Hết giờ — đang chốt…'}
        </p>
      )}

      <QuizOptions
        options={quiz.options}
        picked={myPick}
        hidden={hints.hidden ?? []}
        correct={revealed ? quiz.correct : undefined}
        distribution={revealed ? quiz.distribution : undefined}
        onPick={(i) => void pick(i)}
        disabled={busy || remaining <= 0}
      />

      {!revealed && (
        <Lifelines
          used={used}
          level={quiz.level}
          activeNow={{ fifty: !!hints.hidden, double: !!hints.doubled }}
          disabled={busy || picked !== null || remaining <= 0}
          onUse={(k) => void useLifeline(k)}
        />
      )}

      {error && (
        <p role="alert" className="text-center text-sm font-semibold text-wrong">
          {error}
        </p>
      )}

      {revealed && (
        <section className="space-y-4" aria-label="Kết quả câu hỏi">
          <div
            className={`card flex items-center gap-3 p-4 ${
              gotItRight ? 'border-correct' : 'border-wrong'
            } animate-pop`}
          >
            {gotItRight ? (
              <CircleCheck aria-hidden="true" className="h-9 w-9 shrink-0 text-correct" />
            ) : (
              <CircleX aria-hidden="true" className="h-9 w-9 shrink-0 text-wrong" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl font-black uppercase leading-tight">
                {gotItRight ? 'Chính xác!' : myPick === null ? 'Bạn chưa kịp chọn' : 'Tiếc quá, sai rồi'}
              </p>
              <p className="text-sm text-muted">
                Đáp án đúng: <b className="text-fg">{quiz.correct !== undefined ? QUIZ_OPTION_LETTERS[quiz.correct] : ''}</b>
                {mine && mine.rank ? ` · Hạng ${mine.rank}/${state.players.length}` : ''}
              </p>
            </div>
            <span className="shrink-0 text-right font-display text-3xl font-black tabular-nums">
              {mine && (mine.delta ?? 0) > 0 ? `+${mine.delta}` : '0'}
            </span>
          </div>

          {quiz.explain && (
            <p className="flex items-start gap-2 text-sm text-muted">
              <Lightbulb aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              {quiz.explain}
            </p>
          )}

          <div>
            <h2 className="mb-2 font-display text-sm font-black uppercase tracking-wide text-muted">
              Bảng xếp hạng
            </h2>
            <LiveBoard
              players={state.players}
              {...(boardBefore.current.length > 0 ? { before: boardBefore.current } : {})}
              meId={playerId}
              limit={5}
              phase="reveal"
            />
          </div>

          <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted">
            <Clock aria-hidden="true" className="h-4 w-4" />
            Chờ BTC sang câu tiếp theo…
          </p>
        </section>
      )}
    </div>
  );
}
