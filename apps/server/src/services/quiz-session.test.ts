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
  currentQuizQuestion,
  nextQuestion,
  pointsFor,
  publicQuiz,
  revealQuestion,
  startQuiz,
  submitQuizAnswer,
  tickQuiz,
} from './quiz-session.js';
import { QUIZ_BANK } from './quiz-bank.js';
import { addPlayer, createRound, resetAll } from '../store/store.js';
import { toRoundState } from '../store/state.js';
import type { Player, Round } from '../store/types.js';

const T0 = 1_000_000;
const MAX_POINTS = QUIZ_BASE_POINTS + QUIZ_SPEED_POINTS;

function setup(players = 3): { round: Round; ps: Player[] } {
  const round = createRound('quiz', T0);
  const ps = Array.from({ length: players }, (_, i) => addPlayer(round, `P${i}`, T0));
  round.status = 'playing';
  round.startedAt = T0;
  round.endsAt = T0 + 3_600_000;
  startQuiz(round, T0);
  return { round, ps };
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
    expect(fast.quiz.lastDelta).toBe(fast.score);
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
    expect(p.quiz.streak).toBe(1);
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
    expect(p.quiz.answer).toBe(wrongOf(round));
  });

  it('chọn quá nhanh bị từ chối và đánh cờ', () => {
    const { round, ps } = setup();
    const p = ps[0]!;
    expect(submitQuizAnswer(round, p, 0, 1, T0 + MIN_QUIZ_REACTION_MS - 1)).toEqual({
      ok: false,
      code: 'TOO_FAST',
    });
    expect(p.flagged).toBe(true);
    expect(p.quiz.answer).toBeNull();
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
    expect(ps[0]!.quiz.answer).toBeNull();
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
    expect(JSON.stringify(toRoundState(round, T0))).not.toContain('"correct"');
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
    p.quiz.used = {};
    p.quiz.hints = {};
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
      expect(p.quiz.used.double).toBeUndefined();
      expect(p.quiz.hints.doubled).toBeUndefined();
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
      expect(ps[0]!.quiz.used.double).toBe(FIRST_MEDIUM);
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
      dbl.score = 0;
      plain.score = 0;
      submitQuizAnswer(round, dbl, FIRST_MEDIUM, correctOf(round), at + 3_000);
      submitQuizAnswer(round, plain, FIRST_MEDIUM, correctOf(round), at + 3_000);
      expect(round.quiz.phase).toBe('reveal'); // cả hai đã chọn → công bố sớm
      expect(dbl.score).toBeGreaterThan(0);
      expect(dbl.score).toBe(plain.score * 2);
      expect(dbl.quiz.lastDelta).toBe(dbl.score);
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
      expect(dbl.quiz.used.double).toBe(FIRST_MEDIUM);
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
