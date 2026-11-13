import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Eye,
  Flag,
  House,
  KeyRound,
  Lightbulb,
  MessageCircle,
  Play,
  TriangleAlert,
  Trophy,
  Users,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { quizApi } from '../lib/api-quiz';
import { loadAdminToken, saveAdminToken } from '../lib/session';
import { useRoundStream } from '../lib/sse';
import { useCountdown } from '../lib/useCountdown';
import { formatClock } from '../lib/format';
import { Shell } from '../components/Shell';
import { Avatar } from '../components/Avatar';
import { ConnectionPill, Spinner } from '../components/Chips';
import { QrCode } from '../components/QrCode';
import { RankTable } from '../components/RankTable';
import { LiveBoard } from '../components/quiz/LiveBoard';
import { QuizOptions } from '../components/quiz/QuizOptions';
import { QUIZ_QUESTION_MS, quizTeamCount, type DashboardRow, type RoundState } from '../lib/types';

const LEVEL_LABEL = { 1: 'Dễ', 2: 'Vừa', 3: 'Khó' } as const;
const CATEGORY_LABEL: Record<string, string> = { tech: 'Công nghệ', code: 'Lập trình', fun: 'Vui' };

/** Đồng hồ cỡ lớn cho máy chiếu: cả hội trường nhìn được con số còn lại. */
function BigTimer({ endsAt }: { endsAt: number }) {
  const remaining = useCountdown(endsAt);
  const urgent = remaining > 0 && remaining <= 10_000;
  const ratio = Math.max(0, Math.min(1, remaining / QUIZ_QUESTION_MS));
  return (
    <div className={`card min-w-48 px-5 py-3 ${urgent ? 'border-wrong' : ''}`}>
      <span
        role="timer"
        className={`block text-center font-display text-6xl font-black tabular-nums leading-none ${
          urgent ? 'animate-throb text-wrong' : ''
        }`}
      >
        {formatClock(remaining)}
      </span>
      <div className="mt-2 h-3 overflow-hidden border-2 border-line bg-surface-2">
        <div
          className={`h-full w-full origin-left transition-transform duration-100 ease-linear ${urgent ? 'bg-wrong' : 'bg-accent'}`}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}

/**
 * MÀN HÌNH ĐIỀU KHIỂN + MÁY CHIẾU của Ai là triệu phú (chỉ BTC mở).
 *
 * Một màn hình làm hai việc: cả hội trường nhìn câu hỏi + bảng hạng trực tiếp, còn
 * BTC bấm một nút duy nhất để đi tiếp. Nút đó đổi nghĩa theo pha (BẮT ĐẦU → CÔNG BỐ
 * ĐÁP ÁN → CÂU TIẾP THEO → KẾT THÚC), nên BTC không phải nhớ đang ở đâu — và phím
 * cách bấm thay được, để tay không phải rời bàn phím giữa lúc đang dẫn chương trình.
 *
 * Chơi THEO ĐỘI nên màn chiếu lúc đang trả lời CỐ Ý chỉ có câu hỏi, đồng hồ và tình
 * trạng từng đội — KHÔNG có bốn đáp án. Đáp án nằm rải trên điện thoại các thành viên
 * (mỗi người một phần) để cả đội phải đọc to cho nhau; chiếu lên đây thì ai ngẩng đầu
 * lên cũng đọc được hết. Bốn đáp án chỉ hiện sau khi công bố.
 *
 * Quyền thật nằm ở server (`x-admin-token`); màn hình này không có đáp án nào mà
 * người khác không có: đáp án chỉ xuất hiện trong state SAU KHI công bố.
 */
export function QuizHost() {
  const { roundId = '' } = useParams<{ roundId: string }>();
  const [token, setToken] = useState(loadAdminToken);
  const [state, setState] = useState<RoundState | null>(null);
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const connected = useRoundStream(roundId, setState);

  useEffect(() => {
    api.state(roundId).then(setState).catch(() => setError('Không tải được lượt này.'));
  }, [roundId]);

  useEffect(() => {
    saveAdminToken(token);
  }, [token]);

  const done = state?.status === 'done';
  useEffect(() => {
    if (!done) return;
    api.dashboard(roundId).then((r) => setRows(r.rows)).catch(() => undefined);
  }, [done, roundId]);

  const quiz = state?.quiz;
  const lastQuestion = !!quiz && quiz.index + 1 >= quiz.total;

  /** Nút chính của pha hiện tại. `null` = hết việc để bấm. */
  const primary = useMemo(() => {
    if (!state) return null;
    if (state.status === 'lobby') {
      return { label: 'Bắt đầu', icon: Play, run: () => api.startRound(roundId, token), off: state.players.length === 0 };
    }
    if (state.status === 'playing' && quiz) {
      return quiz.phase === 'question'
        ? { label: 'Công bố đáp án', icon: Eye, run: () => quizApi.advance(roundId, 'reveal', token), off: false }
        : {
            label: lastQuestion ? 'Kết thúc & xem kết quả' : 'Câu tiếp theo',
            icon: lastQuestion ? Flag : ArrowRight,
            run: () => quizApi.advance(roundId, 'next', token),
            off: false,
          };
    }
    return null;
  }, [state, quiz, lastQuestion, roundId, token]);

  async function act() {
    if (!primary || primary.off || busy || !token) return;
    setBusy(true);
    setError('');
    try {
      await primary.run();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Sai mã quản trị (ADMIN_TOKEN).'
          : 'Thao tác thất bại, thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }

  // Phím cách = nút chính. Bỏ qua khi đang gõ vào ô nhập mã.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;
      e.preventDefault();
      void act();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const joinUrl = `${window.location.origin}/r/${roundId}`;

  if (!state) {
    return (
      <Shell full>
        {error ? (
          <p role="alert" className="card flex items-center gap-2 p-6 text-wrong">
            <TriangleAlert aria-hidden="true" className="h-5 w-5" />
            {error}
          </p>
        ) : (
          <Spinner label="Đang tải lượt…" />
        )}
      </Shell>
    );
  }

  const PrimaryIcon = primary?.icon;
  const revealed = quiz?.phase === 'reveal';
  const teams = state.teams ?? [];
  const rest = Math.max(0, teams.length - 10);
  const teamSize = state.teamSize ?? 0;
  const plannedTeams = teamSize > 0 ? quizTeamCount(state.players.length, teamSize) : 0;

  return (
    <Shell full>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-black uppercase tracking-tight">Ai là triệu phú</h1>
          <span className="border-2 border-line bg-surface-2 px-3 py-1 font-mono text-lg font-black tracking-wider">
            {roundId}
          </span>
          <ConnectionPill connected={connected} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <KeyRound aria-hidden="true" className="h-4 w-4 text-secondary" />
            <span className="sr-only">Mã quản trị</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ADMIN_TOKEN"
              autoComplete="current-password"
              className="field !min-h-11 !w-44 !py-2 !text-sm"
            />
          </label>
          <Link to="/admin" className="btn btn-ghost btn-sm">
            <House aria-hidden="true" className="h-4 w-4" />
            Quản trị
          </Link>
        </div>
      </header>

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-wrong">
          <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {/* ───────── phòng chờ ───────── */}
      {state.status === 'lobby' && (
        <section className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <div className="card flex flex-col items-center gap-4 p-6 text-center">
            <p className="font-display text-lg font-black uppercase">Quét mã để vào chơi</p>
            <QrCode value={joinUrl} size={288} className="w-full max-w-72" />
            <p className="break-all font-mono text-sm font-bold">{joinUrl}</p>
          </div>

          <div className="card p-6">
            <h2 className="mb-4 flex items-center gap-3 font-display text-2xl font-black uppercase">
              <Users aria-hidden="true" className="h-6 w-6 text-secondary" />
              Người chơi
              <span className="bg-surface-2 px-3 py-0.5 text-lg tabular-nums">
                {state.players.length}/{state.maxPlayers}
              </span>
            </h2>
            {teamSize > 0 && (
              <p className="mb-4 flex items-center gap-2 border-2 border-line bg-surface-2 p-3 text-lg font-bold">
                <MessageCircle aria-hidden="true" className="h-6 w-6 shrink-0 text-secondary" />
                Chơi theo đội, mỗi đội {teamSize} người — chia ngẫu nhiên khi bấm Bắt đầu
                {state.players.length > 0 && ` (dự kiến ${plannedTeams} đội)`}.
              </p>
            )}
            {state.players.length === 0 ? (
              <p className="py-10 text-center text-xl text-muted">Đang chờ người chơi quét mã…</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                {state.players.map((p) => (
                  <li key={p.id} className="flex animate-pop items-center gap-2 border-2 border-line bg-surface-2 p-2">
                    <Avatar name={p.name} seed={p.id} />
                    <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ───────── đang thi ───────── */}
      {state.status === 'playing' && quiz && (
        <section className="grid gap-6 pb-28 xl:grid-cols-[1fr_30rem]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-display text-4xl font-black tabular-nums">
                  Câu {quiz.index + 1}
                  <span className="text-muted">/{quiz.total}</span>
                </span>
                {/* Nhãn chủ đề là tuỳ chọn trong file import — không có thì không vẽ ô rỗng. */}
                {quiz.category && (
                  <span className="border-2 border-line bg-quiz px-3 py-1 text-sm font-black uppercase text-ink">
                    {CATEGORY_LABEL[quiz.category] ?? quiz.category}
                  </span>
                )}
                <span className="border-2 border-line px-3 py-1 text-sm font-black uppercase">
                  {LEVEL_LABEL[quiz.level]}
                </span>
                <span className="text-lg font-bold tabular-nums text-muted">
                  Đã chốt {quiz.answered}/{teams.length} đội
                </span>
              </div>
              {revealed ? (
                <span className="card flex items-center gap-2 bg-correct px-5 py-4 font-display text-2xl font-black uppercase text-ink">
                  Đã công bố
                </span>
              ) : (
                <BigTimer endsAt={quiz.endsAt} />
              )}
            </div>

            <div key={quiz.index} className={`card animate-pop px-8 ${revealed ? 'py-6' : 'py-10'}`}>
              <p className={`break-words font-display font-black leading-snug ${revealed ? 'text-3xl lg:text-4xl' : 'text-3xl lg:text-5xl'}`}>{quiz.text}</p>
            </div>

            {revealed && quiz.options ? (
              <QuizOptions
                options={quiz.options}
                picked={null}
                correct={quiz.correct}
                distribution={quiz.distribution}
                size="xl"
                hideLetters
              />
            ) : (
              // Không chiếu đáp án: đây là chỗ để nhắc cả hội trường rằng phải NÓI CHUYỆN.
              <p className="card flex items-center gap-4 p-6 text-2xl font-bold text-muted lg:text-3xl">
                <MessageCircle aria-hidden="true" className="h-10 w-10 shrink-0 text-secondary" />
                Đáp án nằm trên điện thoại từng người — đọc to cho đội trưởng, bàn bạc rồi chốt!
              </p>
            )}

            {revealed && quiz.explain && (
              <p className="flex items-start gap-3 border-2 border-line bg-surface p-4 text-xl">
                <Lightbulb aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-accent" />
                {quiz.explain}
              </p>
            )}
          </div>

          <aside aria-label="Bảng xếp hạng đội">
            <h2 className="mb-3 flex items-center gap-3 font-display text-2xl font-black uppercase">
              <Trophy aria-hidden="true" className="h-7 w-7 text-accent" />
              Bảng xếp hạng đội
            </h2>
            <LiveBoard
              teams={teams}
              limit={10}
              phase={revealed ? 'reveal' : 'question'}
              showCaptain={!revealed}
              large
              motion="always"
            />
            {rest > 0 && <p className="mt-3 text-center text-muted">và {rest} đội khác</p>}
          </aside>
        </section>
      )}

      {/* ───────── kết thúc ───────── */}
      {state.status === 'done' && (
        <section className="mx-auto w-full max-w-3xl space-y-6 text-center">
          <h2 className="font-display text-5xl font-black uppercase">Kết quả chung cuộc</h2>
          <RankTable rows={rows} game="quiz" />
          <div className="flex flex-wrap justify-center gap-3">
            <Link to={`/dashboard/${roundId}`} className="btn btn-ghost">
              <Trophy aria-hidden="true" className="h-5 w-5" />
              Bảng kết quả đầy đủ
            </Link>
            <Link to="/admin" className="btn btn-accent">
              <House aria-hidden="true" className="h-5 w-5" />
              Về trang quản trị
            </Link>
          </div>
        </section>
      )}

      {/* ───────── nút chính, luôn ở một chỗ ───────── */}
      {primary && PrimaryIcon && (
        <div className="sticky bottom-4 z-10 mt-auto flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => void act()}
            disabled={busy || primary.off || !token}
            className="btn btn-correct btn-lg min-w-80"
          >
            <PrimaryIcon aria-hidden="true" className="h-7 w-7" />
            {primary.label}
          </button>
          <span className="hidden text-sm text-muted sm:inline">
            hoặc nhấn <kbd className="bg-surface-2 px-2 py-0.5 font-sans font-bold text-fg">Phím cách</kbd>
          </span>
          {!token && <span className="text-sm text-warn">Nhập mã quản trị để điều khiển.</span>}
        </div>
      )}
    </Shell>
  );
}
