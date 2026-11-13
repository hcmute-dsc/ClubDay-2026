/**
 * HỢP ĐỒNG SERVER ↔ WEB — nguồn sự thật DUY NHẤT.
 *
 * Trước đây file này tồn tại hai bản chép tay (`apps/server/src/store/types.ts`
 * và `apps/web/src/lib/types.ts`), mỗi bản có comment "phải khớp" nhưng không có
 * gì bắt chúng khớp. Lệch một con số là lỗi im lặng, và im theo kiểu tệ nhất:
 * lệch `MEMORY_STEP_MS` thì client phát chuỗi nhanh hơn server nghĩ, và người
 * chơi THẬT bị gắn cờ gian lận.
 *
 * Chỉ để ở đây những thứ HAI BÊN CÙNG PHẢI BIẾT. Kiểu chỉ server dùng (`Round`,
 * `Player`) ở lại server; thứ chỉ để hiển thị (`SCORE_LABEL`, `GameProps`) ở lại
 * web. Nhét tất cả vào đây thì package này thành một `types.ts` thứ ba.
 */

/**
 * Danh sách game — thêm game mới là thêm đúng một phần tử ở đây.
 *
 * Mọi bảng `Record<GameKind, …>` ở cả hai bên sẽ báo lỗi biên dịch cho tới khi
 * được khai đủ, nên không có đường nào quên một chỗ.
 */
export const GAME_KINDS = ['math', 'draw', 'memory', 'spot', 'quiz'] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export type RoundStatus = 'lobby' | 'playing' | 'done';

/** Tên hiển thị của từng game. */
export const GAME_LABEL: Record<GameKind, string> = {
  math: 'Tính nhanh',
  draw: 'Vẽ hình nhanh',
  memory: 'Nhớ nhanh',
  spot: 'Ô khác màu',
  quiz: 'Ai là triệu phú',
};

/**
 * Thời lượng mỗi lượt.
 *
 * Client đếm ngược theo con số này, server chấm điểm cũng theo nó — lệch nhau là
 * đồng hồ trên màn hình nói một đằng, điểm tính một nẻo.
 */
export const DURATION_MS: Record<GameKind, number> = {
  math: 90_000,
  draw: 15_000,
  // Đủ để người giỏi lên tới cấp 8–10, mà vẫn ngắn hơn Tính nhanh để vòng quay
  // người chơi ở booth không bị chậm lại.
  memory: 60_000,
  // Mỗi cấp chỉ mất 1–3 giây nên 45s đã đủ tới cấp 12–15. Ngắn có chủ đích: đây
  // là trò quay vòng nhanh nhất.
  spot: 45_000,
  // Ai là triệu phú KHÔNG chạy theo một đồng hồ chung của cả lượt: mỗi câu có đồng
  // hồ riêng (`QUIZ_QUESTION_MS`) và BTC quyết định khi nào sang câu. Con số này
  // chỉ là CẦU CHÌ AN TOÀN — quên bấm kết thúc thì sau 2 giờ lượt tự đóng, không
  // nằm treo trong RAM mãi.
  quiz: 2 * 60 * 60 * 1_000,
};

/** Số người MẶC ĐỊNH mỗi lượt, dùng khi `.env` không nói gì khác. */
export const MAX_PLAYERS = 5;

/**
 * Trần cứng cho cấu hình sức chứa.
 *
 * Trên 20 người một lượt thì phòng chờ tràn màn hình điện thoại, bảng hạng thành
 * một danh sách dài vô nghĩa, và với game Vẽ thì mỗi frame là một lần chạy model.
 */
export const MAX_PLAYERS_CAP = 20;

/**
 * Trần RIÊNG của Ai là triệu phú.
 *
 * Trò này khác bốn trò còn lại ở chỗ cả khán phòng cùng chơi MỘT câu hỏi trên màn
 * hình chiếu, nên 50 người là cảnh bình thường chứ không phải ngoại lệ. Không
 * có chuyện chạy model cho từng người như Vẽ hình, và phòng chờ của nó vẽ gọn
 * thành lưới tên thay vì mỗi người một dòng.
 */
export const MAX_PLAYERS_CAP_QUIZ = 50;

/** Trần sức chứa của MỘT trò — hai bên dùng chung để cùng kiểm một con số. */
export function maxPlayersCap(game: GameKind): number {
  return game === 'quiz' ? MAX_PLAYERS_CAP_QUIZ : MAX_PLAYERS_CAP;
}

/** Số người mặc định của Ai là triệu phú khi `.env` không nói gì. */
export const MAX_PLAYERS_DEFAULT_QUIZ = 50;

// ── Nhớ nhanh ──
//
// Server dựa vào ĐÚNG `MEMORY_STEP_MS` này để biết một lượt lặp có kịp xem chuỗi
// hay không; client phát lại chuỗi cũng theo nó. Phát nhanh hơn là người chơi
// thật bị gắn cờ gian lận — đây chính là hằng số mà việc chép tay từng đe doạ.

/** Số ô trên bàn chơi. 4 ô vừa một lưới 2×2 to bằng ngón tay trên điện thoại. */
export const MEMORY_PAD_COUNT = 4;
/**
 * Một nhịp phát = 380ms sáng + 320ms tối (xem `MEMORY_LIT_MS` phía web).
 *
 * Trước là 600ms (400 sáng + 200 tối) và chơi thấy rối. Hai lý do, khe tối là
 * lý do lớn hơn: chuỗi CHO PHÉP hai ô giống nhau đứng liền nhau, mà 200ms tối
 * thì mắt đọc hai lần nháy đó thành MỘT lần nháy dài. Người chơi nhớ đúng vẫn
 * bấm thiếu một ô, và không hiểu mình sai ở đâu.
 */
export const MEMORY_STEP_MS = 700;

// ── Ô khác màu ──

/** Cạnh lưới nhỏ nhất (2×2) và lớn nhất (6×6 = 36 ô — nhỏ hơn nữa thì ngón tay không trúng). */
export const SPOT_MIN_SIZE = 2;
export const SPOT_MAX_SIZE = 6;

// ── Ai là triệu phú ──

/** Số câu mỗi lượt. */
export const QUIZ_QUESTION_COUNT = 40;
/** Thời gian trả lời mỗi câu. Server chấm theo đúng con số này, client đếm ngược theo nó. */
export const QUIZ_QUESTION_MS = 15_000;
/** Số đáp án mỗi câu: A, B, C, D. */
export const QUIZ_OPTION_COUNT = 4;
export const QUIZ_OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

// ── Ai là triệu phú: chơi THEO ĐỘI ──
//
// Cả lượt chia thành các đội. Một đội chỉ có MỘT đáp án mỗi câu và các thành viên
// không ai tự đủ thông tin để trả lời một mình:
//   - Màn hình chiếu chỉ hiện CÂU HỎI, không hiện bốn đáp án.
//   - Mỗi câu một thành viên làm ĐỘI TRƯỞNG (xoay vòng): chỉ đội trưởng bấm chốt
//     được, nhưng điện thoại của đội trưởng chỉ có nút A–D, không có chữ.
//   - Các thành viên còn lại (người đọc) mỗi người chỉ thấy MỘT PHẦN các đáp án.
// → Phải đọc to cho nhau, ghép thông tin, bàn rồi đội trưởng mới chốt.

/** Số người mỗi đội: BTC đặt ở /admin trong khoảng này. */
export const QUIZ_TEAM_SIZE_MIN = 2;
export const QUIZ_TEAM_SIZE_MAX = 10;
export const QUIZ_TEAM_SIZE_DEFAULT = 3;

/**
 * Danh tính của đội thứ `index` (0 = đội đầu): tên màu + mã màu để tô trên màn hình.
 * Đủ cho 50 người chia đội 2 (25 đội); quá 12 đội thì thêm số thứ tự phía sau.
 */
const TEAM_IDENTITIES = [
  { name: 'Đội Cam', color: '#ff7a1a' },
  { name: 'Đội Xanh', color: '#2f80ff' },
  { name: 'Đội Hồng', color: '#ff4d9d' },
  { name: 'Đội Lục', color: '#22c55e' },
  { name: 'Đội Vàng', color: '#f5c518' },
  { name: 'Đội Tím', color: '#9b6bff' },
  { name: 'Đội Đỏ', color: '#ef3b3b' },
  { name: 'Đội Lam', color: '#14c2d8' },
  { name: 'Đội Nâu', color: '#b0703a' },
  { name: 'Đội Chanh', color: '#a3e635' },
  { name: 'Đội Đen', color: '#52525b' },
  { name: 'Đội Bạc', color: '#b8bcc8' },
] as const;

export function quizTeamIdentity(index: number): { name: string; color: string } {
  const base = TEAM_IDENTITIES[index % TEAM_IDENTITIES.length]!;
  const lap = Math.floor(index / TEAM_IDENTITIES.length);
  return { name: lap === 0 ? base.name : `${base.name} ${lap + 1}`, color: base.color };
}

/**
 * Chia `players` người thành bao nhiêu đội khi mỗi đội MONG MUỐN `teamSize` người.
 * Làm tròn tới số đội gần nhất (7 người, đội 3 → 2 đội 4+3) và luôn có ít nhất một
 * đội, nên sĩ số các đội lệch nhau tối đa 1 người.
 */
export function quizTeamCount(players: number, teamSize: number): number {
  return Math.max(1, Math.round(players / Math.max(1, teamSize)));
}

/**
 * ĐIỂM mỗi câu đúng = `QUIZ_BASE_POINTS` + phần thưởng tốc độ (tối đa
 * `QUIZ_SPEED_POINTS`, giảm dần theo thời gian đã dùng). Đúng ngay giây đầu được
 * 1000, đúng ở giây cuối vẫn được 600 — nên chậm mà chắc vẫn đáng hơn bấm bừa.
 */
export const QUIZ_BASE_POINTS = 600;
export const QUIZ_SPEED_POINTS = 400;

/**
 * Điểm của MỘT câu đúng, GIẢM DẦN theo thời gian đã dùng: chọn càng nhanh càng cao.
 *
 *   điểm = nền + thưởng tốc độ × (thời gian còn lại / thời gian cả câu)
 *
 * Đặt ở contract để server chấm điểm và client hiện "đúng ngay bây giờ được bao
 * nhiêu" dùng ĐÚNG MỘT công thức — hai bản chép tay lệch nhau là màn hình hứa
 * 900 điểm mà bảng hạng cộng 870.
 *
 * Chọn quá hạn (trong dung sai mạng) thì phần còn lại kẹp về 0, chỉ được điểm nền.
 */
export function quizPoints(answeredAt: number, startedAt: number, endsAt: number): number {
  const total = Math.max(1, endsAt - startedAt);
  const remaining = Math.min(total, Math.max(0, endsAt - answeredAt));
  return QUIZ_BASE_POINTS + Math.round((QUIZ_SPEED_POINTS * remaining) / total);
}

/**
 * Quyền trợ giúp — mỗi người MỖI QUYỀN DÙNG ĐÚNG MỘT LẦN trong cả lượt.
 *   fifty    50:50          — loại bỏ hai đáp án sai
 *   double   Nhân đôi điểm  — câu này đúng thì điểm x2
 *
 * Chỉ hai quyền này: "hỏi khán giả" và "gọi người thân" đã được bỏ đi.
 */
export const QUIZ_LIFELINES = ['fifty', 'double'] as const;

/**
 * Nhân đôi điểm chỉ dùng được từ câu mức này trở lên (2 = "Vừa", tức từ câu 11).
 *
 * Câu dễ thì ai cũng biết, nên x2 ở đó gần như là điểm cho không; khoá lại để người
 * chơi phải để dành nó cho đoạn câu hỏi bắt đầu có rủi ro. 50:50 dùng ở đâu cũng được.
 * Server kiểm theo con số này, client dùng nó để khoá nút — cùng một nguồn.
 */
export const QUIZ_DOUBLE_MIN_LEVEL = 2;
export type LifelineKind = (typeof QUIZ_LIFELINES)[number];

export type QuizPhase = 'question' | 'reveal';

/** Số câu tối đa BTC được import — quá nhiều thì một buổi không bao giờ hết. */
export const QUIZ_MAX_QUESTIONS = 100;

/**
 * Bộ câu hỏi đang dùng, để màn hình quản trị hiển thị. KHÔNG chứa nội dung câu hỏi —
 * nội dung (kèm đáp án) chỉ đi qua route có `x-admin-token`.
 */
export interface QuizBankInfo {
  /** `default` = bộ 40 câu có sẵn; `imported` = BTC đã import file JSON. */
  source: 'default' | 'imported';
  count: number;
  /** Số câu theo mức: [dễ, vừa, khó]. */
  levels: [number, number, number];
  /** Tên file đã import, nếu có. */
  fileName: string | null;
  importedAt: number | null;
}

/**
 * File mẫu cho BTC tải về rồi sửa — cũng là TÀI LIỆU định dạng sống: server có test
 * chạy chính file này qua bộ kiểm tra import, nên mẫu không bao giờ lệch khỏi luật.
 *
 * Cố ý có đủ ba mức, và `answer` viết bằng chữ ở hai câu, bằng số ở một câu — để người
 * đọc thấy cả hai cách mà không cần mở tài liệu.
 */
export const QUIZ_IMPORT_SAMPLE = {
  questions: [
    {
      text: 'Thủ đô của Việt Nam là gì?',
      options: ['Hà Nội', 'Huế', 'Đà Nẵng', 'Cần Thơ'],
      answer: 'A',
      level: 1,
      category: 'fun',
      explain: 'Hà Nội là thủ đô từ năm 1010.',
    },
    {
      text: 'CPU là viết tắt của cụm từ nào?',
      options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Power Update'],
      answer: 0,
      level: 2,
      category: 'tech',
      explain: 'CPU là bộ xử lý trung tâm của máy tính.',
    },
    {
      text: 'Độ phức tạp thời gian của tìm kiếm nhị phân là?',
      options: ['O(n)', 'O(log n)', 'O(1)', 'O(n²)'],
      answer: 'B',
      level: 3,
      category: 'code',
    },
  ],
} as const;

/** Một lỗi trong file import. `question` đếm từ 1; `null` = lỗi chung của cả file. */
export interface QuizImportProblem {
  question: number | null;
  message: string;
}

/** Câu hỏi đang mở — CỐ Ý không có đáp án đúng cho tới khi sang pha `reveal`. */
export interface QuizPublic {
  /** Tổng số câu của lượt. */
  total: number;
  /** Câu đang mở, tính từ 0. */
  index: number;
  phase: QuizPhase;
  /** ⏱ Mốc bắt đầu / hết giờ của CÂU HIỆN TẠI (giờ server). */
  startedAt: number;
  endsAt: number;
  text: string;
  category: string;
  /** 1 = dễ, 2 = vừa, 3 = khó. */
  level: 1 | 2 | 3;
  /**
   * Bốn đáp án — CHỈ có ở pha `reveal`. Lúc đang trả lời, đáp án đi riêng tới từng
   * người (xem `QuizMe.visible`), mỗi người một phần; để chúng lọt vào đây thì cả
   * phòng đọc được hết từ màn hình chiếu và trò chơi mất ý nghĩa.
   */
  options?: string[];
  /** Bao nhiêu ĐỘI đã chốt đáp án câu này. */
  answered: number;
  // Chỉ có ở pha `reveal`:
  /** Chỉ số đáp án đúng (0–3). */
  correct?: number;
  /** Số ĐỘI chọn từng đáp án. */
  distribution?: number[];
  explain?: string;
}

// ── Hình dạng dữ liệu đi trên dây ──

export interface RoundStatePlayer {
  id: string;
  name: string;
  score: number;
  finished: boolean;
  // Chỉ Ai là triệu phú điền các field dưới đây (trò khác để trống):
  /** Hạng hiện tại — server xếp, client không tự sắp lại để khỏi lệch luật hoà điểm. */
  rank?: number;
  /** Đội của người này đã chốt đáp án câu đang mở chưa. */
  answered?: boolean;
  /** Điểm đội vừa nhận ở câu gần nhất (0 nếu sai / bỏ trống). */
  delta?: number;
  /** Đội của người này (chỉ Ai là triệu phú, sau khi bắt đầu). */
  teamId?: string;
}

/** Kết quả quyền trợ giúp của CÂU ĐANG MỞ — của cả đội. */
export interface QuizHints {
  /** Hai đáp án bị 50:50 loại. */
  hidden?: number[];
  /** Câu này được nhân đôi điểm. */
  doubled?: boolean;
}

/**
 * Phần RIÊNG của một người chơi trong Ai là triệu phú (`GET /quiz/me`): vai trò của họ
 * ở câu đang mở và những đáp án họ được phép đọc. Đây là chỗ DUY NHẤT đáp án đi ra
 * trước pha công bố, và mỗi người chỉ nhận phần của mình.
 */
export interface QuizMe {
  index: number;
  phase: QuizPhase;
  teamId: string;
  teamName: string;
  teamColor: string;
  /** `captain` = được chốt đáp án câu này; `reader` = chỉ đọc đáp án cho đội. */
  role: 'captain' | 'reader';
  captainId: string;
  captainName: string;
  /**
   * Đáp án người này đọc được (chỉ ở pha `question`). Đội trưởng nhận mảng rỗng — chỉ
   * thấy nút A–D — trừ khi đội chỉ có một người. Đã loại các ô bị 50:50 gạch.
   */
  visible: { index: number; text: string }[];
  /**
   * Đáp án ĐỘI đã chốt cho câu đang mở, `null` = chưa chốt.
   *
   * Mọi chỉ số ô trong `QuizMe` (`visible[].index`, `answer`, `hints.hidden`, `reveal`) là VỊ TRÍ
   * TRÊN MÁY CỦA ĐỘI này — mỗi đội một thứ tự khác nhau, nên đừng đem so với `QuizPublic.correct`
   * hay `distribution` (đó là thứ tự gốc, chiếu trên màn hình).
   */
  answer: number | null;
  /** Quyền trợ giúp của ĐỘI đã dùng → ở câu số mấy. */
  used: Partial<Record<LifelineKind, number>>;
  hints: QuizHints;
  /** Điểm, chuỗi đúng, số câu đúng/sai của ĐỘI. */
  score: number;
  streak: number;
  correct: number;
  wrong: number;
  /** Điểm đội nhận ở câu vừa công bố. */
  delta: number;
  /** Chỉ có ở pha `reveal`: bốn đáp án + đáp án đúng + số đội chọn, theo thứ tự ĐỘI này thấy. */
  reveal?: { options: string[]; correct: number; distribution: number[] };
}

/** Một đội trong Ai là triệu phú, như cả phòng nhìn thấy. */
export interface QuizTeamPublic {
  id: string;
  name: string;
  /** Mã màu CSS của đội. */
  color: string;
  members: { id: string; name: string }[];
  /** Đội trưởng của CÂU ĐANG MỞ — người duy nhất chốt được đáp án. */
  captainId: string;
  score: number;
  /** Hạng — server xếp, client không tự sắp lại. */
  rank: number;
  /** Đội đã chốt đáp án câu đang mở chưa. */
  answered: boolean;
  /** Điểm đội vừa nhận ở câu gần nhất. */
  delta: number;
  correct: number;
  wrong: number;
}

/** View-model của một lượt, gửi qua REST và SSE. */
export interface RoundState {
  roundId: string;
  game: GameKind;
  status: RoundStatus;
  /** ⏱ Giờ của SERVER — client dùng để bù lệch đồng hồ máy người chơi. */
  serverNow: number;
  startedAt: number | null;
  endsAt: number | null;
  /** Số chỗ của RIÊNG lượt này — phòng chờ vẽ đúng bấy nhiêu ô. */
  maxPlayers: number;
  /** Chỉ có ở game vẽ. */
  target?: { id: string; labelVi: string };
  /** Chỉ có ở Ai là triệu phú, và chỉ khi lượt đang chơi. */
  quiz?: QuizPublic;
  /** Chỉ Ai là triệu phú: số người mỗi đội (BTC đặt) — phòng chờ báo trước cho người chơi. */
  teamSize?: number;
  /** Chỉ Ai là triệu phú, từ lúc bắt đầu: các đội đã chia, ĐÃ xếp hạng. */
  teams?: QuizTeamPublic[];
  players: RoundStatePlayer[];
}

/** Một dòng bảng hạng. */
export interface DashboardRow {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  correct: number;
  wrong: number;
  /** Thời gian (ms kể từ lúc bắt đầu lượt) để hoàn thành; null = chưa xong. */
  msToFinish: number | null;
  solved: boolean;
  flagged: boolean;
  /** Chỉ Ai là triệu phú: dòng này là một ĐỘI — tên các thành viên. */
  members?: string[];
}
