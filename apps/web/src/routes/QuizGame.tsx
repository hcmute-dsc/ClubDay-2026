import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleX, Clock, Crown, Lightbulb, MessageCircle, Zap } from 'lucide-react';
import { Countdown } from '../components/Countdown';
import { Spinner } from '../components/Chips';
import { GameError } from '../components/GameStatus';
import { LiveBoard } from '../components/quiz/LiveBoard';
import { Lifelines } from '../components/quiz/Lifelines';
import { QuizOptions, ReaderOptions } from '../components/quiz/QuizOptions';
import { TeamCard } from '../components/quiz/TeamCard';
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
  type QuizTeamPublic,
} from '../lib/types';

const LEVEL_LABEL = { 1: 'Dễ', 2: 'Vừa', 3: 'Khó' } as const;

/**
 * AI LÀ TRIỆU PHÚ (màn hình người chơi) — chơi THEO ĐỘI.
 *
 * Cả đội chỉ có MỘT đáp án mỗi câu và không ai tự đủ thông tin để trả lời một mình:
 *   - ĐỘI TRƯỞNG (xoay vòng mỗi câu) chỉ thấy bốn nút A–D, không có chữ, và là người
 *     DUY NHẤT chốt được đáp án cùng dùng quyền trợ giúp.
 *   - NGƯỜI ĐỌC (các thành viên còn lại) mỗi người chỉ thấy MỘT PHẦN các đáp án
 *     và phải đọc to cho đội trưởng.
 *   - Đội chỉ có một người thì tự đọc, tự chốt.
 *
 * Câu hỏi, đồng hồ và bảng hạng đội đến từ SSE (`state.quiz`, `state.teams`). Phần RIÊNG
 * của mình — vai trò và những đáp án mình được đọc — lấy từ `quizApi.me`, nên tải lại
 * trang không mất gì. Đáp án đúng chỉ xuất hiện sau khi BTC công bố.
 */
export function QuizGame({ roundId, playerId, state }: GameProps) {
  const quiz = state.quiz;
  const index = quiz?.index ?? -1;
  const phase = quiz?.phase;

  const teams = state.teams ?? [];
  const team = teams.find((t) => t.members.some((m) => m.id === playerId));
  const teamAnswered = !!team?.answered;

  const [me, setMe] = useState<QuizMe | null>(null);
  /** Nguồn sự thật về đội trưởng là SSE (đổi theo câu); `me` chỉ là dự phòng khi chưa có đội. */
  const isCaptain = team ? team.captainId === playerId : me?.role === 'captain';
  const captainName =
    team?.members.find((m) => m.id === team.captainId)?.name ?? me?.captainName ?? 'đội trưởng';

  /** Ô vừa bấm — tô sáng NGAY, không chờ server (chờ 100ms là người ta bấm lại). */
  const [picked, setPicked] = useState<number | null>(null);
  const [hints, setHints] = useState<QuizHints>({});
  const [used, setUsed] = useState<QuizMe['used']>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * Bảng đội ở lần dựng CUỐI CÙNG của pha chọn đáp án — tức thứ hạng TRƯỚC khi công bố.
   * Đưa cho `LiveBoard` để nó trượt từ hạng cũ sang hạng mới; thiếu cái này thì bảng
   * chỉ mới xuất hiện lúc công bố và người xem chẳng thấy gì "thay đổi".
   */
  const boardBefore = useRef<QuizTeamPublic[]>([]);
  if (state.quiz?.phase === 'question') boardBefore.current = teams;

  const remaining = useCountdown(quiz?.endsAt);

  // Nạp phần riêng khi vào lượt, khi sang câu mới, khi công bố, và khi đội vừa chốt
  // (để biết ĐỘI đã chọn ô nào — người đọc không tự bấm nên chỉ có cách hỏi server).
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
  }, [roundId, playerId, index, phase, teamAnswered]);

  // Sang câu mới: bỏ lựa chọn và gợi ý của câu cũ ngay, không chờ mạng.
  useEffect(() => {
    setPicked(null);
    setHints({});
  }, [index]);

  const pick = useCallback(
    async (choice: number) => {
      if (!quiz || !isCaptain || picked !== null || teamAnswered || busy || quiz.phase !== 'question') return;
      setPicked(choice);
      setBusy(true);
      setError('');
      try {
        await quizApi.answer(roundId, playerId, quiz.index, choice);
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        if (code === 'ALREADY_ANSWERED') {
          // Đội đã chốt rồi (máy khác của mình, hoặc SSE chưa kịp tới) — lấy đáp án thật của server.
          quizApi.me(roundId, playerId).then((m) => setPicked(m.answer)).catch(() => undefined);
        } else if (classifyGameError(err) === 'over' || code === 'QUESTION_CLOSED') {
          setPicked(null); // quá hạn: SSE sắp chuyển sang pha công bố
        } else {
          setPicked(null); // TOO_FAST, HIDDEN_OPTION, NOT_CAPTAIN, lỗi mạng…: cho chọn lại
          if (code === 'NOT_CAPTAIN') setError('Câu này bạn không phải đội trưởng.');
          else if (code !== 'TOO_FAST') setError('Chưa gửi được đáp án, thử lại nhé.');
        }
      } finally {
        setBusy(false);
      }
    },
    [quiz, isCaptain, picked, teamAnswered, busy, roundId, playerId],
  );

  async function useLifeline(kind: LifelineKind) {
    if (!quiz || !isCaptain || busy || picked !== null || teamAnswered || quiz.phase !== 'question') return;
    setBusy(true);
    setError('');
    try {
      const res = await quizApi.lifeline(roundId, playerId, quiz.index, kind);
      setHints(res.hints);
      setUsed((u) => ({ ...u, [kind]: quiz.index }));
      // Kết quả 50:50 đổi những đáp án mỗi người được đọc → nạp lại phần riêng của mình.
      quizApi.me(roundId, playerId).then(setMe).catch(() => undefined);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(
        code === 'LIFELINE_LOCKED'
          ? 'Nhân đôi chỉ dùng được từ câu mức Vừa trở lên.'
          : code === 'NOT_CAPTAIN'
            ? 'Chỉ đội trưởng mới dùng được quyền trợ giúp.'
            : 'Không dùng được quyền trợ giúp này.',
      );
      quizApi.me(roundId, playerId).then((m) => { setUsed(m.used); setHints(m.hints); }).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  // Phím tắt A–D hoặc 1–4 (chơi trên máy tính) — CHỈ đội trưởng, vì chỉ họ chốt được.
  useEffect(() => {
    if (!quiz || !isCaptain || quiz.phase !== 'question' || picked !== null || teamAnswered) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      const i = QUIZ_OPTION_LETTERS.indexOf(k as (typeof QUIZ_OPTION_LETTERS)[number]);
      const n = i >= 0 ? i : Number(k) - 1;
      if (!Number.isInteger(n) || n < 0 || n >= QUIZ_OPTION_LETTERS.length) return;
      if (hints.hidden?.includes(n)) return;
      e.preventDefault();
      void pick(n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quiz, isCaptain, picked, teamAnswered, hints.hidden, pick]);

  if (!quiz) return <Spinner label="Đang chờ câu hỏi…" />;
  if (error && !me) return <GameError message={error} />;

  const revealed = quiz.phase === 'reveal';
  const fresh = me?.index === index;
  const visible = fresh ? me.visible : [];
  /** Đội chỉ có một người → đội trưởng đọc được cả bốn đáp án, không cần ai đọc hộ. */
  const solo = isCaptain && visible.length > 0;
  const soloOptions = solo
    ? QUIZ_OPTION_LETTERS.map((_, i) => visible.find((v) => v.index === i)?.text ?? '')
    : undefined;

  /** Ô ĐỘI đã chốt: ô mình vừa bấm, hoặc ô server ghi nhận cho đội. */
  const teamPick = picked ?? (fresh ? me.answer : null);
  const locked = teamPick !== null || teamAnswered;
  const gotItRight = revealed && teamPick !== null && teamPick === quiz.correct;
  const doubled = !!hints.doubled || (fresh && !!me.hints.doubled);

  // Điểm nếu chốt NGAY BÂY GIỜ — giảm dần theo từng giây, để người chơi thấy
  // thời gian là tiền. Dùng đúng hàm mà server chấm.
  const livePoints = quizPoints(serverNow(), quiz.startedAt, quiz.endsAt);
  const teamCount = teams.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-display text-lg font-black uppercase tabular-nums">
          Câu {quiz.index + 1}
          <span className="text-muted">/{quiz.total}</span>
        </span>
        <span className="flex items-center gap-2 text-xs font-bold uppercase text-muted">
          <span className="border-2 border-line px-2 py-0.5">{LEVEL_LABEL[quiz.level]}</span>
          <span>{team ? `Hạng ${team.rank}/${teamCount}` : ''}</span>
        </span>
      </div>

      {team && <TeamCard team={team} meId={playerId} />}

      {!revealed && <Countdown endsAt={quiz.endsAt} total={QUIZ_QUESTION_MS} />}

      <div key={quiz.index} className="card animate-pop px-4 py-6 sm:px-6">
        <p className="break-words font-display text-2xl font-black leading-snug sm:text-3xl">{quiz.text}</p>
      </div>

      {!revealed && (
        <>
          {/* Vai trò của MÌNH ở câu này — nói thẳng việc cần làm, đừng bắt người ta tự đoán. */}
          <p
            role="status"
            className={`flex items-start gap-2 border-2 border-line px-3 py-2 text-sm font-bold ${
              locked ? 'bg-surface text-muted' : isCaptain ? 'bg-accent text-ink' : 'bg-surface-2'
            }`}
          >
            {locked ? (
              <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-correct" />
            ) : isCaptain ? (
              <Crown aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" />
            ) : (
              <MessageCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
            )}
            <span>
              {locked
                ? teamPick !== null
                  ? `Đội đã chốt đáp án ${QUIZ_OPTION_LETTERS[teamPick]} — chờ các đội khác…`
                  : 'Đội đã chốt đáp án — chờ các đội khác…'
                : solo
                  ? 'Đội chỉ có mình bạn — tự đọc và chốt đáp án.'
                  : isCaptain
                    ? 'Bạn là ĐỘI TRƯỞNG câu này. Hỏi đồng đội đọc đáp án, bàn bạc rồi bấm chốt.'
                    : `Đọc to đáp án của bạn cho đội trưởng ${captainName}, rồi cùng bàn.`}
            </span>
          </p>

          {isCaptain && !locked && (
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-muted">
              <Zap aria-hidden="true" className="h-4 w-4 text-accent" fill="currentColor" />
              {remaining > 0
                ? `Chốt ngay bây giờ: +${doubled ? livePoints * 2 : livePoints} điểm${doubled ? ' (đã nhân đôi)' : ''}`
                : 'Hết giờ — đang chốt…'}
            </p>
          )}

          {isCaptain ? (
            <QuizOptions
              {...(soloOptions ? { options: soloOptions } : { lettersOnly: true })}
              picked={teamPick}
              hidden={hints.hidden ?? []}
              onPick={(i) => void pick(i)}
              disabled={busy || remaining <= 0 || teamAnswered}
            />
          ) : visible.length > 0 ? (
            <ReaderOptions visible={visible} hidden={hints.hidden ?? []} />
          ) : fresh ? (
            <p className="card p-4 text-center text-sm text-muted">
              Các đáp án của bạn đã bị loại bởi 50:50 — báo cho đội trưởng nhé.
            </p>
          ) : null}

          <Lifelines
            used={used}
            level={quiz.level}
            activeNow={{ fifty: !!hints.hidden, double: !!hints.doubled }}
            disabled={!isCaptain || busy || locked || remaining <= 0}
            onUse={(k) => void useLifeline(k)}
          />
          {!isCaptain && (
            <p className="text-center text-xs text-muted">Quyền trợ giúp là của cả đội — đội trưởng sẽ bấm.</p>
          )}
        </>
      )}

      {revealed && quiz.options && (
        <QuizOptions
          options={quiz.options}
          picked={teamPick}
          correct={quiz.correct}
          distribution={quiz.distribution}
          disabled
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
                {gotItRight ? 'Cả đội chính xác!' : teamPick === null ? 'Đội chưa kịp chốt' : 'Tiếc quá, đội trả lời sai'}
              </p>
              <p className="text-sm text-muted">
                Đáp án đúng: <b className="text-fg">{quiz.correct !== undefined ? QUIZ_OPTION_LETTERS[quiz.correct] : ''}</b>
                {team ? ` · Hạng ${team.rank}/${teamCount}` : ''}
              </p>
            </div>
            <span className="shrink-0 text-right font-display text-3xl font-black tabular-nums">
              {team && team.delta > 0 ? `+${team.delta}` : '0'}
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
              Bảng xếp hạng đội
            </h2>
            <LiveBoard
              teams={teams}
              {...(boardBefore.current.length > 0 ? { before: boardBefore.current } : {})}
              {...(team ? { meTeamId: team.id } : {})}
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
