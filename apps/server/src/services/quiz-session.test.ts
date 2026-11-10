import { beforeEach, describe, expect, it } from 'vitest';
import {
  QUIZ_BASE_POINTS,
  QUIZ_DOUBLE_MIN_LEVEL,
  QUIZ_LIFELINES,
  QUIZ_QUESTION_COUNT,
  QUIZ_QUESTION_MS,
  QUIZ_SPEED_POINTS,
} from '@clubday/contract';
import {
  MIN_QUIZ_REACTION_MS,
  QUIZ_GRACE_MS,
  advanceQuiz,
  applyLifeline,
  buildQuizQuestions,
  captainOf,
  currentQuizQuestion,
  formTeams,
  nextQuestion,
  optionSlices,
  pointsFor,
  publicQuiz,
  publicTeams,
  quizMe,
  revealQuestion,
  startQuiz,
  submitQuizAnswer,
  teamOf as teamOfRound,
  tickQuiz,
} from './quiz-session.js';
import { QUIZ_BANK } from './quiz-bank.js';
import { addPlayer, createRound, resetAll, setQuizTeamSize } from '../store/store.js';
import { toRoundState } from '../store/state.js';
import type { Player, QuizTeam, Round } from '../store/types.js';

const T0 = 1_000_000;
const MAX_POINTS = QUIZ_BASE_POINTS + QUIZ_SPEED_POINTS;

/**
 * Mỗi người một đội (đội 1 người): đội trưởng chính là người đó, nên các ca test về chấm điểm,
 * giờ và quyền trợ giúp đọc như "một người chơi". Luật nhiều người nằm ở mục CHƠI THEO ĐỘI.
 */
function setup(players = 3): { round: Round; ps: Player[] } {
  setQuizTeamSize(1);
  const round = createRound('quiz', T0);
  const ps = Array.from({ length: players }, (_, i) => addPlayer(round, `P${i}`, T0));
  round.status = 'playing';
  round.startedAt = T0;
  round.endsAt = T0 + 3_600_000;
  startQuiz(round, T0);
  return { round, ps };
}

/** Đội (1 người) của người chơi `p` — nơi giờ đây giữ đáp án, chuỗi và quyền trợ giúp. */
function teamOf(round: Round, p: Player): QuizTeam {
  return teamOfRound(round, p.id)!;
}

const correctOf = (round: Round): number => currentQuizQuestion(round)!.answer;
const wrongOf = (round: Round): number => (correctOf(round) + 1) % 4;

describe('ngân hàng câu hỏi', () => {
  it('đủ 40 câu, mỗi câu 4 đáp án khác nhau', () => {
    expect(QUIZ_BANK).toHaveLength(QUIZ_QUESTION_COUNT);
    for (const q of QUIZ_BANK) {
      expect(new Set(q.options).size).toBe(4);
      expect(q.text.length).toBeGreaterThan(5);
    }
  });

  it('xếp dễ → khó: mức không bao giờ giảm', () => {
    const levels = QUIZ_BANK.map((q) => q.level);
    expect([...levels].sort()).toEqual(levels);
  });

  it('xáo đáp án nhưng chỉ số đúng vẫn trỏ đúng chữ', () => {
    const qs = buildQuizQuestions(123);
    qs.forEach((q, i) => expect(q.options[q.answer]).toBe(QUIZ_BANK[i]!.options[0]));
  });

  it('cùng seed → cùng đề; khác seed → khác thứ tự đáp án', () => {
    expect(buildQuizQuestions(7)).toEqual(buildQuizQuestions(7));
    expect(buildQuizQuestions(7).map((q) => q.answer)).not.toEqual(
      buildQuizQuestions(8).map((q) => q.answer),
    );
  });
});

describe('điểm giảm dần theo thời gian chọn', () => {
  const start = T0;
  const end = T0 + QUIZ_QUESTION_MS;

  it('chọn ngay lúc câu hiện ra → điểm tối đa', () => {
    expect(pointsFor(start, start, end)).toBe(MAX_POINTS);
  });

  it('chọn đúng giây cuối → chỉ còn điểm nền', () => {
    expect(pointsFor(end, start, end)).toBe(QUIZ_BASE_POINTS);
  });

  it('chọn càng muộn điểm càng thấp (đơn điệu giảm)', () => {
    let prev = Infinity;
    for (let sec = 0; sec <= 30; sec++) {
      const p = pointsFor(start + sec * 1000, start, end);
      expect(p).toBeLessThanOrEqual(prev);
      prev = p;
    }
    expect(pointsFor(start + 5_000, start, end)).toBeGreaterThan(pointsFor(start + 25_000, start, end));
  });

  it('trễ trong dung sai mạng → không âm, vẫn được điểm nền', () => {
    expect(pointsFor(end + 400, start, end)).toBe(QUIZ_BASE_POINTS);
  });

  it('cùng đúng thì người chọn nhanh hơn được nhiều điểm hơn và xếp trên', () => {
    const { round, ps } = setup(2);
    const [fast, slow] = ps as [Player, Player];
    submitQuizAnswer(round, fast, 0, correctOf(round), T0 + 2_000);
    submitQuizAnswer(round, slow, 0, correctOf(round), T0 + 20_000);
    revealQuestion(round, T0 + 21_000);
    expect(fast.score).toBeGreaterThan(slow.score);
    expect(teamOf(round, fast).lastDelta).toBe(fast.score);
    expect(toRoundState(round, T0).players[0]?.id).toBe(fast.id);
  });
});

describe('trả lời', () => {
  beforeEach(() => resetAll());

  it('đúng được cộng điểm lúc công bố, KHÔNG cộng ngay lúc chọn', () => {
    const { round, ps } = setup();
    const p = ps[0]!;
    expect(submitQuizAnswer(round, p, 0, correctOf(round), T0 + 3_000)).toMatchObject({ ok: true });
    expect(p.score).toBe(0);
    revealQuestion(round, T0 + 4_000);
    expect(p.score).toBe(pointsFor(T0 + 3_000, T0, T0 + QUIZ_QUESTION_MS));
    expect(p.correct).toBe(1);
    expect(teamOf(round, p).streak).toBe(1);
  });

  it('sai hoặc bỏ trống → 0 điểm, chuỗi về 0', () => {
    const { round, ps } = setup();
    const [wrong, silent] = ps as [Player, Player];
    submitQuizAnswer(round, wrong, 0, wrongOf(round), T0 + 3_000);
    revealQuestion(round, T0 + 31_000);
    expect(wrong.score).toBe(0);
    expect(silent.score).toBe(0);
    expect(wrong.wrong).toBe(1);
    expect(silent.wrong).toBe(1);
  });

  it('chốt là chốt: chọn lần hai bị từ chối', () => {
    const { round, ps } = setup();
    const p = ps[0]!;
    submitQuizAnswer(round, p, 0, wrongOf(round), T0 + 3_000);
    expect(submitQuizAnswer(round, p, 0, correctOf(round), T0 + 4_000)).toEqual({
      ok: false,
      code: 'ALREADY_ANSWERED',
    });
    expect(teamOf(round, p).answer).toBe(wrongOf(round));
  });

  it('chọn quá nhanh bị từ chối và đánh cờ', () => {
    const { round, ps } = setup();
    const p = ps[0]!;
    expect(submitQuizAnswer(round, p, 0, 1, T0 + MIN_QUIZ_REACTION_MS - 1)).toEqual({
      ok: false,
      code: 'TOO_FAST',
    });
    expect(p.flagged).toBe(true);
    expect(teamOf(round, p).answer).toBeNull();
  });

  it('sai số câu → BAD_INDEX; ô ngoài A–D → BAD_CHOICE', () => {
    const { round, ps } = setup();
    expect(submitQuizAnswer(round, ps[0]!, 1, 0, T0 + 3_000)).toMatchObject({ code: 'BAD_INDEX' });
    expect(submitQuizAnswer(round, ps[0]!, 0, 4, T0 + 3_000)).toMatchObject({ code: 'BAD_CHOICE' });
  });

  it('quá hạn (kể cả dung sai) → QUESTION_CLOSED; trong dung sai vẫn nhận', () => {
    const { round, ps } = setup();
    const end = T0 + QUIZ_QUESTION_MS;
    expect(submitQuizAnswer(round, ps[0]!, 0, 0, end + QUIZ_GRACE_MS)).toMatchObject({ ok: true });
    expect(submitQuizAnswer(round, ps[1]!, 0, 0, end + QUIZ_GRACE_MS + 1)).toMatchObject({
      code: 'QUESTION_CLOSED',
    });
  });

  it('đã công bố rồi thì không chọn được nữa', () => {
    const { round, ps } = setup();
    revealQuestion(round, T0 + 5_000);
    expect(submitQuizAnswer(round, ps[0]!, 0, 0, T0 + 6_000)).toMatchObject({ code: 'QUESTION_CLOSED' });
  });

  it('công bố hai lần không cộng điểm hai lần', () => {
    const { round, ps } = setup();
    submitQuizAnswer(round, ps[0]!, 0, correctOf(round), T0 + 3_000);
    expect(revealQuestion(round, T0 + 4_000)).toBe(true);
    const score = ps[0]!.score;
    expect(revealQuestion(round, T0 + 5_000)).toBe(false);
    expect(ps[0]!.score).toBe(score);
  });
});

describe('chuyển pha', () => {
  beforeEach(() => resetAll());

  it('hết giờ (cộng dung sai) thì đồng hồ tự công bố', () => {
    const { round } = setup();
    tickQuiz(round, T0 + QUIZ_QUESTION_MS + QUIZ_GRACE_MS);
    expect(round.quiz.phase).toBe('question');
    tickQuiz(round, T0 + QUIZ_QUESTION_MS + QUIZ_GRACE_MS + 1);
    expect(round.quiz.phase).toBe('reveal');
  });

  it('cả phòng đã chọn xong thì công bố sớm', () => {
    const { round, ps } = setup(2);
    submitQuizAnswer(round, ps[0]!, 0, 0, T0 + 1_000);
    expect(round.quiz.phase).toBe('question');
    submitQuizAnswer(round, ps[1]!, 0, 1, T0 + 2_000);
    expect(round.quiz.phase).toBe('reveal');
  });

  it('chỉ sang câu kế được khi đã công bố; câu mới xoá lựa chọn cũ', () => {
    const { round, ps } = setup();
    expect(nextQuestion(round, T0 + 1_000)).toBe('invalid');
    submitQuizAnswer(round, ps[0]!, 0, 0, T0 + 2_000);
    revealQuestion(round, T0 + 3_000);
    expect(nextQuestion(round, T0 + 9_000)).toBe('next');
    expect(round.quiz.index).toBe(1);
    expect(round.quiz.endsAt).toBe(T0 + 9_000 + QUIZ_QUESTION_MS);
    expect(teamOf(round, ps[0]!).answer).toBeNull();
  });

  it('sau câu cuối thì lượt kết thúc', () => {
    const { round } = setup();
    for (let i = 0; i < QUIZ_QUESTION_COUNT; i++) {
      revealQuestion(round, T0 + i * 100_000 + 1);
      const r = nextQuestion(round, T0 + i * 100_000 + 2);
      expect(r).toBe(i === QUIZ_QUESTION_COUNT - 1 ? 'finished' : 'next');
    }
    expect(round.status).toBe('done');
  });

  it('advanceQuiz: next khi chưa công bố → WRONG_PHASE', () => {
    const { round } = setup();
    expect(advanceQuiz(round, 'next', T0 + 1)).toEqual({ ok: false, code: 'WRONG_PHASE' });
    expect(advanceQuiz(round, 'reveal', T0 + 2)).toEqual({ ok: true, state: 'revealed' });
  });
});

describe('không lộ đáp án', () => {
  beforeEach(() => resetAll());

  it('đang ở pha question: state công khai KHÔNG có đáp án đúng', () => {
    const { round } = setup();
    const quiz = publicQuiz(round)!;
    expect(quiz.correct).toBeUndefined();
    expect(quiz.explain).toBeUndefined();
    expect(quiz.options).toBeUndefined();
  });

  it('sang pha reveal mới có đáp án và phân bố lựa chọn', () => {
    const { round, ps } = setup(2);
    submitQuizAnswer(round, ps[0]!, 0, 2, T0 + 1_000);
    revealQuestion(round, T0 + 2_000);
    const quiz = publicQuiz(round)!;
    expect(quiz.correct).toBe(correctOf(round));
    expect(quiz.distribution).toEqual([0, 0, 1, 0]);
  });

  it('bảng hạng trong state đã xếp sẵn, kèm điểm vừa nhận', () => {
    const { round, ps } = setup(2);
    submitQuizAnswer(round, ps[1]!, 0, correctOf(round), T0 + 1_000);
    revealQuestion(round, T0 + 2_000);
    const players = toRoundState(round, T0).players;
    expect(players[0]).toMatchObject({ id: ps[1]!.id, rank: 1, delta: ps[1]!.score });
    expect(players[1]).toMatchObject({ rank: 2, delta: 0 });
  });
});

/** Đi tới câu số `index` (bỏ trống các câu trước) để thử quyền ở một mức khó nhất định. */
function goTo(round: Round, index: number): void {
  let t = T0;
  while (round.quiz.index < index) {
    t += 100_000;
    revealQuestion(round, t);
    nextQuestion(round, t + 1);
  }
}

/** Câu đầu tiên của mức "Vừa" — chỗ x2 bắt đầu được dùng. */
const FIRST_MEDIUM = QUIZ_BANK.findIndex((q) => q.level >= QUIZ_DOUBLE_MIN_LEVEL);

describe('quyền trợ giúp', () => {
  beforeEach(() => resetAll());

  it('chỉ còn đúng 2 quyền: 50:50 và nhân đôi', () => {
    expect([...QUIZ_LIFELINES]).toEqual(['fifty', 'double']);
  });

  it('50:50 dùng được ở MỌI mức, kể cả câu dễ đầu tiên', () => {
    const { round, ps } = setup();
    expect(applyLifeline(round, ps[0]!, 'fifty', 0, T0 + 1_000)).toMatchObject({ ok: true });
  });

  it('50:50 chỉ dùng MỘT lần trong cả lượt', () => {
    const { round, ps } = setup();
    const p = ps[0]!;
    expect(applyLifeline(round, p, 'fifty', 0, T0 + 1_000)).toMatchObject({ ok: true });
    expect(applyLifeline(round, p, 'fifty', 0, T0 + 2_000)).toMatchObject({ code: 'LIFELINE_USED' });
    goTo(round, 1);
    expect(applyLifeline(round, p, 'fifty', 1, round.quiz.startedAt + 2_000)).toMatchObject({
      code: 'LIFELINE_USED',
    });
  });

  it('50:50 giữ đáp án đúng và loại đúng hai đáp án sai', () => {
    const { round, ps } = setup();
    const res = applyLifeline(round, ps[0]!, 'fifty', 0, T0 + 1_000);
    if (!res.ok) throw new Error('phải ok');
    const hidden = res.hints.hidden!;
    expect(hidden).toHaveLength(2);
    expect(hidden).not.toContain(correctOf(round));
  });

  it('chọn ô đã bị 50:50 loại thì bị từ chối', () => {
    const { round, ps } = setup();
    const res = applyLifeline(round, ps[0]!, 'fifty', 0, T0 + 1_000);
    if (!res.ok) throw new Error('phải ok');
    expect(submitQuizAnswer(round, ps[0]!, 0, res.hints.hidden![0]!, T0 + 2_000)).toMatchObject({
      code: 'HIDDEN_OPTION',
    });
  });

  it('50:50 tất định: cùng người, cùng câu → cùng kết quả (tải lại không quay số lại)', () => {
    const { round, ps } = setup();
    const p = ps[0]!;
    const first = applyLifeline(round, p, 'fifty', 0, T0 + 1_000);
    const team = teamOf(round, p);
    team.used = {};
    team.hints = {};
    expect(applyLifeline(round, p, 'fifty', 0, T0 + 1_000)).toEqual(first);
  });

  describe('nhân đôi điểm — chỉ từ câu mức Vừa trở lên', () => {
    it('câu đầu của mức Vừa là câu 11 (chỉ số 10)', () => {
      expect(FIRST_MEDIUM).toBe(10);
      expect(QUIZ_BANK.slice(0, FIRST_MEDIUM).every((q) => q.level < QUIZ_DOUBLE_MIN_LEVEL)).toBe(true);
    });

    it('ở câu dễ → LIFELINE_LOCKED, và KHÔNG bị trừ quyền', () => {
      const { round, ps } = setup();
      const p = ps[0]!;
      expect(applyLifeline(round, p, 'double', 0, T0 + 1_000)).toEqual({ ok: false, code: 'LIFELINE_LOCKED' });
      expect(teamOf(round, p).used.double).toBeUndefined();
      expect(teamOf(round, p).hints.doubled).toBeUndefined();
    });

    it('mọi câu dễ (1–10) đều khoá x2', () => {
      const { round, ps } = setup();
      for (let i = 0; i < FIRST_MEDIUM; i++) {
        goTo(round, i);
        const res = applyLifeline(round, ps[0]!, 'double', i, round.quiz.startedAt + 1_000);
        expect(res, `câu ${i + 1}`).toEqual({ ok: false, code: 'LIFELINE_LOCKED' });
      }
    });

    it('từ câu 11 (mức Vừa) dùng được, kể cả sau khi đã bấm nhầm ở câu dễ', () => {
      const { round, ps } = setup();
      applyLifeline(round, ps[0]!, 'double', 0, T0 + 1_000); // bị khoá, không mất quyền
      goTo(round, FIRST_MEDIUM);
      const res = applyLifeline(round, ps[0]!, 'double', FIRST_MEDIUM, round.quiz.startedAt + 1_000);
      expect(res).toMatchObject({ ok: true });
      expect(teamOf(round, ps[0]!).used.double).toBe(FIRST_MEDIUM);
    });

    it('mức Khó cũng dùng được', () => {
      const { round, ps } = setup();
      const hard = QUIZ_BANK.findIndex((q) => q.level === 3);
      goTo(round, hard);
      expect(applyLifeline(round, ps[0]!, 'double', hard, round.quiz.startedAt + 1_000)).toMatchObject({
        ok: true,
      });
    });

    it('chỉ dùng MỘT lần: dùng ở câu 11 rồi thì câu sau hết quyền', () => {
      const { round, ps } = setup();
      goTo(round, FIRST_MEDIUM);
      applyLifeline(round, ps[0]!, 'double', FIRST_MEDIUM, round.quiz.startedAt + 1_000);
      goTo(round, FIRST_MEDIUM + 1);
      expect(
        applyLifeline(round, ps[0]!, 'double', FIRST_MEDIUM + 1, round.quiz.startedAt + 1_000),
      ).toMatchObject({ code: 'LIFELINE_USED' });
    });

    it('đúng thì điểm x2 (so với người cùng chọn cùng lúc)', () => {
      const { round, ps } = setup(2);
      const [dbl, plain] = ps as [Player, Player];
      goTo(round, FIRST_MEDIUM);
      const at = round.quiz.startedAt;
      expect(applyLifeline(round, dbl, 'double', FIRST_MEDIUM, at + 500)).toMatchObject({ ok: true });
      submitQuizAnswer(round, dbl, FIRST_MEDIUM, correctOf(round), at + 3_000);
      submitQuizAnswer(round, plain, FIRST_MEDIUM, correctOf(round), at + 3_000);
      expect(round.quiz.phase).toBe('reveal'); // cả hai đã chọn → công bố sớm
      expect(dbl.score).toBeGreaterThan(0);
      expect(dbl.score).toBe(plain.score * 2);
      expect(teamOf(round, dbl).lastDelta).toBe(dbl.score);
    });

    it('nhân đôi mà sai thì 0 điểm, và quyền vẫn mất', () => {
      const { round, ps } = setup(2);
      const [dbl] = ps as [Player, Player];
      goTo(round, FIRST_MEDIUM);
      const at = round.quiz.startedAt;
      applyLifeline(round, dbl, 'double', FIRST_MEDIUM, at + 500);
      const before = dbl.score;
      submitQuizAnswer(round, dbl, FIRST_MEDIUM, wrongOf(round), at + 3_000);
      revealQuestion(round, at + 4_000);
      expect(dbl.score).toBe(before);
      expect(teamOf(round, dbl).used.double).toBe(FIRST_MEDIUM);
    });
  });

  it('không dùng được sau khi đã chốt đáp án, hay sau khi công bố', () => {
    const { round, ps } = setup();
    submitQuizAnswer(round, ps[0]!, 0, 0, T0 + 1_000);
    expect(applyLifeline(round, ps[0]!, 'fifty', 0, T0 + 2_000)).toMatchObject({ code: 'ALREADY_ANSWERED' });
    revealQuestion(round, T0 + 3_000);
    expect(applyLifeline(round, ps[1]!, 'fifty', 0, T0 + 4_000)).toMatchObject({ code: 'QUESTION_CLOSED' });
  });
});

// ───────────────────────── CHƠI THEO ĐỘI ─────────────────────────

/** Lượt có `players` người, mỗi đội mong muốn `size` người. */
function setupTeams(players: number, size: number): { round: Round; ps: Player[] } {
  resetAll();
  setQuizTeamSize(size);
  const round = createRound('quiz', T0);
  const ps = Array.from({ length: players }, (_, i) => addPlayer(round, `P${i}`, T0));
  round.status = 'playing';
  round.startedAt = T0;
  round.endsAt = T0 + 3_600_000;
  startQuiz(round, T0);
  return { round, ps };
}

const playerOf = (round: Round, id: string): Player => round.players.get(id)!;
const captainPlayer = (round: Round, team: QuizTeam, index = round.quiz.index): Player =>
  playerOf(round, captainOf(team, index));
const readerPlayer = (round: Round, team: QuizTeam, index = round.quiz.index): Player =>
  playerOf(round, team.memberIds.find((id) => id !== captainOf(team, index))!);

describe('chia đội', () => {
  it.each([
    [7, 3, [4, 3]],
    [8, 3, [3, 3, 2]],
    [10, 3, [4, 3, 3]],
    [2, 3, [2]],
    [1, 3, [1]],
    [12, 4, [4, 4, 4]],
    [50, 2, Array(25).fill(2)],
  ])('%i người, đội %i → sĩ số %j (lệch nhau tối đa 1)', (n, size, expected) => {
    const { round } = setupTeams(n, size);
    const sizes = round.quiz.teams.map((t) => t.memberIds.length).sort((a, b) => b - a);
    expect(sizes).toEqual(expected);
  });

  it('mỗi người ở đúng MỘT đội, không sót ai', () => {
    const { round, ps } = setupTeams(11, 3);
    const all = round.quiz.teams.flatMap((t) => t.memberIds);
    expect(all).toHaveLength(ps.length);
    expect(new Set(all).size).toBe(ps.length);
    for (const p of ps) expect(teamOfRound(round, p.id)).not.toBeNull();
  });

  it('chia NGẪU NHIÊN nhưng tất định theo mã lượt: cùng lượt → cùng cách chia', () => {
    const { round } = setupTeams(9, 3);
    const again = formTeams(round, 3).map((t) => t.memberIds);
    expect(again).toEqual(round.quiz.teams.map((t) => t.memberIds));
    // và không chỉ là "đúng thứ tự vào phòng" — nếu vậy thì đâu có ngẫu nhiên
    const joinOrder = [...round.players.keys()];
    expect(round.quiz.teams.flatMap((t) => t.memberIds)).not.toEqual(joinOrder);
  });

  it('mỗi đội có tên và màu riêng', () => {
    const { round } = setupTeams(12, 2);
    expect(new Set(round.quiz.teams.map((t) => t.name)).size).toBe(6);
    expect(new Set(round.quiz.teams.map((t) => t.color)).size).toBe(6);
  });

  it('số người mỗi đội được chốt vào lượt lúc bắt đầu', () => {
    const { round } = setupTeams(6, 3);
    expect(round.quiz.teamSize).toBe(3);
    setQuizTeamSize(2);
    expect(round.quiz.teamSize).toBe(3);
  });
});

describe('đội trưởng xoay vòng', () => {
  it('câu nào cũng có đúng một đội trưởng thuộc đội, và đi hết một vòng thì ai cũng làm một lần', () => {
    const { round } = setupTeams(4, 4);
    const team = round.quiz.teams[0]!;
    const caps = Array.from({ length: team.memberIds.length }, (_, i) => captainOf(team, i));
    expect(new Set(caps).size).toBe(team.memberIds.length);
    expect(captainOf(team, team.memberIds.length)).toBe(captainOf(team, 0));
  });

  it('sang câu kế thì đội trưởng đổi người', () => {
    const { round } = setupTeams(3, 3);
    const team = round.quiz.teams[0]!;
    const first = captainOf(team, 0);
    revealQuestion(round, T0 + 1_000);
    nextQuestion(round, T0 + 2_000);
    expect(captainOf(team, round.quiz.index)).not.toBe(first);
    expect(publicTeams(round)[0]!.captainId).toBe(captainOf(team, 1));
  });
});

describe('chỉ đội trưởng chốt được', () => {
  beforeEach(() => resetAll());

  it('người đọc bấm chốt → NOT_CAPTAIN, đội vẫn chưa chốt', () => {
    const { round } = setupTeams(3, 3);
    const team = round.quiz.teams[0]!;
    const reader = readerPlayer(round, team);
    expect(submitQuizAnswer(round, reader, 0, 1, T0 + 3_000)).toEqual({ ok: false, code: 'NOT_CAPTAIN' });
    expect(team.answer).toBeNull();
  });

  it('đội trưởng chốt thay cho cả đội; sau đó không ai chốt lại được', () => {
    const { round } = setupTeams(6, 3); // 2 đội: đội kia chưa chốt nên câu còn mở
    const team = round.quiz.teams[0]!;
    const cap = captainPlayer(round, team);
    expect(submitQuizAnswer(round, cap, 0, 2, T0 + 3_000)).toMatchObject({ ok: true });
    expect(team.answer).toBe(2);
    expect(submitQuizAnswer(round, cap, 0, 1, T0 + 4_000)).toMatchObject({ code: 'ALREADY_ANSWERED' });
    expect(submitQuizAnswer(round, readerPlayer(round, team), 0, 1, T0 + 4_000)).toMatchObject({
      code: 'NOT_CAPTAIN',
    });
  });

  it('chỉ công bố sớm khi MỌI ĐỘI đã chốt, không phải mọi người', () => {
    const { round } = setupTeams(6, 3); // 2 đội
    const [a, b] = round.quiz.teams as [QuizTeam, QuizTeam];
    submitQuizAnswer(round, captainPlayer(round, a), 0, 0, T0 + 1_000);
    expect(round.quiz.phase).toBe('question');
    submitQuizAnswer(round, captainPlayer(round, b), 0, 0, T0 + 2_000);
    expect(round.quiz.phase).toBe('reveal');
  });

  it('đội đúng được cộng điểm MỘT lần dù có nhiều thành viên; ai trong đội cũng cùng điểm', () => {
    const { round } = setupTeams(6, 3);
    const [a, b] = round.quiz.teams as [QuizTeam, QuizTeam];
    submitQuizAnswer(round, captainPlayer(round, a), 0, correctOf(round), T0 + 3_000);
    submitQuizAnswer(round, captainPlayer(round, b), 0, wrongOf(round), T0 + 3_000);

    const expected = pointsFor(T0 + 3_000, T0, T0 + QUIZ_QUESTION_MS);
    expect(a.score).toBe(expected);
    expect(b.score).toBe(0);
    for (const id of a.memberIds) expect(playerOf(round, id).score).toBe(expected);
    for (const id of b.memberIds) expect(playerOf(round, id).score).toBe(0);
  });

  it('phân bố tính theo ĐỘI, không theo người', () => {
    const { round } = setupTeams(6, 3);
    const [a, b] = round.quiz.teams as [QuizTeam, QuizTeam];
    submitQuizAnswer(round, captainPlayer(round, a), 0, 1, T0 + 3_000);
    submitQuizAnswer(round, captainPlayer(round, b), 0, 1, T0 + 3_000);
    expect(publicQuiz(round)!.distribution).toEqual([0, 2, 0, 0]);
  });

  it('người ngoài đội (không thuộc đội nào) bị từ chối', () => {
    const { round } = setupTeams(3, 3);
    const stranger = addPlayer(round, 'Lạ', T0 + 1);
    expect(submitQuizAnswer(round, stranger, 0, 0, T0 + 3_000)).toMatchObject({ code: 'NOT_PLAYING' });
  });
});

describe('chia đáp án cho người đọc', () => {
  const visibleOf = (round: Round, team: QuizTeam, id: string): number[] =>
    (quizMe(round, playerOf(round, id))?.visible ?? []).map((v) => v.index);

  it('đội 1 người: người đó đọc được cả bốn đáp án', () => {
    const { round, ps } = setupTeams(1, 1);
    expect(quizMe(round, ps[0]!)!.visible.map((v) => v.index)).toEqual([0, 1, 2, 3]);
  });

  it('đội 2 người: đội trưởng KHÔNG đọc được gì, người đọc đọc được cả bốn', () => {
    const { round } = setupTeams(2, 2);
    const team = round.quiz.teams[0]!;
    const cap = captainPlayer(round, team);
    const reader = readerPlayer(round, team);
    expect(quizMe(round, cap)!.visible).toEqual([]);
    expect(quizMe(round, cap)!.role).toBe('captain');
    expect(quizMe(round, reader)!.visible.map((v) => v.index)).toEqual([0, 1, 2, 3]);
    expect(quizMe(round, reader)!.role).toBe('reader');
  });

  it('đội 3 người: hai người đọc chia đôi bốn đáp án, không ai đọc được hết', () => {
    const { round } = setupTeams(3, 3);
    const team = round.quiz.teams[0]!;
    const cap = captainPlayer(round, team);
    const readers = team.memberIds.filter((id) => id !== cap.id);
    const [x, y] = readers.map((id) => visibleOf(round, team, id)) as [number[], number[]];
    expect(x).toHaveLength(2);
    expect(y).toHaveLength(2);
    expect([...x, ...y].sort()).toEqual([0, 1, 2, 3]); // không trùng, không sót
  });

  it('đội 4 người: ba người đọc chia 2+1+1, mọi đáp án đều có người đọc', () => {
    const { round } = setupTeams(4, 4);
    const team = round.quiz.teams[0]!;
    const cap = captainPlayer(round, team);
    const slices = team.memberIds.filter((id) => id !== cap.id).map((id) => visibleOf(round, team, id));
    expect(slices.map((s) => s.length).sort()).toEqual([1, 1, 2]);
    expect(slices.flat().sort()).toEqual([0, 1, 2, 3]);
  });

  it.each([2, 3, 4, 5, 6, 8, 10])('đội %i người: mỗi người đọc ≥ 1 ô, đáp án nào cũng có người đọc', (size) => {
    const { round } = setupTeams(size, size);
    const team = round.quiz.teams[0]!;
    for (let q = 0; q < size; q++) {
      const slices = optionSlices(round, team, q);
      const cap = captainOf(team, q);
      if (size > 1) expect(slices.has(cap), `câu ${q + 1}: đội trưởng không có phần`).toBe(false);
      for (const mine of slices.values()) expect(mine.length).toBeGreaterThanOrEqual(1);
      expect(new Set([...slices.values()].flat())).toEqual(new Set([0, 1, 2, 3]));
    }
  });

  it('cùng người, cùng câu → cùng phần (tải lại trang không quay số lại); câu khác thì có thể khác', () => {
    const { round } = setupTeams(4, 4);
    const team = round.quiz.teams[0]!;
    expect(optionSlices(round, team, 0)).toEqual(optionSlices(round, team, 0));
    const differs = Array.from({ length: 8 }, (_, q) => JSON.stringify([...optionSlices(round, team, q)]));
    expect(new Set(differs).size).toBeGreaterThan(1);
  });

  it('chữ đáp án người đọc nhận khớp đúng với đề', () => {
    const { round } = setupTeams(3, 3);
    const team = round.quiz.teams[0]!;
    const reader = readerPlayer(round, team);
    const q = currentQuizQuestion(round)!;
    for (const v of quizMe(round, reader)!.visible) expect(v.text).toBe(q.options[v.index]);
  });

  it('50:50 gạch ô nào thì ô đó biến khỏi phần của người đọc', () => {
    const { round } = setupTeams(3, 3);
    const team = round.quiz.teams[0]!;
    const cap = captainPlayer(round, team);
    const before = team.memberIds.flatMap((id) => quizMe(round, playerOf(round, id))!.visible.map((v) => v.index));
    expect(before).toHaveLength(4);

    const res = applyLifeline(round, cap, 'fifty', 0, T0 + 1_000);
    if (!res.ok) throw new Error('phải ok');
    const after = team.memberIds.flatMap((id) => quizMe(round, playerOf(round, id))!.visible.map((v) => v.index));
    expect(after).toHaveLength(2);
    for (const h of res.hints.hidden!) expect(after).not.toContain(h);
    expect(quizMe(round, cap)!.hints.hidden).toEqual(res.hints.hidden);
  });

  it('sang pha công bố thì không còn "phần riêng" — mọi đáp án đã công khai', () => {
    const { round, ps } = setupTeams(3, 3);
    revealQuestion(round, T0 + 1_000);
    for (const p of ps) expect(quizMe(round, p)!.visible).toEqual([]);
  });

  it('chưa chia đội (phòng chờ) thì chưa có trạng thái riêng', () => {
    resetAll();
    const round = createRound('quiz', T0);
    const p = addPlayer(round, 'An', T0);
    expect(quizMe(round, p)).toBeNull();
  });
});

describe('không lộ đáp án ra màn hình chiếu', () => {
  beforeEach(() => resetAll());

  it('đang trả lời: state công khai KHÔNG có bốn đáp án, cũng không có chữ của chúng', () => {
    const { round } = setupTeams(6, 3);
    const st = toRoundState(round, T0);
    expect(st.quiz).not.toHaveProperty('options');
    expect(st.quiz).not.toHaveProperty('correct');
    const json = JSON.stringify(st);
    for (const opt of currentQuizQuestion(round)!.options) expect(json).not.toContain(opt);
  });

  it('sang pha công bố mới có bốn đáp án', () => {
    const { round } = setupTeams(6, 3);
    revealQuestion(round, T0 + 1_000);
    const st = toRoundState(round, T0);
    expect(st.quiz!.options).toEqual(currentQuizQuestion(round)!.options);
    expect(st.quiz!.correct).toBe(correctOf(round));
  });

  it('bảng hạng: các đội đã xếp, mọi thành viên mang hạng và điểm của đội', () => {
    const { round } = setupTeams(6, 3);
    const [a, b] = round.quiz.teams as [QuizTeam, QuizTeam];
    submitQuizAnswer(round, captainPlayer(round, b), 0, correctOf(round), T0 + 1_000);
    submitQuizAnswer(round, captainPlayer(round, a), 0, wrongOf(round), T0 + 1_000);

    const st = toRoundState(round, T0);
    expect(st.teams!.map((t) => t.id)).toEqual([b.id, a.id]);
    expect(st.teams![0]).toMatchObject({ rank: 1, score: b.score, delta: b.score });
    expect(st.teams![1]).toMatchObject({ rank: 2, score: 0, delta: 0 });
    for (const p of st.players) {
      const team = st.teams!.find((t) => t.id === p.teamId)!;
      expect(p).toMatchObject({ rank: team.rank, score: team.score });
    }
  });

  it('phòng chờ chỉ báo số người mỗi đội, chưa có đội', () => {
    resetAll();
    setQuizTeamSize(4);
    const round = createRound('quiz', T0);
    addPlayer(round, 'An', T0);
    const st = toRoundState(round, T0);
    expect(st.teamSize).toBe(4);
    expect(st.teams).toBeUndefined();
  });
});

describe('quyền trợ giúp là của ĐỘI', () => {
  beforeEach(() => resetAll());

  it('người đọc không dùng được quyền, đội trưởng thì được — và không bị trừ khi bị từ chối', () => {
    const { round } = setupTeams(3, 3);
    const team = round.quiz.teams[0]!;
    expect(applyLifeline(round, readerPlayer(round, team), 'fifty', 0, T0 + 1_000)).toEqual({
      ok: false,
      code: 'NOT_CAPTAIN',
    });
    expect(team.used.fifty).toBeUndefined();
    expect(applyLifeline(round, captainPlayer(round, team), 'fifty', 0, T0 + 1_000)).toMatchObject({ ok: true });
  });

  it('đã dùng thì cả đội hết quyền, kể cả khi đội trưởng đổi người', () => {
    const { round } = setupTeams(3, 3);
    const team = round.quiz.teams[0]!;
    applyLifeline(round, captainPlayer(round, team), 'fifty', 0, T0 + 1_000);
    revealQuestion(round, T0 + 2_000);
    nextQuestion(round, T0 + 3_000);
    const next = captainPlayer(round, team);
    expect(next.id).not.toBe(captainOf(team, 0));
    expect(applyLifeline(round, next, 'fifty', 1, T0 + 4_000)).toMatchObject({ code: 'LIFELINE_USED' });
  });

  it('x2 của đội: đội đúng thì điểm gấp đôi đội cùng chọn cùng lúc', () => {
    const { round } = setupTeams(4, 2); // 2 đội x 2 người
    const [a, b] = round.quiz.teams as [QuizTeam, QuizTeam];
    // đi tới câu mức Vừa
    for (let i = 0; i < FIRST_MEDIUM; i++) {
      revealQuestion(round, T0 + (i + 1) * 100_000);
      nextQuestion(round, T0 + (i + 1) * 100_000 + 1);
    }
    const at = round.quiz.startedAt;
    expect(applyLifeline(round, captainPlayer(round, a), 'double', FIRST_MEDIUM, at + 500)).toMatchObject({ ok: true });
    submitQuizAnswer(round, captainPlayer(round, a), FIRST_MEDIUM, correctOf(round), at + 3_000);
    submitQuizAnswer(round, captainPlayer(round, b), FIRST_MEDIUM, correctOf(round), at + 3_000);
    expect(a.score).toBeGreaterThan(0);
    expect(a.score).toBe(b.score * 2);
  });
});
