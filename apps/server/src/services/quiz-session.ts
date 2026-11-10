/**
 * TRỌNG TÀI của game Ai là triệu phú — bản CHƠI THEO ĐỘI.
 *
 * KHÁC bốn game còn lại ở một điều căn bản: cả lượt đi CÙNG NHAU qua từng câu. Bốn
 * game kia mỗi người chạy đua riêng trên một đồng hồ chung; ở đây có một MÁY
 * TRẠNG THÁI chung của cả phòng, và BTC là người bấm chuyển:
 *
 *      question ──(hết giờ | đội nào cũng đã chốt | BTC bấm)──▶ reveal
 *         ▲                                                  │
 *         └───────────(BTC bấm "Câu tiếp theo")──────────────┘
 *                                       (sau câu cuối: lượt kết thúc)
 *
 *   - `question`: đáp án còn ĐÓNG. Mỗi đội chốt MỘT đáp án.
 *   - `reveal`:   đáp án đã MỞ, điểm đã cộng, bảng hạng đội đã cập nhật.
 *
 * LUẬT ĐỘI — ép các thành viên phải nói chuyện với nhau:
 *   1. Khi BTC bấm BẮT ĐẦU, server chia ngẫu nhiên người chơi thành các đội.
 *   2. Màn hình chiếu và `RoundState` chỉ có CÂU HỎI; bốn đáp án chỉ ra ngoài ở pha reveal.
 *   3. Mỗi câu, đội có một ĐỘI TRƯỞNG (xoay vòng theo số câu). Chỉ đội trưởng chốt đáp
 *      án và dùng quyền trợ giúp được — nhưng điện thoại của họ chỉ có nút A–D, không chữ.
 *   4. Các thành viên còn lại là NGƯỜI ĐỌC: bốn đáp án được chia cho họ, mỗi người nhận
 *      một phần (xem `optionSlices`). Muốn biết đủ phải đọc to cho nhau nghe.
 *
 * Nguyên tắc như mọi game ở đây: điểm do SERVER quyết định. Client chỉ gửi "câu số
 * mấy, đội tôi chọn ô nào" — không gửi điểm, không gửi thời gian. Thời gian trả lời
 * là giờ server nhận được gói, không phải giờ trên đồng hồ của điện thoại.
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
  quizTeamCount,
  quizTeamIdentity,
  type LifelineKind,
  type QuizMe,
  type QuizPublic,
  type QuizTeamPublic,
} from '@clubday/contract';
import { mulberry32, randInt } from '../lib/prng.js';
import { syncRoundStatus } from '../store/lobby.js';
import { getQuizTeamSize, touch } from '../store/store.js';
import type { Player, QuizHints, QuizQuestion, QuizTeam, Round } from '../store/types.js';
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
 * Chốt đáp án nhanh hơn mức này kể từ lúc câu hỏi hiện ra thì không phải người.
 * Đọc xong một câu hỏi và chạm vào màn hình mất ít nhất vài trăm ms.
 */
export const MIN_QUIZ_REACTION_MS = 350;

/** Gộp các lần "có đội vừa chốt" thành tối đa một lần đẩy SSE trong chừng này ms. */
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

/** Chạy khi BTC bấm BẮT ĐẦU: chia đội, sinh đề và mở câu đầu tiên. */
export function startQuiz(round: Round, now: number): void {
  const teamSize = getQuizTeamSize();
  round.quiz = {
    // Chụp bộ câu hỏi ở đúng khoảnh khắc bắt đầu: import giữa buổi chỉ áp cho lượt SAU.
    questions: round.quiz.questions ?? buildQuizQuestions(seedFromRoundId(round.id), getQuizQuestions()),
    index: 0,
    phase: 'question',
    startedAt: now,
    endsAt: now + QUIZ_QUESTION_MS,
    distribution: [],
    teamSize,
    teams: formTeams(round, teamSize),
  };
}

// ───────────────────────── chia đội ─────────────────────────

/**
 * Chia ngẫu nhiên người chơi thành các đội, SĨ SỐ LỆCH NHAU TỐI ĐA 1.
 *
 * Số đội = số đội gần nhất với `số người / teamSize` (7 người, đội 3 → 2 đội: 4 + 3), luôn
 * có ít nhất một đội. Xáo bằng PRNG có seed từ mã lượt: cùng lượt, cùng danh sách → cùng
 * cách chia, nên test lặp lại được. Thứ tự trong `memberIds` là thứ tự xoay đội trưởng.
 */
export function formTeams(round: Round, teamSize: number): QuizTeam[] {
  const ids = [...round.players.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.id);
  if (ids.length === 0) return [];

  const order = shuffle(ids, mulberry32(seedFromRoundId(`${round.id}:teams`)));
  const count = Math.min(quizTeamCount(order.length, teamSize), order.length);
  const base = Math.floor(order.length / count);
  const extra = order.length % count;

  const teams: QuizTeam[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0);
    const { name, color } = quizTeamIdentity(i);
    teams.push({
      id: `T${i + 1}`,
      name,
      color,
      memberIds: order.slice(cursor, cursor + size),
      score: 0,
      correct: 0,
      wrong: 0,
      answer: null,
      answeredAt: null,
      streak: 0,
      lastDelta: 0,
      used: {},
      hints: {},
    });
    cursor += size;
  }
  return teams;
}

export function teamOf(round: Round, playerId: string): QuizTeam | null {
  return round.quiz.teams.find((t) => t.memberIds.includes(playerId)) ?? null;
}

/** Xoá những gì chỉ có nghĩa trong MỘT câu. Quyền trợ giúp đã dùng thì giữ nguyên. */
function resetForQuestion(team: QuizTeam): void {
  team.answer = null;
  team.answeredAt = null;
  team.lastDelta = 0;
  team.hints = {};
}

export function currentQuizQuestion(round: Round): QuizQuestion | null {
  return round.quiz.questions?.[round.quiz.index] ?? null;
}

// ───────────────────────── vai trò trong đội ─────────────────────────

/**
 * Đội trưởng của câu `index`: xoay vòng theo thứ tự `memberIds`. Câu 1 người đầu, câu 2
 * người thứ hai… nên ai cũng làm đội trưởng và ai cũng biết trước khi nào tới lượt mình.
 */
export function captainOf(team: QuizTeam, index: number): string {
  return team.memberIds[index % team.memberIds.length] as string;
}

/**
 * Chia bốn đáp án cho NGƯỜI ĐỌC của đội ở câu `index` — trái tim của luật "phải nói chuyện".
 *
 *   - Đội 1 người: người đó vừa là đội trưởng vừa đọc được cả bốn (không còn ai để chia).
 *   - Chỉ 1 người đọc (đội 2 người): người đó đọc được cả bốn, đội trưởng phải nghe họ.
 *   - 2–4 người đọc: bốn đáp án chia vòng tròn, mỗi người ≥ 1 ô, và mọi ô đều có người đọc
 *     (3 người đọc → 2+1+1).
 *   - Hơn 4 người đọc: mỗi người một ô, ô dư được nhiều người cùng đọc.
 *
 * Thứ tự ô được xáo bằng PRNG có seed theo (lượt, đội, câu) nên cùng một người ở cùng một
 * câu luôn thấy cùng phần — tải lại trang không "quay số" lại được — còn câu sau chia khác.
 */
export function optionSlices(round: Round, team: QuizTeam, index: number): Map<string, number[]> {
  const captain = captainOf(team, index);
  const readers = team.memberIds.filter((id) => id !== captain);
  const all = Array.from({ length: QUIZ_OPTION_COUNT }, (_, i) => i);
  const out = new Map<string, number[]>();

  if (readers.length === 0) {
    out.set(captain, all);
    return out;
  }
  if (readers.length === 1) {
    out.set(readers[0] as string, all);
    return out;
  }

  const order = shuffle(all, mulberry32(seedFromRoundId(`${round.id}:${team.id}:${index}:slice`)));
  readers.forEach((id, j) => {
    const mine =
      readers.length <= QUIZ_OPTION_COUNT
        ? order.filter((_, k) => k % readers.length === j)
        : [order[j % QUIZ_OPTION_COUNT] as number];
    out.set(id, mine.sort((a, b) => a - b));
  });
  return out;
}

// ───────────────────────── nhìn từ bên ngoài ─────────────────────────

/**
 * Phần câu hỏi được phép gửi cho MỌI người (qua SSE) — màn hình chiếu và điện thoại.
 *
 * BỐN ĐÁP ÁN và ĐÁP ÁN ĐÚNG chỉ được lộ khi phase = `reveal`. Đây là chỗ DUY NHẤT quyết
 * định điều đó: trước pha reveal mà `options` hay `correct` rò ra thì cả phòng đọc được
 * hết từ màn hình chiếu, và toàn bộ luật "đọc to cho nhau" thành vô nghĩa.
 */
export function publicQuiz(round: Round): QuizPublic | undefined {
  const q = currentQuizQuestion(round);
  if (round.game !== 'quiz' || round.status !== 'playing' || !q) return undefined;

  let answered = 0;
  for (const t of round.quiz.teams) if (t.answer !== null) answered += 1;

  const view: QuizPublic = {
    total: round.quiz.questions?.length ?? QUIZ_QUESTION_COUNT,
    index: round.quiz.index,
    phase: round.quiz.phase,
    startedAt: round.quiz.startedAt,
    endsAt: round.quiz.endsAt,
    text: q.text,
    category: q.category,
    level: q.level,
    answered,
  };
  if (round.quiz.phase === 'reveal') {
    view.options = q.options;
    view.correct = q.answer;
    view.distribution = round.quiz.distribution;
    view.explain = q.explain;
  }
  return view;
}

/**
 * Xếp hạng các đội: điểm cao hơn → nhiều câu đúng hơn → đội lập trước. Server xếp một
 * lần ở đây để màn hình chiếu và điện thoại không bao giờ cãi nhau về đội nào hạng 2.
 */
export function rankedTeams(round: Round): QuizTeam[] {
  const order = new Map(round.quiz.teams.map((t, i) => [t.id, i]));
  return [...round.quiz.teams].sort(
    (a, b) =>
      b.score - a.score || b.correct - a.correct || (order.get(a.id) as number) - (order.get(b.id) as number),
  );
}

/** Các đội như cả phòng thấy, đã xếp hạng. Rỗng khi chưa chia đội. */
export function publicTeams(round: Round): QuizTeamPublic[] {
  return rankedTeams(round).map((t, i) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    members: t.memberIds.map((id) => ({ id, name: round.players.get(id)?.name ?? '?' })),
    captainId: captainOf(t, round.quiz.index),
    score: t.score,
    rank: i + 1,
    answered: t.answer !== null,
    delta: t.lastDelta,
    correct: t.correct,
    wrong: t.wrong,
  }));
}

/**
 * Trạng thái RIÊNG của một người chơi — dùng khi vào lượt và khi tải lại trang. Đây là
 * chỗ duy nhất bốn đáp án đi ra trước pha công bố, và mỗi người chỉ nhận phần của mình.
 * `null` nếu người này không thuộc đội nào (lượt chưa bắt đầu).
 */
export function quizMe(round: Round, player: Player): QuizMe | null {
  const team = teamOf(round, player.id);
  const q = currentQuizQuestion(round);
  if (!team || !q) return null;

  const index = round.quiz.index;
  const captainId = captainOf(team, index);
  const solo = team.memberIds.length === 1;
  const role = captainId === player.id ? 'captain' : 'reader';

  // Chỉ ở pha question mới có "phần được đọc"; sang reveal mọi đáp án đã công khai.
  let visible: QuizMe['visible'] = [];
  if (round.quiz.phase === 'question') {
    const mine = optionSlices(round, team, index).get(player.id) ?? [];
    const hidden = team.hints.hidden ?? [];
    visible = mine.filter((i) => !hidden.includes(i)).map((i) => ({ index: i, text: q.options[i] as string }));
    // Đội trưởng của đội >1 người không đọc được chữ nào: ô của họ chỉ có A–D.
    if (role === 'captain' && !solo) visible = [];
  }

  return {
    index,
    phase: round.quiz.phase,
    teamId: team.id,
    teamName: team.name,
    teamColor: team.color,
    role,
    captainId,
    captainName: round.players.get(captainId)?.name ?? '?',
    visible,
    answer: team.answer,
    used: team.used,
    hints: team.hints,
    score: team.score,
    streak: team.streak,
    correct: team.correct,
    wrong: team.wrong,
    delta: team.lastDelta,
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
  | 'NOT_CAPTAIN'
  | 'TOO_FAST';

export type QuizAnswerOutcome = { ok: true; choice: number } | { ok: false; code: QuizFailure };

/** Còn nhận đáp án cho câu này không? Dùng chung cho trả lời và trợ giúp. */
function questionOpen(round: Round, now: number): boolean {
  return round.quiz.phase === 'question' && now <= round.quiz.endsAt + QUIZ_GRACE_MS;
}

/**
 * Đội trưởng chốt đáp án cho CẢ ĐỘI. Các chốt chặn, theo thứ tự:
 *   1. Lượt đang chơi, đề đã sinh và người này thuộc một đội.
 *   2. Đúng câu đang mở — chặn trả lời muộn cho câu trước, hoặc nhảy trước câu sau.
 *   3. Câu còn mở: chưa công bố, chưa quá hạn (có dung sai mạng).
 *   4. Là ĐỘI TRƯỞNG của câu này — người đọc không chốt thay được.
 *   5. Ô hợp lệ và không nằm trong số bị 50:50 loại.
 *   6. Đội chưa chốt — chốt là chốt, không đổi.
 *   7. Không nhanh tới mức vô lý — nhanh hơn thế là script, đánh cờ.
 */
export function submitQuizAnswer(
  round: Round,
  player: Player,
  index: number,
  choice: number,
  now: number,
): QuizAnswerOutcome {
  const team = teamOf(round, player.id);
  if (round.status !== 'playing' || !round.quiz.questions || !team) return { ok: false, code: 'NOT_PLAYING' };
  if (index !== round.quiz.index) return { ok: false, code: 'BAD_INDEX' };
  if (!questionOpen(round, now)) return { ok: false, code: 'QUESTION_CLOSED' };
  if (captainOf(team, index) !== player.id) return { ok: false, code: 'NOT_CAPTAIN' };
  if (!Number.isInteger(choice) || choice < 0 || choice >= QUIZ_OPTION_COUNT) {
    return { ok: false, code: 'BAD_CHOICE' };
  }
  if (team.hints.hidden?.includes(choice)) return { ok: false, code: 'HIDDEN_OPTION' };
  if (team.answer !== null) return { ok: false, code: 'ALREADY_ANSWERED' };

  if (now - round.quiz.startedAt < MIN_QUIZ_REACTION_MS) {
    player.flagged = true;
    return { ok: false, code: 'TOO_FAST' };
  }

  team.answer = choice;
  team.answeredAt = now;

  // Đội nào cũng đã chốt thì công bố luôn, khỏi bắt cả phòng ngồi chờ hết giờ.
  // Gọi thẳng chứ không qua hook đồng hồ: không phụ thuộc việc route đã đăng ký hay chưa.
  tickQuiz(round, now);
  if (round.quiz.phase === 'question') broadcastSoon(round);
  return { ok: true, choice };
}

/**
 * Đẩy SSE "bao nhiêu đội đã chốt" — nhưng GỘP lại.
 *
 * Nhiều đội chốt trong vài giây mà mỗi lần đẩy một bản trạng thái cho 50 máy là
 * hàng nghìn gói chỉ để một con số trên màn hình chiếu nhích lên. Gộp thành tối đa
 * một lần mỗi `ANSWER_BROADCAST_MS`.
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
 * Đội trưởng dùng một quyền trợ giúp CỦA ĐỘI. Mỗi quyền MỘT lần trong cả lượt.
 *
 * Kết quả do server tính từ đáp án THẬT rồi gửi tới các thành viên; client không bao giờ
 * có đủ thông tin để tự suy ra. Hạt giống gồm mã lượt + đội + số câu + loại quyền, nên
 * cùng một đội ở cùng một câu luôn nhận cùng kết quả — tải lại trang không "quay số lại" được.
 *
 * Phải dùng TRƯỚC khi chốt đáp án: 50:50 sau khi đã chọn thì vô nghĩa.
 *
 * Chỉ có hai quyền:
 *   - 50:50: dùng ở mọi câu.
 *   - Nhân đôi: chỉ từ câu mức `QUIZ_DOUBLE_MIN_LEVEL` (Vừa) trở lên. Bị khoá thì trả
 *     `LIFELINE_LOCKED` và KHÔNG trừ quyền — bấm sớm không mất gì.
 */
export function applyLifeline(
  round: Round,
  player: Player,
  kind: LifelineKind,
  index: number,
  now: number,
): LifelineOutcome {
  const q = currentQuizQuestion(round);
  const team = teamOf(round, player.id);
  if (round.status !== 'playing' || !q || !team) return { ok: false, code: 'NOT_PLAYING' };
  if (index !== round.quiz.index) return { ok: false, code: 'BAD_INDEX' };
  if (!questionOpen(round, now)) return { ok: false, code: 'QUESTION_CLOSED' };
  if (captainOf(team, index) !== player.id) return { ok: false, code: 'NOT_CAPTAIN' };
  if (team.answer !== null) return { ok: false, code: 'ALREADY_ANSWERED' };
  if (kind === 'double' && q.level < QUIZ_DOUBLE_MIN_LEVEL) return { ok: false, code: 'LIFELINE_LOCKED' };
  if (team.used[kind] !== undefined) return { ok: false, code: 'LIFELINE_USED' };

  const rnd = mulberry32(seedFromRoundId(`${round.id}:${team.id}:${index}:${kind}`));

  switch (kind) {
    case 'fifty':
      team.hints.hidden = pickHidden(q, rnd);
      break;
    case 'double':
      team.hints.doubled = true;
      break;
  }

  team.used[kind] = index;
  touch(round); // cả đội (và màn chiếu) thấy thay đổi ngay
  return { ok: true, kind, hints: team.hints };
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
 * Công bố đáp án: chấm từng ĐỘI, cộng điểm, ghi phân bố lựa chọn.
 *
 * Đội không chốt gì bị tính là sai (chuỗi đúng về 0) — im lặng cũng là một câu trả lời.
 * Điểm đội được chép sang từng thành viên để mọi chỗ đọc `Player.score` vẫn khớp. Gọi
 * lại khi đã ở pha `reveal` là không làm gì: chặn cộng điểm hai lần nếu BTC bấm đúp
 * đúng lúc đồng hồ nền cũng vừa công bố.
 */
export function revealQuestion(round: Round, now: number): boolean {
  const q = currentQuizQuestion(round);
  if (round.status !== 'playing' || !q || round.quiz.phase !== 'question') return false;

  const distribution = [0, 0, 0, 0];
  for (const t of round.quiz.teams) {
    const { answer, answeredAt } = t;
    if (answer !== null) distribution[answer] = (distribution[answer] ?? 0) + 1;

    if (answer === q.answer && answeredAt !== null) {
      const base = pointsFor(answeredAt, round.quiz.startedAt, round.quiz.endsAt);
      const points = t.hints.doubled ? base * 2 : base;
      t.score += points;
      t.correct += 1;
      t.streak += 1;
      t.lastDelta = points;
    } else {
      t.wrong += 1;
      t.streak = 0;
      t.lastDelta = 0;
    }

    for (const id of t.memberIds) {
      const p = round.players.get(id);
      if (!p) continue;
      p.score = t.score;
      p.correct = t.correct;
      p.wrong = t.wrong;
      if (answeredAt !== null) p.lastActionAt = answeredAt;
    }
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
  for (const t of round.quiz.teams) resetForQuestion(t);
  touch(round);
  return 'next';
}

/**
 * Đồng hồ nền gọi hàm này cho mọi lượt Ai là triệu phú đang chơi (qua
 * `registerTickHook`). Công bố khi hết giờ hoặc khi đội nào cũng đã chốt.
 *
 * Hết giờ tính cả dung sai mạng, để đáp án bấm đúng giây cuối còn kịp tới nơi.
 */
export function tickQuiz(round: Round, now: number): void {
  if (round.status !== 'playing' || round.quiz.phase !== 'question' || !round.quiz.questions) return;

  const timeUp = now > round.quiz.endsAt + QUIZ_GRACE_MS;
  const everyoneAnswered = round.quiz.teams.length > 0 && round.quiz.teams.every((t) => t.answer !== null);
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
