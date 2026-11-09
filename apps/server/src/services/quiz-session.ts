/**
 * TRỌNG TÀI của game Ai là triệu phú.
 *
 * KHÁC bốn game còn lại ở một điều căn bản: cả lượt đi CÙNG NHAU qua từng câu. Bốn
 * game kia mỗi người chạy đua riêng trên một đồng hồ chung; ở đây có một MÁY
 * TRẠNG THÁI chung của cả phòng, và BTC là người bấm chuyển:
 *
 *      question ──(hết giờ | ai cũng đã chọn | BTC bấm)──▶ reveal
 *         ▲                                                  │
 *         └───────────(BTC bấm "Câu tiếp theo")──────────────┘
 *                                       (sau câu cuối: lượt kết thúc)
 *
 *   - `question`: đáp án còn ĐÓNG. Người chơi chốt A/B/C/D hoặc dùng quyền trợ giúp.
 *   - `reveal`:   đáp án đã MỞ, điểm đã cộng, bảng hạng đã cập nhật.
 *
 * Nguyên tắc như mọi game ở đây: điểm do SERVER quyết định. Client chỉ gửi "câu số
 * mấy, tôi chọn ô nào" — không gửi điểm, không gửi thời gian. Thời gian trả lời là
 * giờ server nhận được gói, không phải giờ trên đồng hồ của điện thoại.
 *
 * Mọi hàm nhận `now` như THAM SỐ (không gọi Date.now() bên trong) để test giả lập
 * "đã hết giờ một câu" mà không phải chờ thật.
 */
import {
  QUIZ_DOUBLE_MIN_LEVEL,
  QUIZ_LIFELINES,
  QUIZ_OPTION_COUNT,
  QUIZ_QUESTION_COUNT,
  QUIZ_QUESTION_MS,
  quizPoints,
  type LifelineKind,
  type QuizPublic,
} from '@clubday/contract';
import { mulberry32, randInt } from '../lib/prng.js';
import { syncRoundStatus } from '../store/lobby.js';
import { touch } from '../store/store.js';
import type { Player, QuizHints, QuizQuestion, Round } from '../store/types.js';
import { seedFromRoundId } from './math-gen.js';
import { DEFAULT_QUIZ_QUESTIONS, type QuizSource } from './quiz-bank.js';
import { getQuizQuestions } from './quiz-bank-store.js';

/**
 * Dung sai mạng: đáp án tới trễ tối đa chừng này sau mốc hết giờ vẫn được nhận.
 *
 * Điện thoại thấy đồng hồ về 0:00 rồi mới bấm thì gói tin cũng phải mất vài trăm
 * ms mới tới server; không có dung sai thì người bấm đúng giây cuối ở Wi-Fi sự
 * kiện bị từ chối oan. Câu nhận trong dung sai được 0 điểm thưởng tốc độ nên
 * không ai lợi được gì từ việc cố tình trễ.
 */
export const QUIZ_GRACE_MS = 600;

/**
 * Chọn đáp án nhanh hơn mức này kể từ lúc câu hỏi hiện ra thì không phải người.
 * Đọc xong một câu hỏi và chạm vào màn hình mất ít nhất vài trăm ms.
 */
export const MIN_QUIZ_REACTION_MS = 350;

/** Gộp các lần "có người vừa chọn" thành tối đa một lần đẩy SSE trong chừng này ms. */
const ANSWER_BROADCAST_MS = 700;

// ───────────────────────── dựng đề ─────────────────────────

/** Fisher–Yates bằng PRNG có seed: cùng seed → cùng thứ tự. */
function shuffle<T>(items: readonly T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rnd, 0, i);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * Dựng đề từ bộ câu hỏi, GIỮ NGUYÊN thứ tự câu, chỉ xáo vị trí A/B/C/D.
 *
 * `source` là bộ có sẵn hoặc bộ BTC import (xem quiz-bank-store.ts). Làm ở server, một
 * lần cho cả lượt, nên cả phòng thấy cùng một thứ tự A/B/C/D — màn hình chiếu và
 * điện thoại không bao giờ lệch nhau.
 */
export function buildQuizQuestions(
  seed: number,
  source: readonly QuizSource[] = DEFAULT_QUIZ_QUESTIONS,
): QuizQuestion[] {
  const rnd = mulberry32(seed);
  return source.map((q) => {
    const order = shuffle([0, 1, 2, 3], rnd);
    return {
      text: q.text,
      options: order.map((i) => q.options[i] as string),
      answer: order.indexOf(q.answer),
      category: q.category,
      level: q.level,
      explain: q.explain,
    };
  });
}

/** Chạy khi BTC bấm BẮT ĐẦU: sinh đề và mở câu đầu tiên. */
export function startQuiz(round: Round, now: number): void {
  round.quiz = {
    // Chụp bộ câu hỏi ở đúng khoảnh khắc bắt đầu: import giữa buổi chỉ áp cho lượt SAU.
    questions: round.quiz.questions ?? buildQuizQuestions(seedFromRoundId(round.id), getQuizQuestions()),
    index: 0,
    phase: 'question',
    startedAt: now,
    endsAt: now + QUIZ_QUESTION_MS,
    distribution: [],
  };
  for (const p of round.players.values()) resetForQuestion(p);
}

/** Xoá những gì chỉ có nghĩa trong MỘT câu. Quyền trợ giúp đã dùng thì giữ nguyên. */
function resetForQuestion(p: Player): void {
  p.quiz.answer = null;
  p.quiz.answeredAt = null;
  p.quiz.lastDelta = 0;
  p.quiz.hints = {};
}

export function currentQuizQuestion(round: Round): QuizQuestion | null {
  return round.quiz.questions?.[round.quiz.index] ?? null;
}

// ───────────────────────── nhìn từ bên ngoài ─────────────────────────

/**
 * Phần câu hỏi được phép gửi cho MỌI người (qua SSE) — màn hình chiếu và điện thoại.
 *
 * ĐÁP ÁN ĐÚNG chỉ được lộ khi phase = `reveal`. Đây là chỗ DUY NHẤT quyết định
 * điều đó: trước pha reveal mà `correct` rò ra là mở DevTools lên đọc được đáp
 * án, và toàn bộ phần chấm điểm thành vô nghĩa.
 */
export function publicQuiz(round: Round): QuizPublic | undefined {
  const q = currentQuizQuestion(round);
  if (round.game !== 'quiz' || round.status !== 'playing' || !q) return undefined;

  let answered = 0;
  for (const p of round.players.values()) if (p.quiz.answer !== null) answered += 1;

  const view: QuizPublic = {
    total: round.quiz.questions?.length ?? QUIZ_QUESTION_COUNT,
    index: round.quiz.index,
    phase: round.quiz.phase,
    startedAt: round.quiz.startedAt,
    endsAt: round.quiz.endsAt,
    text: q.text,
    category: q.category,
    level: q.level,
    options: q.options,
    answered,
  };
  if (round.quiz.phase === 'reveal') {
    view.correct = q.answer;
    view.distribution = round.quiz.distribution;
    view.explain = q.explain;
  }
  return view;
}

/** Trạng thái RIÊNG của một người chơi — dùng khi vào lượt và khi tải lại trang. */
export interface QuizMe {
  index: number;
  phase: 'question' | 'reveal';
  /** Ô đã chốt ở câu đang mở, `null` = chưa chọn. */
  answer: number | null;
  /** Quyền trợ giúp đã dùng → ở câu số mấy. */
  used: Partial<Record<LifelineKind, number>>;
  hints: QuizHints;
  score: number;
  streak: number;
  correct: number;
  wrong: number;
  /** Điểm nhận ở câu vừa công bố. */
  delta: number;
}

export function quizMe(round: Round, player: Player): QuizMe {
  return {
    index: round.quiz.index,
    phase: round.quiz.phase,
    answer: player.quiz.answer,
    used: player.quiz.used,
    hints: player.quiz.hints,
    score: player.score,
    streak: player.quiz.streak,
    correct: player.correct,
    wrong: player.wrong,
    delta: player.quiz.lastDelta,
  };
}

// ───────────────────────── trả lời ─────────────────────────

export type QuizFailure =
  | 'NOT_PLAYING'
  | 'BAD_INDEX'
  | 'BAD_CHOICE'
  | 'QUESTION_CLOSED'
  | 'ALREADY_ANSWERED'
  | 'HIDDEN_OPTION'
  | 'TOO_FAST';

export type QuizAnswerOutcome = { ok: true; choice: number } | { ok: false; code: QuizFailure };

/** Còn nhận đáp án cho câu này không? Dùng chung cho trả lời và trợ giúp. */
function questionOpen(round: Round, now: number): boolean {
  return round.quiz.phase === 'question' && now <= round.quiz.endsAt + QUIZ_GRACE_MS;
}

/**
 * Chốt đáp án. Các chốt chặn, theo thứ tự:
 *   1. Lượt đang chơi và đề đã được sinh.
 *   2. Đúng câu đang mở — chặn trả lời muộn cho câu trước, hoặc nhảy trước câu sau.
 *   3. Câu còn mở: chưa công bố, chưa quá hạn (có dung sai mạng).
 *   4. Ô hợp lệ và không nằm trong số bị 50:50 loại.
 *   5. Chưa chọn — chốt là chốt, không đổi.
 *   6. Không nhanh tới mức vô lý — nhanh hơn thế là script, đánh cờ.
 */
export function submitQuizAnswer(
  round: Round,
  player: Player,
  index: number,
  choice: number,
  now: number,
): QuizAnswerOutcome {
  if (round.status !== 'playing' || !round.quiz.questions) return { ok: false, code: 'NOT_PLAYING' };
  if (index !== round.quiz.index) return { ok: false, code: 'BAD_INDEX' };
  if (!questionOpen(round, now)) return { ok: false, code: 'QUESTION_CLOSED' };
  if (!Number.isInteger(choice) || choice < 0 || choice >= QUIZ_OPTION_COUNT) {
    return { ok: false, code: 'BAD_CHOICE' };
  }
  if (player.quiz.hints.hidden?.includes(choice)) return { ok: false, code: 'HIDDEN_OPTION' };
  if (player.quiz.answer !== null) return { ok: false, code: 'ALREADY_ANSWERED' };

  if (now - round.quiz.startedAt < MIN_QUIZ_REACTION_MS) {
    player.flagged = true;
    return { ok: false, code: 'TOO_FAST' };
  }

  player.quiz.answer = choice;
  player.quiz.answeredAt = now;

  // Ai cũng đã chọn thì công bố luôn, khỏi bắt cả phòng ngồi chờ hết giờ.
  // Gọi thẳng chứ không qua hook đồng hồ: không phụ thuộc việc route đã đăng ký hay chưa.
  tickQuiz(round, now);
  if (round.quiz.phase === 'question') broadcastSoon(round);
  return { ok: true, choice };
}

/**
 * Đẩy SSE "bao nhiêu người đã chọn" — nhưng GỘP lại.
 *
 * 50 người chọn trong vài giây mà mỗi lần đẩy một bản trạng thái cho 50 máy là
 * 2.500 gói chỉ để một con số trên màn hình chiếu nhích lên. Gộp thành tối đa một
 * lần mỗi `ANSWER_BROADCAST_MS`.
 */
const pendingBroadcast = new Set<string>();

function broadcastSoon(round: Round): void {
  if (pendingBroadcast.has(round.id)) return;
  pendingBroadcast.add(round.id);
  const timer = setTimeout(() => {
    pendingBroadcast.delete(round.id);
    touch(round);
  }, ANSWER_BROADCAST_MS);
  timer.unref();
}

// ───────────────────────── quyền trợ giúp ─────────────────────────

export type LifelineOutcome =
  | { ok: true; kind: LifelineKind; hints: QuizHints }
  | { ok: false; code: QuizFailure | 'LIFELINE_USED' | 'LIFELINE_LOCKED' };

/**
 * Dùng một quyền trợ giúp. Mỗi quyền MỘT LẦN trong cả lượt.
 *
 * Kết quả do server tính từ đáp án THẬT rồi gửi riêng cho người dùng; client không
 * bao giờ có đủ thông tin để tự suy ra. Hạt giống gồm mã lượt + người chơi + số
 * câu + loại quyền, nên cùng một người ở cùng một câu luôn nhận cùng kết quả —
 * tải lại trang không "quay số lại" được.
 *
 * Phải dùng TRƯỚC khi chốt đáp án: 50:50 sau khi đã chọn thì vô nghĩa.
 *
 * Chỉ có hai quyền:
 *   - 50:50: dùng ở mọi câu.
 *   - Nhân đôi: chỉ từ câu mức `QUIZ_DOUBLE_MIN_LEVEL` (Vừa) trở lên. Bị khoá thì trả
 *     `LIFELINE_LOCKED` và KHÔNG trừ quyền — người chơi bấm sớm không mất gì.
 */
export function applyLifeline(
  round: Round,
  player: Player,
  kind: LifelineKind,
  index: number,
  now: number,
): LifelineOutcome {
  const q = currentQuizQuestion(round);
  if (round.status !== 'playing' || !q) return { ok: false, code: 'NOT_PLAYING' };
  if (index !== round.quiz.index) return { ok: false, code: 'BAD_INDEX' };
  if (!questionOpen(round, now)) return { ok: false, code: 'QUESTION_CLOSED' };
  if (player.quiz.answer !== null) return { ok: false, code: 'ALREADY_ANSWERED' };
  if (kind === 'double' && q.level < QUIZ_DOUBLE_MIN_LEVEL) return { ok: false, code: 'LIFELINE_LOCKED' };
  if (player.quiz.used[kind] !== undefined) return { ok: false, code: 'LIFELINE_USED' };

  const rnd = mulberry32(seedFromRoundId(`${round.id}:${player.id}:${index}:${kind}`));
  const hints = player.quiz.hints;

  switch (kind) {
    case 'fifty':
      hints.hidden = pickHidden(q, rnd);
      break;
    case 'double':
      hints.doubled = true;
      break;
  }

  player.quiz.used[kind] = index;
  return { ok: true, kind, hints };
}

export function isLifeline(value: string): value is LifelineKind {
  return (QUIZ_LIFELINES as readonly string[]).includes(value);
}

/** 50:50 — giữ lại đáp án đúng và MỘT đáp án sai, bỏ hai đáp án sai còn lại. */
function pickHidden(q: QuizQuestion, rnd: () => number): number[] {
  const wrong = shuffle(
    [0, 1, 2, 3].filter((i) => i !== q.answer),
    rnd,
  );
  return wrong.slice(0, 2).sort((a, b) => a - b);
}

// ───────────────────────── chấm điểm & chuyển pha ─────────────────────────

/** Điểm một câu đúng — công thức nằm ở contract để client hiện đúng con số này. */
export const pointsFor = quizPoints;

/**
 * Công bố đáp án: chấm cả phòng, cộng điểm, ghi phân bố lựa chọn.
 *
 * Người không chọn gì bị tính là sai (chuỗi đúng về 0) — im lặng cũng là một câu
 * trả lời. Gọi lại khi đã ở pha `reveal` là không làm gì: chặn cộng điểm hai lần
 * nếu BTC bấm đúp đúng lúc đồng hồ nền cũng vừa công bố.
 */
export function revealQuestion(round: Round, now: number): boolean {
  const q = currentQuizQuestion(round);
  if (round.status !== 'playing' || !q || round.quiz.phase !== 'question') return false;

  const distribution = [0, 0, 0, 0];
  for (const p of round.players.values()) {
    const { answer, answeredAt } = p.quiz;
    if (answer !== null) distribution[answer] = (distribution[answer] ?? 0) + 1;

    if (answer === q.answer && answeredAt !== null) {
      const base = pointsFor(answeredAt, round.quiz.startedAt, round.quiz.endsAt);
      const points = p.quiz.hints.doubled ? base * 2 : base;
      p.score += points;
      p.correct += 1;
      p.quiz.streak += 1;
      p.quiz.lastDelta = points;
    } else {
      p.wrong += 1;
      p.quiz.streak = 0;
      p.quiz.lastDelta = 0;
    }
    if (answeredAt !== null) p.lastActionAt = answeredAt;
  }

  round.quiz.phase = 'reveal';
  round.quiz.distribution = distribution;
  touch(round);
  return true;
}

/** Sang câu kế. Sau câu cuối thì kết thúc cả lượt. */
export function nextQuestion(round: Round, now: number): 'next' | 'finished' | 'invalid' {
  if (round.status !== 'playing' || round.quiz.phase !== 'reveal') return 'invalid';

  const total = round.quiz.questions?.length ?? 0;
  if (round.quiz.index + 1 >= total) {
    // Đánh dấu mọi người xong rồi để `syncRoundStatus` đóng lượt như mọi game.
    for (const p of round.players.values()) p.finished = true;
    syncRoundStatus(round, now);
    return 'finished';
  }

  round.quiz.index += 1;
  round.quiz.startedAt = now;
  round.quiz.endsAt = now + QUIZ_QUESTION_MS;
  round.quiz.phase = 'question';
  round.quiz.distribution = [];
  for (const p of round.players.values()) resetForQuestion(p);
  touch(round);
  return 'next';
}

/**
 * Đồng hồ nền gọi hàm này cho mọi lượt Ai là triệu phú đang chơi (qua
 * `registerTickHook`). Công bố khi hết giờ hoặc khi cả phòng đã chọn xong.
 *
 * Hết giờ tính cả dung sai mạng, để đáp án bấm đúng giây cuối còn kịp tới nơi.
 */
export function tickQuiz(round: Round, now: number): void {
  if (round.status !== 'playing' || round.quiz.phase !== 'question' || !round.quiz.questions) return;

  const timeUp = now > round.quiz.endsAt + QUIZ_GRACE_MS;
  let everyoneAnswered = round.players.size > 0;
  for (const p of round.players.values()) {
    if (p.quiz.answer === null) {
      everyoneAnswered = false;
      break;
    }
  }
  if (timeUp || everyoneAnswered) revealQuestion(round, now);
}

/** BTC bấm nút trên màn hình điều khiển. */
export type QuizAdvanceResult =
  | { ok: true; state: 'revealed' | 'next' | 'finished' }
  | { ok: false; code: 'NOT_PLAYING' | 'WRONG_PHASE' };

export function advanceQuiz(round: Round, action: 'reveal' | 'next', now: number): QuizAdvanceResult {
  if (round.status !== 'playing' || !round.quiz.questions) return { ok: false, code: 'NOT_PLAYING' };

  if (action === 'reveal') {
    return revealQuestion(round, now)
      ? { ok: true, state: 'revealed' }
      : { ok: false, code: 'WRONG_PHASE' };
  }
  const result = nextQuestion(round, now);
  return result === 'invalid' ? { ok: false, code: 'WRONG_PHASE' } : { ok: true, state: result };
}
