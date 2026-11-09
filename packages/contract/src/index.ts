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
  options: string[];
  /** Bao nhiêu người đã chốt đáp án câu này. */
  answered: number;
  // Chỉ có ở pha `reveal`:
  /** Chỉ số đáp án đúng (0–3). */
  correct?: number;
  /** Số người chọn từng đáp án. */
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
  /** Đã chốt đáp án câu đang mở chưa. */
  answered?: boolean;
  /** Điểm vừa nhận ở câu gần nhất (0 nếu sai / bỏ trống). */
  delta?: number;
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
}
