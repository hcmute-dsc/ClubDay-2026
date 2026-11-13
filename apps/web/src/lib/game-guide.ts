import { QUIZ_QUESTION_MS, type GameKind } from './types';

/**
 * Luật chơi của từng trò, viết cho NGƯỜI CHƠI đọc trong mười giây.
 *
 * Tách khỏi `game-theme.ts` (icon, màu) vì đây là NỘI DUNG, không phải trang trí:
 * sửa luật trong code thì phải sửa cả ở đây, và để nó nằm cạnh bảng màu thì
 * người sửa luật không nghĩ tới chuyện mở file đó ra.
 *
 * Viết theo thứ tự người chơi gặp: thấy gì trước, làm gì tiếp, rồi mới tới điểm.
 * Mỗi bước một câu, không câu nào dài quá một dòng trên điện thoại — ai đang xếp
 * hàng ở booth sẽ không đọc đoạn văn.
 */
export interface GameGuide {
  /** Các bước, theo đúng thứ tự người chơi gặp. */
  steps: string[];
  /** Điểm tính thế nào — thứ quyết định người ta chơi ra sao. */
  scoring: string;
  /** Một mẹo hoặc một cái bẫy đáng nói trước. Bỏ trống nếu không có gì đáng. */
  tip?: string;
}

export const GAME_GUIDE: Record<GameKind, GameGuide> = {
  math: {
    steps: [
      'Màn hình hiện một phép tính, bốn đáp án ở dưới.',
      'Bấm ô có đáp án đúng — trên máy tính gõ được phím 1–4.',
      'Trả lời sai thì chuỗi về 0, nhưng kỷ lục cũ vẫn giữ nguyên.',
    ],
    scoring: 'Điểm = CHUỖI ĐÚNG DÀI NHẤT, không phải tổng số câu đúng.',
    tip: 'Đúng liên tiếp mới ăn điểm, nên chậm một nhịp còn hơn bấm bừa.',
  },
  draw: {
    steps: [
      'Màn hình cho một từ khoá — vẽ đúng thứ đó.',
      'AI đoán liên tục trong lúc bạn vẽ, xem dòng "AI nghĩ: …".',
      'AI nhận ra rồi thì bấm NỘP BÀI ngay. Hết giờ server tự nộp hộ.',
    ],
    scoring: 'Điểm = 150 trừ số giây đã dùng. AI không nhận ra thì 0 điểm.',
    tip: 'Vẽ to, một nét liền, đừng thêm chi tiết — nộp sớm mới được điểm cao.',
  },
  memory: {
    steps: [
      'Bốn ô sẽ nháy sáng theo một thứ tự.',
      'Nháy xong, bấm lại đúng thứ tự vừa thấy.',
      'Đúng thì chuỗi dài thêm một ô; sai thì về cấp 1, kỷ lục vẫn giữ.',
    ],
    scoring: 'Điểm = CẤP CAO NHẤT vượt được.',
    tip: 'Chờ nháy xong hẳn mới bấm: bấm trong lúc còn đang nháy bị tính là gian lận.',
  },
  spot: {
    steps: [
      'Cả lưới cùng một màu, đúng MỘT ô lệch màu một chút.',
      'Chạm vào ô lệch đó.',
      'Mỗi cấp lưới dày thêm và hai màu sát nhau hơn.',
    ],
    scoring: 'Điểm = CẤP CAO NHẤT vượt được. Chạm trượt thì về cấp 1, kỷ lục vẫn giữ.',
    tip: 'Nhìn lướt cả lưới, đừng soi từng ô — mắt bắt chỗ lệch nhanh hơn là dò.',
  },
  quiz: {
    steps: [
      `Chơi theo ĐỘI, BTC chia ngẫu nhiên. Mỗi câu có ${QUIZ_QUESTION_MS / 1000} giây.`,
      'Màn chiếu chỉ có câu hỏi. Mỗi người chỉ thấy MỘT PHẦN đáp án trên điện thoại.',
      'Đọc to đáp án của bạn cho cả đội nghe, rồi cùng bàn.',
      'Mỗi câu một ĐỘI TRƯỞNG (đổi vòng): chỉ thấy nút A–D, không thấy chữ.',
      'Chỉ đội trưởng chốt được — chốt là hết đổi, cả đội cùng một đáp án.',
      'Cả đội có 2 quyền, mỗi quyền một lần: 50:50 và x2 điểm (từ câu 11).',
    ],
    scoring: 'Điểm tính cho cả ĐỘI: đúng được 600–1000 điểm, chốt càng nhanh càng cao. Sai hoặc chưa chốt 0 điểm.',
    tip: 'Đọc kèm chữ cái (A, B, C, D) cho đội trưởng. Dùng quyền TRƯỚC khi chốt; x2 mà sai thì mất quyền.',
  },
};
