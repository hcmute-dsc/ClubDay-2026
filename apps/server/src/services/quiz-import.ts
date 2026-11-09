/**
 * ĐỌC & KIỂM TRA file câu hỏi do BTC import.
 *
 * File này là dữ liệu từ NGOÀI vào, do người gõ tay — nên kiểm kỹ và báo lỗi bằng
 * lời người đọc được ("Câu 7: có 3 đáp án, cần đúng 4"), kèm số thứ tự câu. Một lỗi
 * lọt qua đây sẽ nổ giữa lúc đang thi trước cả hội trường, nên chốt chặn nằm ở cửa
 * vào chứ không rải rác ở nơi dùng.
 *
 * ĐỊNH DẠNG (mảng trực tiếp, hoặc bọc trong `{ "questions": [...] }`):
 *
 *   {
 *     "questions": [
 *       {
 *         "text": "Thủ đô của Việt Nam là gì?",
 *         "options": ["Hà Nội", "Huế", "Đà Nẵng", "Cần Thơ"],
 *         "answer": "A",
 *         "level": 1,
 *         "category": "fun",
 *         "explain": "Hà Nội là thủ đô từ năm 1010."
 *       }
 *     ]
 *   }
 *
 *   text      bắt buộc — nội dung câu hỏi
 *   options   bắt buộc — ĐÚNG 4 đáp án, không trùng nhau
 *   answer    bắt buộc — chữ "A"–"D" (hoặc số 0–3: 0 là A). Chữ cho khỏi nhầm 0/1.
 *   level     không bắt buộc, mặc định 2 — 1/2/3 hoặc "dễ"/"vừa"/"khó". Quyết định
 *             Nhân đôi (x2) có dùng được ở câu này không (từ mức 2 trở lên).
 *   category  không bắt buộc — nhãn hiện cạnh câu hỏi, ví dụ "tech", "code", "fun"
 *   explain   không bắt buộc — một câu giải thích hiện lúc công bố đáp án
 *
 * Thứ tự trong file = thứ tự câu khi chơi. Vị trí A/B/C/D vẫn được xáo mỗi lượt, nên
 * "answer" chỉ nói đáp án nào đúng chứ không cố định đáp án nằm ở ô nào.
 */
import { QUIZ_DOUBLE_MIN_LEVEL, QUIZ_MAX_QUESTIONS, QUIZ_OPTION_COUNT, type QuizImportProblem } from '@clubday/contract';
import type { QuizSource } from './quiz-bank.js';

const MAX_TEXT = 300;
const MAX_OPTION = 120;
const MAX_CATEGORY = 30;
const MAX_EXPLAIN = 300;
/** Báo tối đa chừng này lỗi — file hỏng cả trăm chỗ thì 30 lỗi đầu là đủ để sửa. */
const MAX_PROBLEMS = 30;

export type QuizImportResult =
  | { ok: true; questions: QuizSource[]; warnings: string[] }
  | { ok: false; problems: QuizImportProblem[] };

const LEVEL_WORDS: Record<string, 1 | 2 | 3> = {
  easy: 1, 'dễ': 1, de: 1,
  medium: 2, 'vừa': 2, vua: 2, 'trung bình': 2, 'trung binh': 2,
  hard: 3, 'khó': 3, kho: 3,
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Chuỗi đã cắt khoảng trắng, hoặc `null` nếu không phải chuỗi. */
const str = (v: unknown): string | null => (typeof v === 'string' ? v.trim() : null);

function parseAnswer(v: unknown): number | string {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < QUIZ_OPTION_COUNT) return v;
  if (typeof v === 'string') {
    const letter = v.trim().toUpperCase();
    const at = 'ABCD'.indexOf(letter);
    if (letter.length === 1 && at >= 0) return at;
    if (/^\d+$/.test(letter)) return 'Dùng chữ A, B, C hoặc D (hoặc số 0–3 với 0 là A) — số "' + v + '" dễ bị hiểu nhầm là bắt đầu từ 1.';
  }
  return 'Thiếu "answer" hoặc sai: phải là chữ A, B, C hoặc D.';
}

function parseLevel(v: unknown): 1 | 2 | 3 | string {
  if (v === undefined || v === null || v === '') return 2;
  if (v === 1 || v === 2 || v === 3) return v;
  if (typeof v === 'string') {
    const word = LEVEL_WORDS[v.trim().toLowerCase()];
    if (word) return word;
    if (v.trim() === '1' || v.trim() === '2' || v.trim() === '3') return Number(v.trim()) as 1 | 2 | 3;
  }
  return '"level" phải là 1, 2, 3 (hoặc "dễ", "vừa", "khó").';
}

/** Kiểm một câu. Trả về câu đã chuẩn hoá, hoặc danh sách lỗi của câu đó. */
function parseOne(raw: unknown): QuizSource | string[] {
  if (!isRecord(raw)) return ['mỗi câu phải là một đối tượng { "text": …, "options": […], "answer": … }.'];
  const errors: string[] = [];

  const text = str(raw.text);
  if (!text) errors.push('thiếu nội dung câu hỏi ("text").');
  else if (text.length > MAX_TEXT) errors.push(`câu hỏi dài ${text.length} ký tự, tối đa ${MAX_TEXT}.`);

  let options: string[] = [];
  if (!Array.isArray(raw.options)) {
    errors.push('thiếu danh sách đáp án ("options").');
  } else if (raw.options.length !== QUIZ_OPTION_COUNT) {
    errors.push(`có ${raw.options.length} đáp án, cần đúng ${QUIZ_OPTION_COUNT}.`);
  } else {
    const cleaned = raw.options.map(str);
    if (cleaned.some((o) => !o)) errors.push('có đáp án để trống hoặc không phải chữ.');
    else {
      options = cleaned as string[];
      const tooLong = options.findIndex((o) => o.length > MAX_OPTION);
      if (tooLong >= 0) errors.push(`đáp án ${'ABCD'[tooLong]} dài quá ${MAX_OPTION} ký tự.`);
      const seen = new Set<string>();
      for (const o of options) {
        const key = o.toLowerCase();
        if (seen.has(key)) {
          errors.push(`đáp án "${o}" bị trùng.`);
          break;
        }
        seen.add(key);
      }
    }
  }

  const answer = parseAnswer(raw.answer);
  if (typeof answer === 'string') errors.push(answer);

  const level = parseLevel(raw.level);
  if (typeof level === 'string') errors.push(level);

  const category = raw.category === undefined || raw.category === null ? '' : str(raw.category);
  if (category === null) errors.push('"category" phải là chữ.');
  else if (category.length > MAX_CATEGORY) errors.push(`"category" dài quá ${MAX_CATEGORY} ký tự.`);

  const explain = raw.explain === undefined || raw.explain === null ? '' : str(raw.explain);
  if (explain === null) errors.push('"explain" phải là chữ.');
  else if (explain.length > MAX_EXPLAIN) errors.push(`"explain" dài quá ${MAX_EXPLAIN} ký tự.`);

  if (errors.length > 0) return errors;
  return {
    text: text as string,
    options,
    answer: answer as number,
    level: level as 1 | 2 | 3,
    category: category as string,
    explain: explain as string,
  };
}

/**
 * Kiểm cả file. Thành công → danh sách câu đã chuẩn hoá (+ cảnh báo không chặn).
 * Thất bại → MỌI lỗi tìm được (tới `MAX_PROBLEMS`), để BTC sửa một lượt thay vì
 * sửa một lỗi rồi nạp lại để thấy lỗi kế tiếp.
 */
export function parseQuizImport(raw: unknown): QuizImportResult {
  const list = Array.isArray(raw) ? raw : isRecord(raw) ? raw.questions : undefined;
  if (!Array.isArray(list)) {
    return {
      ok: false,
      problems: [{ question: null, message: 'File phải là một mảng câu hỏi, hoặc { "questions": [ … ] }.' }],
    };
  }
  if (list.length === 0) return { ok: false, problems: [{ question: null, message: 'File không có câu hỏi nào.' }] };
  if (list.length > QUIZ_MAX_QUESTIONS) {
    return {
      ok: false,
      problems: [{ question: null, message: `Có ${list.length} câu, tối đa ${QUIZ_MAX_QUESTIONS}.` }],
    };
  }

  const questions: QuizSource[] = [];
  const problems: QuizImportProblem[] = [];
  let hidden = 0;

  list.forEach((item, i) => {
    const one = parseOne(item);
    if (Array.isArray(one)) {
      for (const message of one) {
        if (problems.length < MAX_PROBLEMS) problems.push({ question: i + 1, message });
        else hidden += 1;
      }
    } else questions.push(one);
  });

  if (problems.length > 0) {
    if (hidden > 0) problems.push({ question: null, message: `… và ${hidden} lỗi khác.` });
    return { ok: false, problems };
  }

  // Cảnh báo: file hợp lệ nhưng có thể không phải thứ BTC định làm.
  const warnings: string[] = [];
  if (!questions.some((q) => q.level >= QUIZ_DOUBLE_MIN_LEVEL)) {
    warnings.push('Không có câu nào mức "vừa" trở lên, nên quyền Nhân đôi (x2) sẽ không dùng được lượt này.');
  }
  const unordered = questions.findIndex((q, i) => i > 0 && q.level < (questions[i - 1] as QuizSource).level);
  if (unordered >= 0) {
    warnings.push(`Các câu không xếp từ dễ đến khó (câu ${unordered + 1} dễ hơn câu liền trước). Vẫn dùng đúng thứ tự trong file.`);
  }
  const questionsText = new Set<string>();
  for (const [i, q] of questions.entries()) {
    const key = q.text.toLowerCase();
    if (questionsText.has(key)) {
      warnings.push(`Câu ${i + 1} trùng nội dung với một câu phía trước.`);
      break;
    }
    questionsText.add(key);
  }
  return { ok: true, questions, warnings };
}
