import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUIZ_MAX_QUESTIONS } from '@clubday/contract';
import { parseQuizImport } from './quiz-import.js';
import {
  getQuizBankInfo,
  getQuizQuestions,
  loadQuizBank,
  resetQuizQuestions,
  saveQuizBank,
  setQuizQuestions,
} from './quiz-bank-store.js';
import { DEFAULT_QUIZ_QUESTIONS } from './quiz-bank.js';
import { buildQuizQuestions, startQuiz } from './quiz-session.js';
import { addPlayer, createRound, resetAll } from '../store/store.js';

const q = (over: Record<string, unknown> = {}) => ({
  text: 'Thủ đô của Việt Nam là gì?',
  options: ['Hà Nội', 'Huế', 'Đà Nẵng', 'Cần Thơ'],
  answer: 'A',
  level: 1,
  ...over,
});

const ok = (raw: unknown) => {
  const r = parseQuizImport(raw);
  if (!r.ok) throw new Error('phải hợp lệ: ' + JSON.stringify(r.problems));
  return r;
};
const bad = (raw: unknown) => {
  const r = parseQuizImport(raw);
  if (r.ok) throw new Error('phải bị từ chối');
  return r.problems;
};

describe('parseQuizImport — định dạng', () => {
  it('nhận mảng trực tiếp', () => {
    expect(ok([q()]).questions).toHaveLength(1);
  });

  it('nhận dạng bọc { "questions": [...] }', () => {
    expect(ok({ questions: [q(), q({ text: 'Câu hai?' })] }).questions).toHaveLength(2);
  });

  it('không phải mảng cũng không có "questions" → lỗi chung của cả file', () => {
    expect(bad({ foo: 1 })).toEqual([{ question: null, message: expect.stringContaining('mảng câu hỏi') }]);
    expect(bad('xin chào')[0]?.question).toBeNull();
    expect(bad(null)[0]?.question).toBeNull();
    expect(bad(undefined)[0]?.question).toBeNull();
  });

  it('mảng rỗng và quá nhiều câu đều bị từ chối', () => {
    expect(bad([])[0]?.message).toContain('không có câu hỏi nào');
    const many = Array.from({ length: QUIZ_MAX_QUESTIONS + 1 }, (_, i) => q({ text: `Câu ${i}?` }));
    expect(bad(many)[0]?.message).toContain(`tối đa ${QUIZ_MAX_QUESTIONS}`);
    expect(ok(many.slice(0, QUIZ_MAX_QUESTIONS)).questions).toHaveLength(QUIZ_MAX_QUESTIONS);
  });

  it('chuẩn hoá: cắt khoảng trắng, điền mặc định cho level/category/explain', () => {
    const [one] = ok([{ text: '  Hỏi gì?  ', options: [' a ', 'b', 'c', 'd'], answer: 'b' }]).questions;
    expect(one).toEqual({ text: 'Hỏi gì?', options: ['a', 'b', 'c', 'd'], answer: 1, level: 2, category: '', explain: '' });
  });

  it('bỏ qua trường lạ thay vì báo lỗi', () => {
    expect(ok([{ ...q(), extra: 123, note: 'x' }]).questions).toHaveLength(1);
  });
});

describe('parseQuizImport — answer', () => {
  it.each([
    ['A', 0], ['b', 1], ['C', 2], [' d ', 3], [0, 0], [3, 3],
  ])('%j → chỉ số %i', (answer, index) => {
    expect(ok([q({ answer })]).questions[0]?.answer).toBe(index);
  });

  it.each([['E'], ['AB'], [4], [-1], [1.5], [null], [undefined], [true]])('%j bị từ chối', (answer) => {
    expect(bad([q({ answer })])[0]).toMatchObject({ question: 1 });
  });

  it('số dạng chuỗi ("1") bị từ chối kèm lời nhắc dùng chữ — tránh nhầm 0/1', () => {
    expect(bad([q({ answer: '1' })])[0]?.message).toContain('Dùng chữ A, B, C hoặc D');
  });
});

describe('parseQuizImport — đáp án & câu hỏi', () => {
  it('không đúng 4 đáp án → báo rõ có bao nhiêu', () => {
    expect(bad([q({ options: ['a', 'b', 'c'] })])[0]?.message).toContain('có 3 đáp án, cần đúng 4');
    expect(bad([q({ options: ['a', 'b', 'c', 'd', 'e'] })])[0]?.message).toContain('có 5 đáp án');
    expect(bad([q({ options: 'abcd' })])[0]?.message).toContain('thiếu danh sách đáp án');
  });

  it('đáp án trống / không phải chữ / trùng nhau (không phân biệt hoa thường)', () => {
    expect(bad([q({ options: ['a', '', 'c', 'd'] })])[0]?.message).toContain('để trống');
    expect(bad([q({ options: ['a', 1, 'c', 'd'] })])[0]?.message).toContain('để trống hoặc không phải chữ');
    expect(bad([q({ options: ['Hà Nội', 'hà nội', 'c', 'd'] })])[0]?.message).toContain('bị trùng');
  });

  it('câu hỏi trống hoặc quá dài; đáp án quá dài', () => {
    expect(bad([q({ text: '   ' })])[0]?.message).toContain('thiếu nội dung câu hỏi');
    expect(bad([q({ text: 'x'.repeat(301) })])[0]?.message).toContain('tối đa 300');
    expect(bad([q({ options: ['a', 'b', 'c', 'x'.repeat(121)] })])[0]?.message).toContain('đáp án D dài quá');
  });

  it('mục không phải đối tượng', () => {
    expect(bad(['chuỗi', 5])).toHaveLength(2);
  });
});

describe('parseQuizImport — level', () => {
  it.each([
    [1, 1], [2, 2], [3, 3], ['dễ', 1], ['Vừa', 2], ['KHÓ', 3], ['easy', 1], ['medium', 2], ['hard', 3], ['2', 2],
  ])('%j → mức %i', (level, expected) => {
    expect(ok([q({ level })]).questions[0]?.level).toBe(expected);
  });

  it('bỏ trống → mặc định 2 (Vừa)', () => {
    expect(ok([q({ level: undefined })]).questions[0]?.level).toBe(2);
  });

  it.each([[0], [4], ['cực khó'], [1.5]])('%j bị từ chối', (level) => {
    expect(bad([q({ level })])[0]?.message).toContain('"level"');
  });
});

describe('parseQuizImport — báo lỗi cho người sửa file', () => {
  it('gom MỌI lỗi một lượt, kèm số câu (đếm từ 1)', () => {
    const problems = bad([q(), q({ answer: 'Z' }), q({ options: ['a', 'b'] }), q(), q({ text: '' })]);
    expect(problems.map((p) => p.question)).toEqual([2, 3, 5]);
  });

  it('một câu nhiều lỗi thì báo đủ từng lỗi', () => {
    const problems = bad([q({ text: '', answer: 'Z', level: 9 })]);
    expect(problems).toHaveLength(3);
    expect(problems.every((p) => p.question === 1)).toBe(true);
  });

  it('file hỏng hàng trăm chỗ thì cắt ở 30 lỗi và nói còn bao nhiêu', () => {
    const problems = bad(Array.from({ length: 60 }, () => q({ answer: 'Z' })));
    expect(problems.length).toBe(31);
    expect(problems.at(-1)).toEqual({ question: null, message: '… và 30 lỗi khác.' });
  });
});

describe('parseQuizImport — cảnh báo (file vẫn hợp lệ)', () => {
  it('toàn câu dễ → cảnh báo x2 không dùng được', () => {
    const r = ok([q(), q({ text: 'Hai?' })]);
    expect(r.warnings.some((w) => w.includes('Nhân đôi'))).toBe(true);
  });

  it('có câu mức vừa thì không cảnh báo x2', () => {
    expect(ok([q(), q({ text: 'Hai?', level: 2 })]).warnings.some((w) => w.includes('Nhân đôi'))).toBe(false);
  });

  it('không xếp từ dễ đến khó → cảnh báo, nhưng giữ NGUYÊN thứ tự file', () => {
    const r = ok([q({ level: 3 }), q({ text: 'Hai?', level: 1 })]);
    expect(r.warnings.some((w) => w.includes('không xếp từ dễ đến khó'))).toBe(true);
    expect(r.questions.map((x) => x.level)).toEqual([3, 1]);
  });

  it('trùng nội dung câu hỏi → cảnh báo', () => {
    expect(ok([q(), q()]).warnings.some((w) => w.includes('trùng nội dung'))).toBe(true);
  });
});

describe('buildQuizQuestions với bộ import', () => {
  it('chỉ số đáp án đúng bám theo CHỮ sau khi xáo, dù file đặt đáp án đúng ở ô nào', () => {
    const { questions } = ok([
      q({ answer: 'A' }),
      q({ text: 'B?', answer: 'B', options: ['w', 'x', 'y', 'z'] }),
      q({ text: 'D?', answer: 'D', options: ['w', 'x', 'y', 'z'] }),
    ]);
    for (const seed of [1, 2, 3, 99, 12345]) {
      const built = buildQuizQuestions(seed, questions);
      expect(built.map((b) => b.options[b.answer])).toEqual(['Hà Nội', 'x', 'z']);
    }
  });

  it('số câu của lượt = số câu trong file, giữ thứ tự', () => {
    const { questions } = ok([q({ text: 'Một?' }), q({ text: 'Hai?' }), q({ text: 'Ba?' })]);
    expect(buildQuizQuestions(5, questions).map((b) => b.text)).toEqual(['Một?', 'Hai?', 'Ba?']);
  });
});

describe('kho câu hỏi', () => {
  let dir: string;
  beforeEach(() => {
    resetQuizQuestions();
    resetAll();
    dir = mkdtempSync(join(tmpdir(), 'quiz-bank-'));
  });
  afterEach(() => {
    resetQuizQuestions();
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('mặc định là bộ 40 câu có sẵn', () => {
    expect(getQuizQuestions()).toBe(DEFAULT_QUIZ_QUESTIONS);
    expect(getQuizBankInfo()).toMatchObject({ source: 'default', count: 40, levels: [10, 15, 15], fileName: null });
  });

  it('import xong thì lượt BẮT ĐẦU sau đó dùng bộ mới', () => {
    const { questions } = ok([q({ text: 'Chỉ một câu thôi?' })]);
    setQuizQuestions(questions, 'de.json', 1234);
    expect(getQuizBankInfo()).toMatchObject({ source: 'imported', count: 1, fileName: 'de.json', importedAt: 1234 });

    const round = createRound('quiz', 0);
    addPlayer(round, 'An', 0);
    startQuiz(round, 0);
    expect(round.quiz.questions).toHaveLength(1);
    expect(round.quiz.questions?.[0]?.text).toBe('Chỉ một câu thôi?');
  });

  it('lượt ĐANG CHƠI giữ nguyên bộ đề của nó khi BTC import giữa chừng', () => {
    const round = createRound('quiz', 0);
    addPlayer(round, 'An', 0);
    startQuiz(round, 0);
    const before = round.quiz.questions;

    setQuizQuestions(ok([q({ text: 'Bộ mới?' })]).questions, null);
    expect(round.quiz.questions).toBe(before);
    expect(round.quiz.questions).toHaveLength(40);
  });

  it('reset quay về bộ có sẵn', () => {
    setQuizQuestions(ok([q()]).questions, 'x.json');
    resetQuizQuestions();
    expect(getQuizBankInfo().source).toBe('default');
  });

  it('lưu rồi nạp lại (giả lập khởi động lại server)', () => {
    const file = join(dir, 'sub', 'q.json'); // thư mục con chưa có → phải tự tạo
    setQuizQuestions(ok([q({ text: 'Giữ lại?', level: 3, explain: 'Vì sao' })]).questions, 'de.json', 99);
    saveQuizBank(file);

    resetQuizQuestions();
    expect(loadQuizBank(file)).toBe(true);
    expect(getQuizQuestions()[0]).toMatchObject({ text: 'Giữ lại?', level: 3, explain: 'Vì sao', answer: 0 });
    expect(getQuizBankInfo()).toMatchObject({ fileName: 'de.json', importedAt: 99 });
  });

  it('reset rồi lưu → lần khởi động sau dùng bộ có sẵn', () => {
    const file = join(dir, 'q.json');
    setQuizQuestions(ok([q()]).questions, null);
    saveQuizBank(file);
    resetQuizQuestions();
    saveQuizBank(file);
    expect(loadQuizBank(file)).toBe(false);
    expect(getQuizBankInfo().source).toBe('default');
  });

  it('chưa có file → bộ có sẵn, không lỗi', () => {
    expect(loadQuizBank(join(dir, 'khong-co.json'))).toBe(false);
  });

  it('file hỏng / không phải JSON → cảnh báo và dùng bộ có sẵn, KHÔNG sập', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const file = join(dir, 'hong.json');
    writeFileSync(file, '{ không phải json');
    expect(loadQuizBank(file)).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(getQuizBankInfo().source).toBe('default');
  });

  it('file hợp lệ JSON nhưng nội dung sai (bị sửa tay) → không tin, dùng bộ có sẵn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const file = join(dir, 'sai.json');
    writeFileSync(file, JSON.stringify({ imported: { questions: [{ text: 'x', options: ['a'], answer: 9 }], importedAt: 1 } }));
    expect(loadQuizBank(file)).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(readFileSync(file, 'utf8')).toContain('"imported"'); // không tự xoá file của người dùng
  });
});

describe('file mẫu của BTC', () => {
  it('chính file mẫu tải về phải qua được bộ kiểm tra — mẫu không được lệch khỏi luật', async () => {
    const { QUIZ_IMPORT_SAMPLE } = await import('@clubday/contract');
    const r = parseQuizImport(JSON.parse(JSON.stringify(QUIZ_IMPORT_SAMPLE)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.questions.map((x) => x.level)).toEqual([1, 2, 3]);
      expect(r.warnings).toEqual([]); // mẫu tốt thì không có cảnh báo nào
      expect(r.questions.map((x) => x.answer)).toEqual([0, 0, 1]); // "A", 0, "B"
    }
  });
});
