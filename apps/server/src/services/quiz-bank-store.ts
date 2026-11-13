/**
 * KHO CÂU HỎI đang dùng: bộ có sẵn, hoặc bộ BTC vừa import.
 *
 * Sống trong RAM như mọi state khác của app, NHƯNG khác các lượt chơi ở một điểm: bộ
 * đã import còn được ghi ra file (`QUIZ_BANK_FILE`, nằm trong `data/` nên ăn theo
 * volume của Docker) và nạp lại lúc khởi động. Soạn 40 câu rồi server restart giữa
 * chừng mà mất sạch thì không ai chịu nổi; còn lượt chơi cũ thì mất cũng chẳng sao.
 *
 * LƯỢT ĐANG CHƠI KHÔNG BỊ ĐỔI: mỗi lượt chụp bộ câu hỏi vào `round.quiz.questions` ở
 * khoảnh khắc BẮT ĐẦU, nên import giữa buổi chỉ áp cho lượt bắt đầu sau đó.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { QuizBankInfo } from '@clubday/contract';
import { parseQuizImport } from './quiz-import.js';
import { DEFAULT_QUIZ_QUESTIONS, type QuizSource } from './quiz-bank.js';

interface Imported {
  questions: QuizSource[];
  fileName: string | null;
  importedAt: number;
}

let imported: Imported | null = null;

/** Bộ câu hỏi lượt kế tiếp sẽ dùng. */
export function getQuizQuestions(): readonly QuizSource[] {
  return imported?.questions ?? DEFAULT_QUIZ_QUESTIONS;
}

export function getQuizBankInfo(): QuizBankInfo {
  const questions = getQuizQuestions();
  const levels: [number, number, number] = [0, 0, 0];
  for (const q of questions) levels[q.level - 1] = (levels[q.level - 1] ?? 0) + 1;
  return {
    source: imported ? 'imported' : 'default',
    count: questions.length,
    levels,
    fileName: imported?.fileName ?? null,
    importedAt: imported?.importedAt ?? null,
  };
}

/** Thay bộ câu hỏi. Người gọi đã kiểm bằng `parseQuizImport`. */
export function setQuizQuestions(questions: QuizSource[], fileName: string | null, now = Date.now()): void {
  imported = { questions, fileName, importedAt: now };
}

/** Quay về bộ 40 câu có sẵn. */
export function resetQuizQuestions(): void {
  imported = null;
}

// ───────────────────────── lưu / nạp ─────────────────────────

export function saveQuizBank(file: string): void {
  if (!imported) {
    // Quay về mặc định thì xoá dấu vết: ghi bộ rỗng để lần khởi động sau dùng bộ có sẵn.
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ imported: null }));
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ imported }));
}

/**
 * Nạp bộ đã import từ file lúc khởi động. File hỏng → cảnh báo rồi dùng bộ có sẵn:
 * không đáng để cả server không lên được vì một file JSON dở.
 *
 * Nạp lại qua `parseQuizImport` (không tin file chỉ vì nó do chính mình ghi) — file
 * có thể bị sửa tay, hoặc do một phiên bản cũ ghi ra với luật kiểm khác.
 */
export function loadQuizBank(file: string): boolean {
  if (!existsSync(file)) return false;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { imported?: Imported | null };
    if (!parsed.imported) return false;
    const result = parseQuizImport(parsed.imported.questions);
    if (!result.ok) {
      console.warn('  ⚠️  Bộ câu hỏi đã lưu không còn hợp lệ, dùng bộ có sẵn:', result.problems[0]?.message);
      return false;
    }
    imported = {
      questions: result.questions,
      fileName: parsed.imported.fileName ?? null,
      importedAt: parsed.imported.importedAt ?? Date.now(),
    };
    return true;
  } catch (err) {
    console.warn('  ⚠️  Không đọc được bộ câu hỏi đã lưu, dùng bộ có sẵn:', err instanceof Error ? err.message : err);
    return false;
  }
}
