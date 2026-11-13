/**
 * NGÂN HÀNG 40 CÂU của Ai là triệu phú.
 *
 * Chỉ nằm ở SERVER: đáp án đúng đi cùng câu hỏi trong file này, nên client mà
 * thấy được file này là thấy luôn đáp án. Xem `publicQuiz` ở quiz-session.ts để
 * biết cái gì được phép ra ngoài.
 *
 * XẾP THEO ĐỘ KHÓ tăng dần, như chương trình gốc:
 *   câu  1–10  mức 1 (dễ)    — ai cũng biết, để khởi động và để người mới còn ở lại
 *   câu 11–25  mức 2 (vừa)   — cần có học qua
 *   câu 26–40  mức 3 (khó)   — dân kỹ thuật mới chắc chắn
 *
 * Trộn ba mảng: `tech` công nghệ, `code` lập trình, `fun` chuyện vui. Mỗi câu chỉ
 * có MỘT đáp án đúng; đáp án đúng luôn nằm ở `options[0]` trong file này và được
 * xáo vị trí khi bắt đầu lượt (xem `buildQuizQuestions`), nên người soạn không
 * cần canh chia đều A/B/C/D.
 *
 * `explain` hiện ở bước công bố đáp án — một câu thôi, để BTC có cái mà nói.
 */
export type QuizCategory = 'tech' | 'code' | 'fun';

export interface BankQuestion {
  text: string;
  /** options[0] LÀ ĐÁP ÁN ĐÚNG. Ba phần tử còn lại là đáp án nhiễu. */
  options: [string, string, string, string];
  category: QuizCategory;
  level: 1 | 2 | 3;
  explain: string;
}

export const QUIZ_BANK: readonly BankQuestion[] = [
  // ───────────────────────── mức 1 — dễ ─────────────────────────
  {
    text: 'Mario là nhân vật linh vật của hãng game nào?',
    options: ['Nintendo', 'Sega', 'Sony', 'Atari'],
    category: 'fun',
    level: 1,
    explain: 'Mario ra mắt năm 1981 và là bộ mặt của Nintendo suốt bốn thập kỷ.',
  },
  {
    text: 'iPhone là sản phẩm của công ty nào?',
    options: ['Apple', 'Samsung', 'Google', 'Nokia'],
    category: 'tech',
    level: 1,
    explain: 'iPhone đời đầu ra mắt năm 2007, do Steve Jobs giới thiệu.',
  },
  {
    text: 'Trong Minecraft, quái vật màu xanh lá nào sẽ nổ tung khi lại gần bạn?',
    options: ['Creeper', 'Zombie', 'Skeleton', 'Enderman'],
    category: 'fun',
    level: 1,
    explain: 'Creeper sinh ra từ một lỗi khi tác giả định tạo ra con heo.',
  },
  {
    text: 'CPU là viết tắt của cụm từ nào?',
    options: [
      'Central Processing Unit',
      'Computer Personal Unit',
      'Central Program Utility',
      'Core Power Update',
    ],
    category: 'tech',
    level: 1,
    explain: 'CPU là bộ xử lý trung tâm — "bộ não" của máy tính.',
  },
  {
    text: '1 byte bằng bao nhiêu bit?',
    options: ['8', '4', '16', '10'],
    category: 'tech',
    level: 1,
    explain: '1 byte = 8 bit. Một bit chỉ là 0 hoặc 1.',
  },
  {
    text: 'Tổ hợp phím Ctrl + Z thường dùng để làm gì?',
    options: ['Hoàn tác thao tác vừa làm', 'Sao chép', 'Dán', 'Lưu tệp'],
    category: 'tech',
    level: 1,
    explain: 'Z là Undo. Làm lại (Redo) là Ctrl + Y hoặc Ctrl + Shift + Z.',
  },
  {
    text: 'Linh vật của hệ điều hành Linux là con vật nào?',
    options: ['Chim cánh cụt', 'Con mèo', 'Cá heo', 'Con cú'],
    category: 'fun',
    level: 1,
    explain: 'Chú chim cánh cụt tên Tux — Linus Torvalds từng nói ông thích chim cánh cụt.',
  },
  {
    text: 'HTML chủ yếu dùng để làm gì?',
    options: [
      'Dựng cấu trúc và nội dung trang web',
      'Quản lý cơ sở dữ liệu',
      'Huấn luyện mô hình AI',
      'Viết game 3D',
    ],
    category: 'code',
    level: 1,
    explain: 'HTML = HyperText Markup Language, "bộ xương" của mọi trang web.',
  },
  {
    text: 'Biểu tượng robot xanh lá cây quen thuộc là của hệ điều hành nào?',
    options: ['Android', 'iOS', 'Windows', 'macOS'],
    category: 'tech',
    level: 1,
    explain: 'Chú robot ấy có tên nội bộ là Bugdroid.',
  },
  {
    text: 'Biểu tượng của ngôn ngữ lập trình Java là hình gì?',
    options: ['Tách cà phê', 'Con rắn', 'Quả táo', 'Ngọn lửa'],
    category: 'fun',
    level: 1,
    explain: 'Java cũng là tên một hòn đảo nổi tiếng với cà phê ở Indonesia.',
  },

  // ───────────────────────── mức 2 — vừa ─────────────────────────
  {
    text: '"WWW" trong địa chỉ website là viết tắt của gì?',
    options: ['World Wide Web', 'World Web Window', 'Wide World Web', 'Web Wide World'],
    category: 'tech',
    level: 2,
    explain: 'World Wide Web — mạng thông tin toàn cầu, do Tim Berners-Lee đề xuất.',
  },
  {
    text: 'Ở hầu hết ngôn ngữ lập trình, phần tử đầu tiên của một mảng có chỉ số mấy?',
    options: ['0', '1', '-1', '10'],
    category: 'code',
    level: 2,
    explain: 'Chỉ số là độ lệch so với đầu mảng, nên phần tử đầu lệch 0.',
  },
  {
    text: 'Trong Python, hàm nào dùng để in nội dung ra màn hình?',
    options: ['print()', 'echo()', 'write()', 'display()'],
    category: 'code',
    level: 2,
    explain: 'print("Hello, World!") thường là dòng code đầu tiên người ta học.',
  },
  {
    text: 'Ngôn ngữ Python được đặt tên theo điều gì?',
    options: [
      'Một nhóm hài kịch của Anh (Monty Python)',
      'Loài rắn trăn',
      'Một vị thần Hy Lạp',
      'Tên con vật cưng của tác giả',
    ],
    category: 'fun',
    level: 2,
    explain: 'Guido van Rossum là fan của chương trình Monty Python\'s Flying Circus.',
  },
  {
    text: 'Loại bộ nhớ nào sẽ MẤT dữ liệu khi tắt máy?',
    options: ['RAM', 'SSD', 'Ổ cứng HDD', 'Thẻ nhớ USB'],
    category: 'tech',
    level: 2,
    explain: 'RAM là bộ nhớ tạm, cần có điện liên tục để giữ dữ liệu.',
  },
  {
    text: 'Trong lập trình, "bug" có nghĩa là gì?',
    options: [
      'Lỗi trong chương trình',
      'Một tính năng mới',
      'Tên một thư viện',
      'Dòng chú thích',
    ],
    category: 'code',
    level: 2,
    explain: 'Gỡ lỗi gọi là debug — "bắt bọ".',
  },
  {
    text: 'Mã trạng thái HTTP 404 có nghĩa là gì?',
    options: [
      'Không tìm thấy trang',
      'Lỗi máy chủ',
      'Bị cấm truy cập',
      'Yêu cầu thành công',
    ],
    category: 'tech',
    level: 2,
    explain: '404 = Not Found. Lỗi máy chủ là 500, bị cấm là 403, thành công là 200.',
  },
  {
    text: 'Git là gì?',
    options: [
      'Hệ thống quản lý phiên bản mã nguồn',
      'Một trình soạn thảo văn bản',
      'Một ngôn ngữ lập trình',
      'Một hệ điều hành',
    ],
    category: 'code',
    level: 2,
    explain: 'Git do Linus Torvalds viết năm 2005 để quản lý mã nguồn Linux.',
  },
  {
    text: 'DNS có nhiệm vụ chính là gì?',
    options: [
      'Chuyển tên miền thành địa chỉ IP',
      'Mã hoá dữ liệu truyền đi',
      'Chặn quảng cáo',
      'Tăng tốc độ Wi-Fi',
    ],
    category: 'tech',
    level: 2,
    explain: 'DNS được ví như "danh bạ" của Internet.',
  },
  {
    text: 'SQL được dùng để làm gì?',
    options: [
      'Truy vấn và quản lý cơ sở dữ liệu',
      'Thiết kế giao diện',
      'Dựng trang web tĩnh',
      'Chỉnh sửa ảnh',
    ],
    category: 'code',
    level: 2,
    explain: 'SQL = Structured Query Language, ra đời từ thập niên 1970.',
  },
  {
    text: '"Rubber duck debugging" là phương pháp gì?',
    options: [
      'Giải thích code cho một con vịt cao su để tự tìm ra lỗi',
      'Dùng vịt cao su để thử mạch điện',
      'Một thuật toán sắp xếp',
      'Một khung kiểm thử tự động',
    ],
    category: 'fun',
    level: 2,
    explain: 'Nói to từng dòng code ra thường khiến bạn tự thấy chỗ sai.',
  },
  {
    text: 'ChatGPT được phát triển bởi công ty nào?',
    options: ['OpenAI', 'Google', 'Meta', 'Amazon'],
    category: 'tech',
    level: 2,
    explain: 'ChatGPT ra mắt cuối năm 2022 và đạt 100 triệu người dùng chỉ sau hai tháng.',
  },
  {
    text: 'Docker chủ yếu được dùng để làm gì?',
    options: [
      'Đóng gói ứng dụng vào container',
      'Soạn thảo mã nguồn',
      'Thiết kế đồ hoạ',
      'Diệt virus',
    ],
    category: 'code',
    level: 2,
    explain: 'Container giúp ứng dụng chạy giống hệt nhau trên mọi máy.',
  },
  {
    text: 'API là viết tắt của cụm từ nào?',
    options: [
      'Application Programming Interface',
      'Applied Program Integration',
      'Automatic Process Instruction',
      'Advanced Page Index',
    ],
    category: 'code',
    level: 2,
    explain: 'API là "cổng giao tiếp" để phần mềm này gọi phần mềm kia.',
  },
  {
    text: 'Câu "Works on my machine" (chạy ngon trên máy tôi) thường được lập trình viên nói khi nào?',
    options: [
      'Khi code chạy được ở máy mình nhưng lỗi ở máy người khác',
      'Khi vừa mua máy tính mới',
      'Khi muốn khoe cấu hình',
      'Khi máy bị treo',
    ],
    category: 'fun',
    level: 2,
    explain: 'Câu thần chú kinh điển — và là lý do Docker ra đời.',
  },

  // ───────────────────────── mức 3 — khó ─────────────────────────
  {
    text: 'Giao thức nào thường được dùng để GỬI email?',
    options: ['SMTP', 'FTP', 'SSH', 'DNS'],
    category: 'tech',
    level: 3,
    explain: 'SMTP gửi thư; IMAP và POP3 dùng để nhận thư.',
  },
  {
    text: 'Cấu trúc dữ liệu nào hoạt động theo nguyên tắc "vào sau, ra trước" (LIFO)?',
    options: ['Stack (ngăn xếp)', 'Queue (hàng đợi)', 'Heap', 'Linked list'],
    category: 'code',
    level: 3,
    explain: 'Giống chồng đĩa: đĩa đặt lên sau cùng được lấy ra đầu tiên.',
  },
  {
    text: 'Cổng (port) mặc định của HTTPS là?',
    options: ['443', '80', '22', '8080'],
    category: 'tech',
    level: 3,
    explain: 'HTTP dùng cổng 80, HTTPS dùng cổng 443, SSH dùng cổng 22.',
  },
  {
    text: 'Số 255 viết trong hệ thập lục phân (hex) là?',
    options: ['FF', 'EE', 'FE', '100'],
    category: 'tech',
    level: 3,
    explain: '255 = 15×16 + 15, mà 15 là F. Đây cũng là giá trị lớn nhất của 1 byte.',
  },
  {
    text: 'Trong JavaScript, `typeof null` trả về kết quả nào?',
    options: ['"object"', '"null"', '"undefined"', '"number"'],
    category: 'code',
    level: 3,
    explain: 'Một lỗi từ năm 1995 mà không ai dám sửa vì sẽ làm hỏng vô số website.',
  },
  {
    text: 'Trong hầu hết ngôn ngữ lập trình, 0.1 + 0.2 cho kết quả thế nào so với 0.3?',
    options: [
      'Lớn hơn 0.3 một chút (0.30000000000000004)',
      'Đúng bằng 0.3',
      'Nhỏ hơn 0.3 một chút',
      'Báo lỗi',
    ],
    category: 'code',
    level: 3,
    explain: 'Số thực được lưu bằng nhị phân nên 0.1 và 0.2 không biểu diễn chính xác được.',
  },
  {
    text: 'Độ phức tạp thời gian của tìm kiếm nhị phân trên mảng đã sắp xếp là?',
    options: ['O(log n)', 'O(n)', 'O(1)', 'O(n²)'],
    category: 'code',
    level: 3,
    explain: 'Mỗi bước loại đi một nửa, nên 1 tỉ phần tử chỉ cần khoảng 30 bước.',
  },
  {
    text: 'Trong Python, kiểu dữ liệu nào sau đây là BẤT BIẾN (immutable)?',
    options: ['tuple', 'list', 'dict', 'set'],
    category: 'code',
    level: 3,
    explain: 'Tuple tạo xong là không sửa được phần tử; chuỗi (str) cũng bất biến.',
  },
  {
    text: 'Kiểu tấn công nào chèn mã SQL độc hại vào ô nhập liệu của website?',
    options: ['SQL Injection', 'DDoS', 'Phishing', 'Brute force'],
    category: 'tech',
    level: 3,
    explain: 'Cách phòng là dùng câu truy vấn tham số hoá, đừng bao giờ ghép chuỗi.',
  },
  {
    text: 'Thuật toán sắp xếp nào có độ phức tạp trung bình O(n log n)?',
    options: ['Merge sort', 'Bubble sort', 'Selection sort', 'Insertion sort'],
    category: 'code',
    level: 3,
    explain: 'Ba thuật toán còn lại đều là O(n²) ở trường hợp trung bình.',
  },
  {
    text: 'Thuật toán mã hoá nào sau đây là mã hoá BẤT ĐỐI XỨNG (khoá công khai / khoá riêng)?',
    options: ['RSA', 'AES', 'DES', 'Caesar'],
    category: 'tech',
    level: 3,
    explain: 'RSA (1977) là nền tảng của HTTPS và chữ ký số. AES, DES là mã hoá đối xứng.',
  },
  {
    text: '"Con bọ" (bug) máy tính đầu tiên được ghi nhận năm 1947 thật ra là con gì?',
    options: ['Một con bướm đêm', 'Một con gián', 'Một con muỗi', 'Một con kiến'],
    category: 'fun',
    level: 3,
    explain: 'Nhóm của Grace Hopper tìm thấy nó kẹt trong rơ-le của máy Harvard Mark II.',
  },
  {
    text: 'Ai là tác giả (dưới bút danh) của Bitcoin?',
    options: ['Satoshi Nakamoto', 'Vitalik Buterin', 'Elon Musk', 'Nick Szabo'],
    category: 'fun',
    level: 3,
    explain: 'Đến nay danh tính thật của Satoshi Nakamoto vẫn là một bí ẩn.',
  },
  {
    text: 'Ai được coi là người phát minh ra World Wide Web?',
    options: ['Tim Berners-Lee', 'Bill Gates', 'Steve Jobs', 'Linus Torvalds'],
    category: 'tech',
    level: 3,
    explain: 'Ông đề xuất web năm 1989 khi làm việc tại CERN.',
  },
  {
    text: 'Sự cố "Bọ Y2K" năm 2000 xuất phát từ nguyên nhân nào?',
    options: [
      'Nhiều hệ thống chỉ lưu năm bằng hai chữ số',
      'Virus lây lan qua email',
      'Mạng Internet bị quá tải',
      'Pin dự phòng của máy tính hết sạch',
    ],
    category: 'fun',
    level: 3,
    explain: 'Năm "00" có thể bị hiểu là 1900. Cả thế giới tốn hàng trăm tỉ đô để vá.',
  },
];

if (QUIZ_BANK.length !== 40) {
  // Sai số câu là lỗi lúc soạn, không phải lúc chạy — nổ ngay khi nạp module để
  // không ai phải phát hiện giữa chừng cuộc thi.
  throw new Error(`Ngân hàng câu hỏi phải đủ 40 câu, hiện có ${QUIZ_BANK.length}.`);
}

/**
 * Một câu hỏi ở dạng CHUẨN mà cả bộ có sẵn lẫn bộ do BTC import đều quy về:
 * `answer` là chỉ số đáp án đúng trong `options`. Bộ có sẵn ở trên viết "đáp án đúng
 * luôn là options[0]" cho dễ soạn; file import thì ai cũng đặt đáp án đúng ở đâu tuỳ ý.
 * Cả hai được xáo vị trí như nhau khi bắt đầu lượt (xem `buildQuizQuestions`).
 */
export interface QuizSource {
  text: string;
  options: string[];
  /** Chỉ số (0–3) của đáp án đúng trong `options`. */
  answer: number;
  category: string;
  level: 1 | 2 | 3;
  explain: string;
}

/** Bộ 40 câu có sẵn, quy về dạng chuẩn. Dùng khi BTC chưa import gì. */
export const DEFAULT_QUIZ_QUESTIONS: readonly QuizSource[] = QUIZ_BANK.map((q) => ({
  text: q.text,
  options: [...q.options],
  answer: 0,
  category: q.category,
  level: q.level,
  explain: q.explain,
}));
