import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Download, FileJson, RotateCcw, TriangleAlert, Upload } from 'lucide-react';
import { api, importProblems, type QuizBankQuestion } from '../../lib/api';
import { QUIZ_SAMPLE_JSON } from '../../lib/quiz-sample';
import { QUIZ_MAX_QUESTIONS, QUIZ_OPTION_LETTERS, type QuizBankInfo, type QuizImportProblem } from '../../lib/types';

/** File quá lớn thì khỏi đọc: 100 câu chỉ vài chục KB, và server cũng giới hạn ~1MB. */
const MAX_FILE_BYTES = 1_000_000;
const LEVEL_NAME = { 1: 'Dễ', 2: 'Vừa', 3: 'Khó' } as const;

export interface QuizImportPanelProps {
  token: string;
  /** Báo cho trang quản trị khi bộ câu hỏi đổi (để cập nhật "N câu" ở ô trò chơi). */
  onChanged?: (info: QuizBankInfo) => void;
}

/**
 * Nhập bộ câu hỏi cho Ai là triệu phú từ file JSON.
 *
 * Ba điều khiến panel này dùng được giữa lúc đang chuẩn bị sự kiện:
 *   1. File sai thì báo LỖI THEO SỐ CÂU, đủ một lượt ("Câu 7: có 3 đáp án, cần đúng 4"),
 *      và KHÔNG đổi gì — bộ đang dùng vẫn nguyên. Sửa một lượt rồi nạp lại là xong.
 *   2. Luôn thấy đang dùng bộ nào (có sẵn / đã import) và có bao nhiêu câu mỗi mức.
 *   3. Xem lại được nội dung kèm đáp án đúng sau khi nạp, để soát trước khi lên sân khấu.
 */
export function QuizImportPanel({ token, onChanged }: QuizImportPanelProps) {
  const [info, setInfo] = useState<QuizBankInfo | null>(null);
  const [questions, setQuestions] = useState<QuizBankQuestion[]>([]);
  const [showList, setShowList] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<QuizImportProblem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.quizQuestions(token);
      setInfo(res.info);
      setQuestions(res.questions);
    } catch {
      /* sai mã quản trị đã được trang Admin báo — panel chỉ im lặng không hiện gì */
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function clearMessages(): void {
    setProblems([]);
    setWarnings([]);
    setNotice('');
    setError('');
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cho phép chọn lại ĐÚNG file đó lần nữa sau khi sửa: nếu giữ nguyên giá trị thì
    // trình duyệt không phát sự kiện change và BTC tưởng nút hỏng.
    e.target.value = '';
    if (!file) return;
    clearMessages();

    if (file.size > MAX_FILE_BYTES) {
      setError(`File quá lớn (${Math.round(file.size / 1024)} KB). Bộ ${QUIZ_MAX_QUESTIONS} câu chỉ vài chục KB.`);
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setError('Đây không phải file JSON hợp lệ — kiểm tra dấu phẩy, ngoặc và dấu nháy kép.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.importQuiz(data, file.name, token);
      setInfo(res.info);
      setWarnings(res.warnings);
      setNotice(
        `Đã nạp ${res.info.count} câu từ ${file.name}.` +
          (res.saved ? '' : ' ⚠️ Chưa ghi được ra đĩa — restart server sẽ mất bộ này.'),
      );
      onChanged?.(res.info);
      await reload();
    } catch (err) {
      const found = importProblems(err);
      if (found) setProblems(found);
      else setError('Không import được (kiểm tra mã quản trị và kết nối).');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm('Bỏ bộ câu hỏi đã import và quay về 40 câu có sẵn?')) return;
    clearMessages();
    setBusy(true);
    try {
      const res = await api.resetQuiz(token);
      setInfo(res.info);
      onChanged?.(res.info);
      setNotice('Đã quay về 40 câu có sẵn.');
      await reload();
    } catch {
      setError('Không khôi phục được.');
    } finally {
      setBusy(false);
    }
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([QUIZ_SAMPLE_JSON], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cau-hoi-mau.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const imported = info?.source === 'imported';

  return (
    <section className="card space-y-4 p-5" aria-labelledby="quiz-import-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="quiz-import-heading" className="flex items-center gap-2 font-display text-lg font-black uppercase tracking-tight">
            <FileJson aria-hidden="true" className="h-5 w-5 text-quiz" />
            Câu hỏi Ai là triệu phú
          </h2>
          <p role="status" className="mt-1 text-sm text-muted">
            {info ? (
              <>
                Đang dùng <b className="text-fg">{imported ? 'bộ đã import' : 'bộ 40 câu có sẵn'}</b>
                {imported && info.fileName ? ` (${info.fileName})` : ''} ·{' '}
                <b className="text-fg tabular-nums">{info.count} câu</b>
                <span className="tabular-nums">
                  {' '}
                  — {info.levels[0]} dễ · {info.levels[1]} vừa · {info.levels[2]} khó
                </span>
              </>
            ) : (
              'Nhập mã quản trị để xem bộ câu hỏi.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void onFile(e)}
            className="sr-only"
            aria-label="Chọn file câu hỏi JSON"
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || !token}
            className="btn btn-accent btn-sm"
          >
            <Upload aria-hidden="true" className="h-4 w-4" />
            Import file JSON
          </button>
          <button type="button" onClick={downloadSample} className="btn btn-ghost btn-sm">
            <Download aria-hidden="true" className="h-4 w-4" />
            File mẫu
          </button>
          {imported && (
            <button type="button" onClick={() => void reset()} disabled={busy} className="btn btn-ghost btn-sm">
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Dùng bộ có sẵn
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p role="status" className="border-2 border-correct bg-correct/10 px-3 py-2 text-sm font-semibold">
          {notice}
          <span className="mt-1 block text-xs font-normal text-muted">
            Áp dụng cho lượt BẮT ĐẦU từ giờ. Lượt đang chơi giữ nguyên bộ đề của nó.
          </span>
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1 border-2 border-warn bg-warn/10 px-3 py-2 text-sm" aria-label="Cảnh báo">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              {w}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 border-2 border-wrong bg-wrong/10 px-3 py-2 text-sm font-semibold text-wrong">
          <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {problems.length > 0 && (
        <div role="alert" className="border-2 border-wrong bg-wrong/10 px-3 py-2 text-sm">
          <p className="mb-2 flex items-center gap-2 font-bold text-wrong">
            <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
            File chưa hợp lệ — chưa đổi gì cả. Sửa các lỗi sau rồi import lại:
          </p>
          <ul className="max-h-60 space-y-1 overflow-auto">
            {problems.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-16 shrink-0 font-mono font-black">{p.question ? `Câu ${p.question}` : 'File'}</span>
                <span>{p.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-secondary">Định dạng file</summary>
        <div className="mt-2 space-y-2 text-muted">
          <p>
            Một mảng câu hỏi (hoặc <code className="text-fg">{'{ "questions": [ … ] }'}</code>), tối đa {QUIZ_MAX_QUESTIONS} câu.
            Mỗi câu có <b className="text-fg">đúng 4 đáp án</b>; thứ tự trong file là thứ tự khi chơi, còn vị trí A–D được xáo
            mỗi lượt.
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li><code className="text-fg">text</code> — câu hỏi (bắt buộc)</li>
            <li><code className="text-fg">options</code> — 4 đáp án, không trùng nhau (bắt buộc)</li>
            <li><code className="text-fg">answer</code> — đáp án đúng: chữ <b className="text-fg">"A"–"D"</b> (hoặc số 0–3, 0 là A) (bắt buộc)</li>
            <li><code className="text-fg">level</code> — 1/2/3 hoặc "dễ"/"vừa"/"khó", mặc định 2. Nhân đôi (x2) chỉ dùng được từ mức 2</li>
            <li><code className="text-fg">category</code> — nhãn hiện cạnh câu hỏi, ví dụ "tech" (tuỳ chọn)</li>
            <li><code className="text-fg">explain</code> — một câu giải thích hiện lúc công bố (tuỳ chọn)</li>
          </ul>
          <pre className="max-h-64 overflow-auto border-2 border-line bg-surface-2 p-3 text-xs text-fg">{QUIZ_SAMPLE_JSON}</pre>
        </div>
      </details>

      {info && questions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            aria-expanded={showList}
            className="text-sm font-semibold text-secondary underline-offset-4 hover:underline"
          >
            {showList ? 'Ẩn' : 'Xem'} {questions.length} câu hỏi (kèm đáp án)
          </button>
          {showList && (
            <ol className="mt-3 max-h-96 space-y-3 overflow-auto pr-1" aria-label="Danh sách câu hỏi">
              {questions.map((q, i) => (
                <li key={i} className="border-2 border-line bg-surface-2 p-3 text-sm">
                  <p className="font-bold">
                    <span className="mr-2 font-mono text-muted">{i + 1}.</span>
                    {q.text}
                    <span className="ml-2 border border-line px-1.5 text-[0.65rem] font-black uppercase">{LEVEL_NAME[q.level]}</span>
                  </p>
                  <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">
                    {q.options.map((o, k) => (
                      <li key={k} className={k === q.answer ? 'font-bold text-correct' : 'text-muted'}>
                        {QUIZ_OPTION_LETTERS[k]}. {o}
                        {k === q.answer && ' ✓'}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
