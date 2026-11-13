# ClubDay

Web 5 trò chơi cho sự kiện CLB. Bốn trò đầu chơi theo lượt ở booth: mỗi **lượt tối đa 5 người** (đổi được cho từng trò, xem `MAX_PLAYERS`), chơi xong hiện dashboard của đúng nhóm đó. Trò thứ năm, **Ai là triệu phú**, là trò **chơi theo đội** cho cả khán phòng (tới 50 người) — xem mục riêng bên dưới.

| Game | Thời lượng | Cách chơi |
|---|---|---|
| **Tính nhanh** | 90 giây | Chọn 1 trong 4 đáp án. **Điểm = chuỗi đúng dài nhất** |
| **Vẽ hình nhanh** | 15 giây | Vẽ theo từ khoá rồi **bấm NỘP BÀI** để AI chấm — hết giờ thì tự nộp |
| **Nhớ nhanh** | 60 giây | Nhìn chuỗi ô nháy sáng rồi lặp lại. **Điểm = cấp cao nhất vượt được** |
| **Ô khác màu** | 45 giây | Tìm ô lệch màu trong lưới. Mỗi cấp lưới dày thêm và màu sát nhau hơn. **Điểm = cấp cao nhất vượt được** |
| **Ai là triệu phú** | 40 câu × 20 giây | Chơi **theo đội**: máy chiếu chỉ hiện câu hỏi, các đáp án bị **chia nhỏ** cho từng thành viên nên phải đọc to cho nhau; đội trưởng (xoay vòng) mới chốt được. **Chốt càng nhanh điểm càng cao** (600–1000/câu), mỗi đội có 2 quyền trợ giúp: 50:50 và x2 |

---

## Ai là triệu phú

Khác bốn trò kia: **cả phòng đi cùng nhau từng câu**, BTC là người dẫn nhịp, và người chơi **chơi theo đội** — không ai tự trả lời được một mình.

**Luồng vận hành**

1. Ở `/admin` bấm **Tạo lượt** của *Ai là triệu phú* → tự chuyển sang **màn hình điều khiển** `/admin/quiz/<mã>` (cũng là màn hình đem chiếu). Nó hiện mã QR để cả hội trường quét, sức chứa mặc định **50 người**.
2. BTC đặt **số người mỗi đội** (2–10, mặc định 3, hoặc `QUIZ_TEAM_SIZE`) ở ô *Ai là triệu phú* trong `/admin`. Chỉnh được cả khi phòng chờ đã có người.
3. Người chơi quét QR, nhập tên, chờ ở phòng chờ (phòng chờ ghi rõ "mỗi đội N người, chia ngẫu nhiên khi bắt đầu").
4. BTC bấm **Bắt đầu**: server **chia ngẫu nhiên** người chơi thành các đội (sĩ số lệch nhau tối đa 1, ví dụ 7 người, đội 3 → 4 + 3). Mỗi đội có tên + màu riêng; điện thoại hiện đội của mình và các thành viên để tìm nhau.
5. Mỗi câu có **20 giây**; máy chiếu hiện **câu hỏi**, đồng hồ lớn và đội nào đã chốt — **không** hiện bốn đáp án. Đáp án chỉ hiện sau khi công bố.
6. Hết giờ — hoặc mọi đội đã chốt, hoặc BTC bấm **Công bố đáp án** — đáp án đúng, số đội chọn từng ô và một câu giải thích được hiện ra, điểm được cộng cho từng đội.
7. BTC bấm **Câu tiếp theo** (hoặc **Phím cách**; một nút duy nhất đổi nghĩa theo pha). Sau câu cuối lượt kết thúc và ra bảng xếp hạng đội chung cuộc.

**Luật đội — vì sao các thành viên phải nói chuyện với nhau**

- **Đội trưởng xoay vòng.** Mỗi câu một thành viên làm đội trưởng (câu 1 người đầu, câu 2 người thứ hai…, hết vòng thì quay lại). Chỉ đội trưởng **chốt đáp án** và **dùng quyền trợ giúp** được; người khác bấm sẽ bị server từ chối (`NOT_CAPTAIN`).
- **Đội trưởng không đọc được đáp án.** Điện thoại của đội trưởng chỉ có bốn nút **A B C D**, không có chữ.
- **Người đọc chỉ thấy một phần.** Bốn đáp án được chia cho các thành viên còn lại, mỗi người ≥ 1 ô và ô nào cũng có người đọc (đội 4 người → 3 người đọc chia 2+1+1; đội 3 người → 2+2; đội 2 người → người đọc thấy cả bốn). Cách chia **đổi theo từng câu**, và cố định cho một câu (tải lại trang không đổi phần).
- **Mỗi đội một thứ tự A–D riêng.** Đội bên cạnh la "B!" cũng vô ích: chữ B của họ là ô khác với chữ B của đội mình, chỉ có **nội dung** đáp án mới đúng cho mọi đội. Thứ tự đổi theo từng câu và cố định trong một câu. Vì vậy màn chiếu, khi công bố, chỉ hiện nội dung đáp án (không có chữ cái); điện thoại mỗi đội hiện kết quả theo chữ cái của chính đội đó.
- **Máy chiếu không lộ gì.** Bốn đáp án không có trong trạng thái công khai trước khi công bố, nên nhìn lên màn hình hay mở DevTools cũng không đọc được hết.

→ Muốn chốt đúng, các thành viên phải **đọc to phần mình thấy, ghép lại, bàn rồi đội trưởng mới bấm**. Đội 1 người (chỉ xảy ra khi phòng quá ít người) thì tự đọc được cả bốn.

**Chấm điểm** — mỗi câu đúng được `600 + 400 × (thời gian còn lại / 20s)`: chọn ngay giây đầu được **1000**, chọn giây cuối vẫn được **600**; sai hoặc bỏ trống **0**. Điểm giảm dần liên tục theo thời gian đã dùng, và điện thoại hiện luôn "chốt ngay bây giờ: +N điểm" để người chơi thấy thời gian là tiền. Chốt là **chốt**, không đổi được. Điểm thuộc về **cả đội**: mọi thành viên cùng điểm và cùng hạng. Công thức nằm ở `quizPoints` trong `@clubday/contract`, dùng chung cho server chấm và client hiển thị.

**2 quyền trợ giúp** — mỗi **đội** **mỗi quyền một lần** trong cả lượt (đội trưởng bấm; đổi đội trưởng cũng không hồi lại), phải dùng *trước* khi chốt đáp án:

| Quyền | Tác dụng | Dùng được khi |
|---|---|---|
| **50:50** | Loại 2 đáp án sai | Mọi câu |
| **Nhân đôi (x2)** | Câu này đúng thì điểm ×2 (sai thì mất quyền, không được lại) | Chỉ từ câu **mức Vừa trở lên** (câu 11–40). Ở câu dễ nút bị khoá, ghi rõ lý do, và bấm nhầm cũng **không bị trừ quyền** |

Luật "x2 từ mức Vừa" nằm ở `QUIZ_DOUBLE_MIN_LEVEL` trong `@clubday/contract` — server từ chối (`LIFELINE_LOCKED`) và client khoá nút theo cùng một hằng số. Muốn x2 mở sớm hơn hay muộn hơn thì đổi số đó (1 = mọi câu, 3 = chỉ câu khó).

**Bảng xếp hạng ĐỘI có hoạt ảnh** — khi công bố đáp án, các hàng **trượt mượt** sang thứ hạng mới, hàng vừa vượt lên **nháy viền xanh**, người mới lọt top **trượt vào**, và điểm **đếm dần** lên số mới. Trên điện thoại bảng bắt đầu từ thứ hạng cũ rồi mới chuyển, để thấy rõ ai vừa lên ai vừa xuống. Người bật "giảm chuyển động" trong hệ điều hành sẽ không thấy hoạt ảnh nào.

**Câu hỏi — import từ file JSON.** Mặc định là bộ 40 câu có sẵn (`apps/server/src/services/quiz-bank.ts`: công nghệ, lập trình, chuyện vui; xếp dễ → vừa → khó theo 10/15/15). BTC thay bằng đề của mình ngay ở `/admin`, mục **Câu hỏi Ai là triệu phú**:

1. Bấm **File mẫu** để tải `cau-hoi-mau.json`, sửa lại.
2. Bấm **Import file JSON**, chọn file. File sai thì báo **mọi lỗi theo số câu** ("Câu 7: có 3 đáp án, cần đúng 4") và **không đổi gì**; file đúng thì báo đã nạp bao nhiêu câu và có cảnh báo gì (ví dụ không có câu mức Vừa nên x2 không dùng được).
3. Bấm **Xem … câu hỏi** để soát lại nội dung kèm đáp án đúng.

```json
{
  "questions": [
    {
      "text": "Thủ đô của Việt Nam là gì?",
      "options": ["Hà Nội", "Huế", "Đà Nẵng", "Cần Thơ"],
      "answer": "A",
      "level": 1,
      "category": "fun",
      "explain": "Hà Nội là thủ đô từ năm 1010."
    }
  ]
}
```

| Trường | | Ý nghĩa |
|---|---|---|
| `text` | bắt buộc | Câu hỏi (≤ 300 ký tự) |
| `options` | bắt buộc | **Đúng 4** đáp án, không trùng nhau (≤ 120 ký tự mỗi cái) |
| `answer` | bắt buộc | Đáp án đúng: chữ **"A"–"D"** (hoặc số 0–3, 0 là A). Số dạng chuỗi như `"1"` bị từ chối vì dễ nhầm từ 0 hay từ 1 |
| `level` | tuỳ chọn, mặc định 2 | `1`/`2`/`3` hoặc `"dễ"`/`"vừa"`/`"khó"`. **Quyết định x2 có dùng được ở câu đó không** (từ mức 2) |
| `category` | tuỳ chọn | Nhãn hiện cạnh câu hỏi, ví dụ `"tech"`; bỏ trống thì không hiện nhãn |
| `explain` | tuỳ chọn | Một câu giải thích hiện lúc công bố đáp án |

Cũng nhận trực tiếp một mảng `[ {...}, {...} ]`. Tối đa **100 câu**. Thứ tự trong file là thứ tự khi chơi; số câu của lượt = số câu trong file. Vị trí A/B/C/D vẫn được **xáo mỗi lượt**, nên `answer` chỉ nói đáp án nào đúng chứ không cố định ô.

- **Áp dụng cho lượt BẮT ĐẦU từ giờ**; lượt đang chơi đã chụp bộ đề của nó nên không bị đổi giữa chừng.
- Bộ đã import được **lưu ra `data/quiz-questions.json`** (đổi bằng `QUIZ_BANK_FILE`) và nạp lại khi khởi động, nên restart server không mất đề; trên Docker nó nằm trong volume `data`. Nút **Dùng bộ có sẵn** quay về 40 câu gốc.
- Đáp án **chỉ nằm ở server** và chỉ đến client sau khi BTC công bố. Route xem/import đều cần `x-admin-token`.

**Chống gian lận** — điểm và thời gian do server đo (không tin giờ điện thoại); chọn trong <350ms sau khi câu hiện ra bị từ chối và đánh cờ; chỉ BTC (`x-admin-token`) mới công bố / sang câu được.

**Số người mỗi đội & sức chứa** — số người mỗi đội do BTC đặt (`QUIZ_TEAM_SIZE`, 2–10). Sức chứa tổng mặc định 50, tối đa 50, đặt bằng `MAX_PLAYERS_QUIZ`. Trò này **không** theo `MAX_PLAYERS` chung (đó là con số cho các trò ở booth).
---

## Giao diện

<table>
  <tr>
    <td width="25%" valign="top" align="center">
      <img src="docs/screenshots/home.png" alt="Trang chủ: nhập tên và vào lượt của trò BTC đang mở" /><br />
      <b>Trang chủ</b><br />người chơi chỉ nhập tên
    </td>
    <td width="25%" valign="top" align="center">
      <img src="docs/screenshots/lobby.png" alt="Phòng chờ với mã lượt và danh sách người chơi" /><br />
      <b>Phòng chờ</b><br />cập nhật realtime
    </td>
    <td width="25%" valign="top" align="center">
      <img src="docs/screenshots/play.png" alt="Màn hình đang chơi Tính nhanh" /><br />
      <b>Đang chơi</b><br />một đồng hồ chung cả lượt
    </td>
    <td width="25%" valign="top" align="center">
      <img src="docs/screenshots/dashboard.png" alt="Bảng hạng của đúng nhóm vừa chơi" /><br />
      <b>Bảng hạng</b><br />hiện ngay khi hết giờ
    </td>
  </tr>
</table>

<img src="docs/screenshots/admin.png" alt="Trang quản trị: chọn trò, chỉnh số người, tạo lượt, in mã QR" width="100%" />

<p align="center"><b>Trang quản trị</b> — chọn trò đang mở, chỉnh số người mỗi lượt, tạo lượt, in mã QR</p>

> Ảnh do `npm run screenshots` sinh ra: script tự bật server ở cổng riêng, cho
> vài người chơi giả vào chơi thật rồi chụp lại. Sửa giao diện xong chạy lại một
> lệnh là có bộ ảnh mới — xem `docs/screenshots/README.md`.

---

## Kiến trúc tổng thể

**Một process Node.js duy nhất** chạy trên máy BTC. Không database, không Docker, không Python, không service trung gian.

```
   Điện thoại người chơi                    MÁY BTC — 1 process Node.js
   ┌──────────────────┐                     ┌──────────────────────────────────┐
   │ quét QR → nhập   │      HTTP / SSE     │  Fastify 5                       │
   │ tên → vào lượt   │ ──────────────────► │   ├── /api/rounds/*   (lobby)    │
   │                  │                     │   ├── /api/math/*     (game 1)   │
   │  ┌────────────┐  │                     │   ├── /api/draw/*     (game 2)   │
   │  │  React 19  │  │ ◄────────────────── │   ├── /api/memory/*   (game 3)   │
   │  │  + Vite    │  │   SSE realtime      │   ├── /api/leaderboard/stream    │
   │  └────────────┘  │                     │   └── /*  static build React     │
   └──────────────────┘                     │                                  │
                                            │  State các lượt: Map (RAM)       │
                                            │  Model ONNX: nóng sẵn trong RAM  │
                                            └──────────────────────────────────┘
```

Ba quyết định định hình toàn bộ source code:

1. **Một process, cả ba game.** Model AI (20MB) nằm thường trú trong RAM tiến trình server, inference ~3ms. Tách thành service riêng chỉ thêm một chặng HTTP và một thứ nữa để sập — không đổi lại được gì ở quy mô một sự kiện.
2. **Không database.** Mỗi lượt chơi là dữ liệu phù du: 5 người vào, chơi 90 giây, xem kết quả, xong. Không có gì cần truy vấn lịch sử, nên state nằm trong `Map` sống trong RAM. `store/` **chính là** database.
3. **Server là nguồn sự thật duy nhất.** Đồng hồ, điểm số, thứ tự câu hỏi, từ khoá cần vẽ, chuỗi ô cần nhớ — tất cả do server giữ. Client chỉ là màn hình + bàn phím.

---

## Tổ chức source code

### Bốn nguyên tắc

| # | Nguyên tắc | Hệ quả thực tế |
|---|---|---|
| 1 | **Phụ thuộc một chiều:** `routes → services → store` | Không bao giờ import ngược lại. Xem bảng phân tầng bên dưới. |
| 2 | **`store/` là database** | Muốn thêm dữ liệu? Thêm field vào `Round`/`Player`. **Đừng thêm ORM, đừng thêm SQL.** |
| 3 | **Hằng số đã đo thì bất khả xâm phạm** | `dtype: 'fp32'`, `lineWidth: 1.5`, `boxFrac: 0.85` — đều đã đo thực nghiệm, đổi là hỏng. Luôn kèm comment nói rõ. |
| 4 | **Client không bao giờ gửi điểm** | API không có field `score`. Server tự đếm. Đây là ràng buộc thiết kế, không phải chi tiết cài đặt. |

### Cây thư mục

`✅` = đã có · `⬜` = dự kiến · `🔒` = **nền tảng, đã đóng băng** · `🅰️`/`🅱️` = thuộc track nào

> 🔒 = file nền tảng. **Đừng sửa** — nếu thấy cần sửa, đó là dấu hiệu hợp đồng thiếu field:
> dừng lại và trao đổi với người còn lại (xem plan `split-2-tracks` mục 3).

Test đặt ngay cạnh code (`store.test.ts`, `lobby.test.ts`, `dashboard.test.ts`) — chạy `npm test`.

```
ClubDay/
│
├── apps/
│   ├── server/                    ── Backend: API + AI + state các lượt
│   │   ├── src/
│   │   │   ├── index.ts           ✅ 🔒 bootstrap: đọc .env, khôi phục snapshot, listen
│   │   │   ├── app.ts             ✅ 🔒 factory Fastify — đăng ký sẵn CẢ 2 route
│   │   │   ├── config.ts          ✅ 🔒 PORT, ADMIN_TOKEN, đường dẫn cache
│   │   │   ├── model.ts           ✅ 🔒 hằng số model — GHIM dtype fp32
│   │   │   │
│   │   │   ├── store/             ── "DATABASE" — state trong RAM
│   │   │   │   ├── types.ts       ✅ 🔒 Round, Player — HỢP ĐỒNG ĐÓNG BĂNG
│   │   │   │   ├── store.ts       ✅ 🔒 Map + CRUD + pub/sub cho SSE + dọn rác
│   │   │   │   ├── state.ts       ✅ 🔒 RoundState — view-model cho REST + SSE
│   │   │   │   ├── lobby.ts       ✅ 🔒 join / start / skip / đồng hồ nền
│   │   │   │   ├── dashboard.ts   ✅ 🔒 xếp hạng 5 người
│   │   │   │   └── snapshot.ts    ✅ 🔒 ghi JSON chống mất dữ liệu khi restart
│   │   │   │
│   │   │   ├── routes/            ── HTTP: chỉ validate + gọi nghiệp vụ
│   │   │   │   ├── rounds.ts      ✅ 🔒 join / start / state / dashboard
│   │   │   │   ├── stream.ts      ✅ 🔒 SSE (tự quản socket, có keep-alive)
│   │   │   │   ├── admin.ts       ✅ 🔒 tạo lượt, bỏ qua, reset
│   │   │   │   ├── admin-guard.ts ✅ 🔒 xác thực header x-admin-token
│   │   │   │   ├── math.ts        ✅ 🅰️ API Tính nhanh (đã xong)
│   │   │   │   ├── draw.ts        ✅ 🅱️ API Vẽ (đã xong)
│   │   │   │   ├── memory.ts      ✅ 🅲 API Nhớ nhanh (đã xong)
│   │   │   │   └── spot.ts        ✅ 🅳 API Ô khác màu (đã xong)
│   │   │   │
│   │   │   ├── services/          ── NGHIỆP VỤ: không biết gì về HTTP
│   │   │   │   ├── math-gen.ts    ✅ 🅰️ sinh câu hỏi (PRNG seed, chống trùng liền kề)
│   │   │   │   ├── math-session.ts✅ 🅰️ trọng tài Tính nhanh (đồng hồ, spam, chấm điểm)
│   │   │   │   ├── raster.ts      ✅ 🅱️ nét → 28×28 (hằng số ĐÃ ĐO — đừng đổi)
│   │   │   │   ├── classifier.ts  ✅ 🅱️ model singleton, ghim fp32, hàng đợi tuần tự
│   │   │   │   ├── labels.ts      ✅ 🅱️ từ khoá + tên tiếng Việt + luật chấp nhận
│   │   │   │   ├── allowlist.generated.ts ✅ 🅱️ SINH TỰ ĐỘNG — đừng sửa tay
│   │   │   │   ├── draw-session.ts✅ 🅱️ trọng tài Vẽ (đồng hồ, spam, seq, chấm điểm)
│   │   │   │   ├── memory-gen.ts  ✅ 🅲 sinh chuỗi ô (PRNG seed, chặn 3 ô trùng liền)
│   │   │   │   ├── memory-session.ts ✅ 🅲 trọng tài Nhớ nhanh (đồng hồ, spam, chống bot)
│   │   │   │   ├── spot-gen.ts    ✅ 🅳 sinh bàn Ô khác màu (lệch ĐỘ SÁNG, không lệch tông)
│   │   │   │   └── spot-session.ts ✅ 🅳 trọng tài Ô khác màu
│   │   │   │
│   │   │   └── lib/               ── tiện ích thuần
│   │   │       ├── prng.ts        ✅ 🔒 mulberry32 (dùng chung 2 track)
│   │   │       ├── id.ts          ✅ 🔒 mã lượt 6 ký tự (bỏ I/O/0/1)
│   │   │       ├── rate-limit.ts  ✅ 🔒 tooFast(last, now, minGap)
│   │   │       └── health.ts      ✅ 🔒 thanh ghi health-check
│   │   │
│   │   ├── package.json           ✅
│   │   └── tsconfig.json          ✅
│   │
│   └── web/                       ── Frontend: React + Vite + Tailwind CSS 4
│       ├── src/
│       │   ├── main.tsx           ✅    điểm khởi động React
│       │   ├── App.tsx            ✅ 🔒 router — KHÔNG cần sửa khi làm game
│       │   ├── styles.css         ✅    Tailwind v4 + khối @theme
│       │   ├── routes/            ── 1 file = 1 màn hình
│       │   │   ├── Home.tsx       ✅ 🔒 chọn game + nhập tên (cả / và /r/:code)
│       │   │   ├── Lobby.tsx      ✅ 🔒 5 slot, chờ BTC
│       │   │   ├── Play.tsx       ✅ 🔒 dispatcher → MathGame | DrawGame
│       │   │   ├── Dashboard.tsx  ✅ 🔒 bảng hạng 5 người
│       │   │   ├── Admin.tsx      ✅ 🔒 màn hình BTC (tạo lượt, bắt đầu, mã QR)
│       │   │   ├── MathGame.tsx   ✅ 🅰️ màn hình Tính nhanh (đã xong)
│       │   │   ├── DrawGame.tsx   ✅ 🅱️ màn hình Vẽ (frame = gợi ý, nút NỘP BÀI)
│       │   │   ├── MemoryGame.tsx ✅ 🅲 màn hình Nhớ nhanh (xem chuỗi → lặp lại)
│       │   │   └── SpotGame.tsx   ✅ 🅳 màn hình Ô khác màu (tìm ô lệch màu)
│       │   ├── components/
│       │   │   ├── Shell.tsx      ✅ 🔒 khung màn hình
│       │   │   ├── Countdown.tsx  ✅ 🔒 đồng hồ + thanh tiến độ
│       │   │   ├── RankTable.tsx  ✅ 🔒 bảng hạng
│       │   │   ├── ChoicePad.tsx  ✅ 🅰️ 4 nút đáp án (server sinh + xáo trộn)
│       │   │   ├── DrawCanvas.tsx ✅ 🅱️ canvas + giữ pointer (setPointerCapture)
│       │   │   ├── MemoryPad.tsx  ✅ 🅲 bàn 4 ô nháy sáng (màu + hình, phím 1–4)
│       │   │   ├── Avatar.tsx     ✅    ô chữ cái đầu tên người chơi
│       │   │   ├── Chips.tsx      ✅    nhãn game, kết nối, trạng thái lượt, spinner
│       │   │   ├── Logo.tsx       ✅    logo DSC (src/assets/logo-dsc.png, luôn trên nền trắng)
│       │   │   └── Toast.tsx      ✅    thông báo ở góc màn hình, tự tắt sau 1,2 giây
│       │   └── lib/               ✅ api · sse · useCountdown · session · types · format (🔒)
│       │                          ✅    game-theme.ts — icon + màu nhận diện từng game
│       │                          ✅ 🅰️ api-math.ts — client riêng của Track A
│       │                          ✅ 🅱️ api-draw.ts — client riêng của Track B
│       │                          ✅ 🅲 api-memory.ts — client riêng của Track C
│       │                          ✅ 🅱️ strokes.ts — gom nét từ pointer event
│       ├── index.html             ✅
│       ├── vite.config.ts         ✅ (proxy /api → :8787 khi dev)
│       ├── package.json           ✅
│       └── tsconfig.json          ✅
│
├── scripts/                       ── Công cụ vận hành — KHÔNG thuộc runtime
│   ├── prefetch-model.ts          ✅ tải model về ./models để chạy offline
│   ├── check-offline.ts           ✅ chặn internet, xác nhận model vẫn load được
│   ├── smoke-test.mjs             ✅ chạy thử end-to-end (71 kiểm tra)
│   ├── eval-model.ts              ✅ 🅱️ đo accuracy 345 class → SINH RA allowlist
│   ├── load-test.mjs              ✅ giả lập N người vẽ đồng thời + stress → JSON
│   └── report-loadtest.mjs        ✅ JSON đó → báo cáo HTML tự chứa
│
├── .hermes/plans/                 ── Tài liệu thiết kế (plan v2 là bản chuẩn)
├── README.md                      ✅ file này
├── package.json                   ✅ npm workspaces + script gốc
├── tsconfig.base.json             ✅ cấu hình TS dùng chung
└── models/                        📦 cache ONNX (~20MB) — KHÔNG commit
```

### Server: bốn tầng và ranh giới

Đây là phần quan trọng nhất cần hiểu. Mỗi tầng chỉ được biết những gì trong cột "Biết":

| Tầng | Thư mục | Biết | **KHÔNG được biết** |
|---|---|---|---|
| **HTTP** | `routes/` | `req`/`reply`, zod schema, mã lỗi | luật chơi, `Map`, cấu trúc `Round` |
| **Nghiệp vụ** | `services/` | luật chơi, thời gian, model AI | `req`/`reply`, Fastify, HTTP status |
| **Trạng thái** | `store/` | `Round`/`Player`, `Map`, GC | HTTP, luật chơi, model AI |
| **Tiện ích** | `lib/` | tham số đầu vào | mọi thứ khác (hàm thuần) |

**Phép thử nhanh:** nếu bạn cần `import fastify` bên trong `services/` hoặc `store/`, tức là code đang đặt sai tầng.

Lợi ích cụ thể: `services/math-session.ts` nhận `now` như một **tham số** thay vì gọi `Date.now()` bên trong — nhờ vậy test chống gian lận có thể giả lập "đã hết giờ" mà không cần chờ 90 giây thật.

### Web: ba tầng

| Tầng | Thư mục | Vai trò |
|---|---|---|
| **Màn hình** | `routes/` | 1 file = 1 màn hình. Ghép component + gọi API. |
| **UI** | `components/` | Component tái dùng, không gọi API, nhận props. |
| **Tiện ích** | `lib/` | `api.ts` (fetch), `sse.ts` (EventSource), `strokes.ts` (bắt nét vẽ), `useCountdown.ts`. |

**Giao diện dùng Tailwind CSS 4.** Theme được khai báo ngay trong `apps/web/src/styles.css`
bằng khối `@theme` — **không có `tailwind.config.js`** (đây là cách của Tailwind v4).
Muốn thêm màu hay token mới thì thêm biến `--color-*` vào khối đó, rồi dùng như utility bình
thường (`bg-primary`, `text-muted`, …). Hạn chế viết CSS rời; chỉ viết tay khi thật cần
(ví dụ `touch-action: none` cho canvas vẽ).

Phong cách **neo-brutalism, bản nền tối**. Bốn luật, và chúng giải thích gần như mọi dòng
trong `styles.css`:

1. **Không bo góc** — mọi `--radius-*` đặt về 0, nên `rounded-xl` rải khắp code cũng ra góc
   vuông. Muốn quay lại kiểu bo tròn thì sửa đúng chỗ đó, không phải sửa 200 chỗ dùng.
2. **Viền trắng dày 3px**, đục hoàn toàn — viền là thứ dựng nên hình khối, không phải bóng mờ.
3. **Bóng đổ đặc, lệch chéo** (`6px 6px 0`), không blur. Bấm xuống thì khối trượt vào chỗ bóng.
   Khối vốn đã trắng (logo, mã QR) thì bóng đổi sang màu vàng, vì bóng trắng sau lưng nó
   không ai thấy.
4. **Màu phẳng, rực**, không gradient. Nền gần đen để màu neon nảy hẳn lên.

Class dùng chung khai báo trong `@layer components` của `styles.css`: `.btn` (+ `btn-primary`,
`btn-accent`, `btn-correct`, `btn-ghost`, `btn-sm`, `btn-lg`), `.card`, `.field`, `.stage-bg`.
Mỗi game có màu nhận diện riêng (`math` cyan, `draw` hồng, `memory` lime, `spot` cam, `quiz` xanh tím) — xem
`lib/game-theme.ts`.

Một họ chữ duy nhất: **Be Vietnam Pro** 400→900 (tiêu đề dùng 800/900), **tự host** qua
`@fontsource` — không dùng Google Fonts CDN vì ngày sự kiện có thể không có internet. Bản cũ
dùng Baloo 2 cho tiêu đề; chữ bo tròn mũm mĩm là thứ brutalism không bao giờ dùng, và
Be Vietnam Pro vốn được thiết kế cho tiếng Việt nên dấu không vỡ ở cỡ lớn.
Icon dùng `lucide-react` (SVG, đóng gói vào bundle), không dùng emoji làm icon.

### Điểm cắm — cách 2 track nối vào nền tảng mà KHÔNG sửa file 🔒

Nền tảng cung cấp sẵn 3 điểm cắm. Mỗi track chỉ **gọi**, không cần sửa file dùng chung:

| Điểm cắm | Ở đâu | Dùng thế nào |
|---|---|---|
| `registerStartHook(game, fn)` | `store/lobby.ts` | Chạy khi BTC bấm BẮT ĐẦU. A sinh câu hỏi, B chọn từ khoá. |
| `registerHealth(name, fn)` | `lib/health.ts` | Báo tình trạng ở `/api/health`. B báo `model: ready`. |
| `Play.tsx` (dispatcher) | `apps/web/src/routes/` | Đọc `round.game` → render `MathGame` hoặc `DrawGame`. |

Track A thêm vào `routes/math.ts`:

```ts
registerStartHook('math', (round, now) => {
  round.questions = generateQuestions(seed, 60);
});
```

Track C thêm vào `routes/memory.ts`:

```ts
registerStartHook('memory', (round) => {
  round.sequence = generateSequence(seedFromRoundId(round.id));
});
```

Track B thêm vào `routes/draw.ts`:

```ts
registerStartHook('draw', (round) => {
  round.target = pickTarget();
});
registerHealth('model', () => (isModelReady() ? 'ready' : 'not-loaded'));
```

Cả hai đều **không đụng** `app.ts`, `lobby.ts`, hay `App.tsx` — đó là mục đích của các điểm cắm này.

### Luồng request

**Tính nhanh** — mọi con số quyết định đều ở server:

```
Client                          Server
  │                                │
  ├── POST /api/rounds/join ──────►│  gán playerId, thêm vào Round
  │◄── { playerId, endsAt } ───────│  (chưa bắt đầu — chờ BTC)
  │                                │
  │        … BTC bấm BẮT ĐẦU …     │  startedAt=now, endsAt=now+90s
  │                                │  sinh sẵn 60 câu hỏi
  │                                │
  ├── POST /:id/answer ───────────►│  ① còn trong giờ?  ② ≥250ms từ câu trước?
  │   { playerId, idx, value }     │  ③ đúng câu hiện tại?  → tự chấm điểm
  │◄── { correct, question kế } ───│  (KHÔNG có field score trong request)
  │                                │
  ├── GET  /:id/stream (SSE) ─────►│  đẩy trạng thái mỗi khi round.version đổi
  │◄── dashboard 5 người ──────────│  khi now > endsAt
```

**Vẽ hình** — ảnh không bao giờ đi qua mạng, và ĐIỂM CHỈ SINH RA KHI NỘP:

```
Client                                     Server
  │                                          │
  ├── POST /:id/frame (mỗi ~1s) ────────────►│  ① còn trong 15s?  ② ≥1000ms từ frame trước?
  │   { strokes: [[[x,y],…],…] }             │  ③ rasterize(strokes) → 28×28
  │                                          │  ④ classify() → top-3 nhãn
  │◄── { hint, top: […] } ───────────────────│  ⬅ GỢI Ý thôi: KHÔNG cộng điểm
  │                                          │     (server giữ lại nét mới nhất)
  │                                          │
  │        … người chơi bấm NỘP BÀI …        │
  ├── POST /:id/submit ─────────────────────►│  ① chưa nộp?  ② còn trong quãng ân hạn?
  │   { strokes } — bỏ trống = nét server giữ │  ③ rasterize → classify → so từ khoá
  │◄── { matched, score, reason } ───────────│  ④ score = 150 − số giây (kẹp ở 15)
  │                                          │
  │        … hết 15 giây …                   │  hook kết thúc lượt: ai CHƯA nộp thì
  │                                          │  server tự chấm bằng nét cuối nó giữ
```

Client gửi **toạ độ nét thô**, không gửi ảnh. Server tự vẽ lại ở 28×28 — nhờ vậy client không thể
gửi một bức ảnh có sẵn, và payload nhẹ hơn base64 PNG khoảng 10–30 lần.

Điểm **không** phụ thuộc vào việc AI có đọc ra hình trong lúc đang vẽ hay không: frame chỉ để hiện
"AI nghĩ: …". Nếu hễ model đọc ra là cộng điểm thì người đang vẽ dở cũng bị tính là đã thắng — đó
là lỗi cũ, và có test canh để nó không quay lại.

**Nhớ nhanh** — server chỉ nhả chuỗi của ĐÚNG cấp đang chơi:

```
Client                                  Server
  │                                       │
  ├── GET  /:id/sequence ────────────────►│  cấp n → n ô ĐẦU của chuỗi cả lượt
  │◄── { level: n, sequence: […n ô] } ────│  ⏱ đóng dấu "đã gửi lúc nào"
  │                                       │     (phần sau của chuỗi KHÔNG gửi)
  │   … nháy lại n ô, mất n × 600ms …     │
  │   … người chơi chạm lặp lại …         │
  │                                       │
  ├── POST /:id/replay ──────────────────►│  ① còn trong giờ?  ② đúng cấp của mình?
  │   { level, taps: [1,3,0,…] }          │  ③ ≥250ms từ lượt trước?
  │                                       │  ④ ĐÃ ĐỦ THỜI GIAN XEM CHƯA?
  │◄── { correct, score, cấp kế } ────────│  ⑤ so với chuỗi server giữ → chấm
```

Chốt ④ là thứ thay cho "chống spam" của hai game kia: muốn lặp đúng n ô thì phải
xem hết n ô đã, mà xem hết mất `n × 600ms`. Bot nhận chuỗi rồi bấm lại ngay sẽ
đúng từng ô nhưng về sớm hơn quãng đó — và bị chặn.

### Trạng thái hiện tại

| Thành phần | Trạng thái |
|---|---|
| Môi trường, build, 2 workspace | ✅ chạy được |
| Model AI tải + chạy offline | ✅ đã verify (`npm run check:offline`) |
| **Phase F — nền tảng** (store, lobby, SSE, admin, router, 2 stub) | ✅ **XONG** |
| 🅰️ Track A — Tính nhanh (`math-gen`, `math-session`, `math-options`, `ChoicePad`) | ✅ **XONG** — đã merge `main` |
| 🅱️ Track B — Vẽ hình (`raster`, `classifier`, `labels`, `draw-session`) | ✅ **XONG** — đã merge `main` |
| 🅱️ **Nộp bài** — nút NỘP BÀI + tự nộp khi hết giờ | ✅ **XONG** trên nhánh `feat/draw-submit` |
| 🅲 Track C — Nhớ nhanh (`memory-gen`, `memory-session`, `MemoryPad`) | ✅ **XONG** |
| 🅳 Track D — Ô khác màu (`spot-gen`, `spot-session`, `SpotGrid`) | ✅ **XONG** |
| Tích hợp + load test + diễn tập | ⬜ Wave 3 |

Chạy kiểm tra bất cứ lúc nào:

```bash
npm test       # toàn bộ unit test (server + web)
npm run smoke  # 86 kiểm tra end-to-end (tự bật server rồi tắt, có nạp model thật)
               # ⏱ chậm hơn trước ~20s: có kiểm tra phải chờ hết 15 giây thật của lượt Vẽ
```

Test của game Tính nhanh tập trung vào **chống gian lận**: hết giờ không cộng điểm dù đúng,
chặn trả lời nhanh hơn 250ms, không cho nhảy câu hay trả lời lại, và **đáp án không bao giờ
được gửi ra client** (có regression test riêng cho việc này).

### Cách tính điểm Tính nhanh — đọc trước khi sửa

Điểm là **chuỗi đúng dài nhất**, không phải tổng số câu đúng. Trả lời sai làm chuỗi hiện tại
về 0 nhưng **không** lấy đi chuỗi dài nhất đã lập — người vừa mất chuỗi vẫn còn lý do trả lời
tiếp thay vì buông xuôi 90 giây.

Hệ quả cần nhớ: `player.score` **mỗi game một nghĩa** — Tính nhanh là chuỗi dài nhất, Vẽ hình
là `150 − số giây`. `dashboard.ts` là nơi **duy nhất** đọc nó để xếp hạng. Bằng điểm là chuyện
thường gặp ở Tính nhanh, nên khi bằng thì xếp theo **số câu đúng nhiều hơn**; nếu rơi thẳng
xuống so thời gian thì người trả lời ít câu hơn lại xếp trên, ngược hẳn với điều ai cũng nghĩ
là công bằng. Luật tie-break này **chỉ áp cho `game === 'math'`** — có test canh để nó không
rò sang game Vẽ.

### Cách chấm điểm Vẽ hình — đọc trước khi sửa

Điểm chỉ sinh ra ở **đúng một thời điểm**: lúc bài được NỘP, và mỗi người chỉ nộp được một lần.

- Bấm **NỘP BÀI** → chấm ngay: `150 − số giây đã dùng`; không nhận ra hình thì 0 điểm.
- Hết 15 giây → client tự nộp. Ai không gửi được (treo tab, mất mạng) thì **server tự nộp hộ**
  bằng nét vẽ cuối cùng nó đã nhận được, không cần client hợp tác.
- Nộp lại lần nữa **không** chấm lại — server trả về đúng kết quả cũ kèm `already: true`, nên bấm
  đúp hay mạng bắn lại cũng không đổi điểm.

Hai chỗ dễ sửa nhầm:

1. **Quãng ân hạn 2.5 giây** (`SUBMIT_GRACE_MS`) sau mốc hết giờ. Bài nộp thật của client luôn tới
   sau `endsAt` vài trăm ms, mà đồng hồ nền của server quét mỗi 500ms — không có quãng này thì mọi
   bài nộp đúng lúc hết giờ đều bị trả `TIME_UP` và cả lượt không ai có điểm. Số giây bị **kẹp ở độ
   dài lượt**, nên nộp muộn không thể ăn điểm cao hơn nộp đúng mốc. Đường TỰ NỘP của server chạy
   *sau* quãng đó nên phải truyền `force: true`, không thì nó bị chính quãng ân hạn chặn lại.
2. **Bỏ qua lượt (admin) KHÔNG tự nộp.** Bỏ qua là huỷ lượt, thời gian gần như bằng 0, nên nếu để
   hook kết thúc lượt tự chấm thì cả 5 người bỗng được ~150 điểm và nhảy lên đầu bảng.

### Cách tính điểm Nhớ nhanh — đọc trước khi sửa

Điểm là **cấp cao nhất đã vượt**. Lặp sai thì cấp hiện tại về 1 nhưng **không**
lấy đi kỷ lục — giống hệt luật chuỗi của Tính nhanh, và vì cùng lý do: người vừa
trượt ở cấp 7 vẫn còn cớ chơi tiếp thay vì ngồi hết 60 giây.

Cấp n dùng **n ô đầu của cùng một chuỗi**, nên lên cấp chỉ là nối thêm một ô vào
thứ vừa nhớ được. Nếu mỗi cấp sinh chuỗi mới thì người chơi phải học lại từ đầu
mỗi lần, và trò chơi mất hẳn cảm giác nhớ dài dần — có test canh tính chất này.

Ba chỗ dễ sửa nhầm:

1. **`MEMORY_STEP_MS = 600` là hằng số CHUNG server ↔ client.** Client phát lại
   chuỗi theo nó, còn server dựa vào chính nó để biết một lượt lặp có kịp xem hay
   không. Sửa một bên mà quên bên kia thì người chơi **thật** bị chặn vì nghi gian
   lận. Bản sao nằm ở `apps/web/src/lib/types.ts`.
2. **Ngưỡng xem là 80% thời gian phát lý thuyết** (`MIN_WATCH_RATIO`), không phải
   100%. Server đo từ lúc nó *gửi* chuỗi nên đồng hồ của nó luôn dài hơn thời gian
   phát thật ở máy người chơi; để nguyên 100% thì chỉ cần client lệch vài ms là
   người thật bị gắn cờ.
3. **Mọi đường gửi chuỗi ra ngoài phải đi qua `currentSequence()`** — nó đóng dấu
   thời gian, tức một nửa của chốt chống bot. Trả chuỗi thẳng từ `round.sequence`
   là vô hiệu hoá chốt đó.

### Quy ước khi thêm code

0. **Thêm game mới?** Thêm đúng một phần tử vào `GAME_KINDS` (`store/types.ts`) —
   route `/api/rounds/open`, zod enum, lưới chọn game ở trang chủ và trang BTC đều
   đọc mảng đó. TypeScript sẽ chỉ ra nốt những chỗ còn thiếu (`DURATION_MS`,
   `GAME_LABEL`, `SCORE_LABEL`, `GAME_THEME`, bảng `SCREENS` trong `Play.tsx`).
1. **Thêm endpoint mới?** Tạo/sửa file trong `routes/` theo domain, validate body bằng zod, rồi gọi `services/`. Không viết luật chơi trong route.
2. **Thêm dữ liệu mới cho một lượt?** Thêm field vào `Round` hoặc `Player` trong `store/types.ts`. **Không** thêm database, ORM, hay migration.
3. **Đụng vào model AI?** Mọi thay đổi `dtype`, kích thước input, hay cách rasterize đều phải **chạy lại `eval-model.mjs` và đo accuracy** trước khi merge. Xem mục Ghi chú kỹ thuật.
4. **Test** đặt cạnh code (`*.test.ts`). Test chống gian lận là bắt buộc — nó bảo vệ tính công bằng của sự kiện.
5. **Hằng số có số đo** phải kèm comment nói rõ đã đo và đo ra sao.

---

## Cách chạy

Bốn mốc: **cài một lần** → **dev hằng ngày** → **chạy bản thật** → **thử chơi**.

> Máy mới cài lần đầu: đọc [INSTALL.md](INSTALL.md) — hướng dẫn từng bước kèm cách kiểm tra và xử lý sự cố.

### 0. Yêu cầu

| | |
|---|---|
| Node.js | >= 20 (đã test trên v24.13.0) |
| Dung lượng trống | ~150MB cho `onnxruntime-node`, ~20MB cho model |
| Shell | bash (git-bash trên Windows). Các lệnh dưới viết theo bash. |

### 1. Cài đặt (chỉ một lần)

```bash
git clone <repo-url> ClubDay
cd ClubDay
npm install
```

Tạo file cấu hình:

```bash
cp .env.example .env          # Windows không có cp thì dùng:  copy .env.example .env
```

Mở `.env` và **đổi `ADMIN_TOKEN`** — đây là mật khẩu bảo vệ trang `/admin`:

```ini
ADMIN_TOKEN=ma-cua-ban-dat-o-day
PORT=8787
```

Tải model AI về máy (cần internet, chỉ một lần):

```bash
npm run prefetch              # tải model ONNX (~20MB) về ./models
npm run check:offline         # phải in "✅ OFFLINE OK"
```

> **Thứ tự ưu tiên:** biến môi trường **thắng** `.env`.
> Nên `MODEL_OFFLINE=1 npm start` ghi đè giá trị trong `.env` — tiện khi cần thử nhanh mà không sửa file.

### 2. Chạy khi phát triển

Cần **2 terminal chạy song song**:

```bash
# Terminal 1 — server API
npm run dev:server            # http://localhost:8787

# Terminal 2 — giao diện web
npm run dev:web               # http://localhost:5173
```

Mở **<http://localhost:5173>** — *không phải* 8787.
Ở chế độ dev, Vite phục vụ giao diện và tự chuyển tiếp `/api` sang server. Thiếu một trong hai terminal là không chạy được.

Kiểm tra server sống: <http://localhost:8787/api/health>

### 3. Chạy bản thật (giống ngày sự kiện)

```bash
npm run build                 # web -> apps/web/dist, server -> apps/server/dist
npm start
```

Lúc này **chỉ cần một URL duy nhất**: <http://localhost:8787> — server phục vụ luôn cả giao diện.
Chế độ này **không cần** chạy Vite nữa.

Tắt server: `Ctrl+C` — server tự lưu snapshot trước khi thoát.

### 4. Thử chơi — luồng vận hành

| Bước | Ai | Làm gì |
|---|---|---|
| 1 | BTC | Mở `/admin`, dán `ADMIN_TOKEN` vào ô trên cùng (lưu vào máy, chỉ nhập một lần) |
| 2 | BTC | Bấm **Tạo lượt** ở trò muốn chơi (Tính nhanh / Vẽ hình / Nhớ nhanh / Ô khác màu / Ai là triệu phú) → trò đó thành **trò đang mở**, hiện mã 6 ký tự kèm **mã QR** để quét |
| 3 | Người chơi | Quét QR (hoặc mở `http://<IP>:8787`) → nhập tên → vào phòng chờ của **trò BTC đang mở** |
| 4 | | Tối đa **5 người**. Người thứ 6 bị chặn và báo "chờ lượt sau" |
| 5 | BTC | Bấm **BẮT ĐẦU** ở `/admin` (màn hình phòng chờ KHÔNG có nút này) |
| 6 | | Hết giờ tự chuyển sang bảng xếp hạng của đúng 5 người đó |

Vài chi tiết đã cài sẵn:
- **Số người mỗi lượt đặt được cho từng trò**, và chỉnh được **ngay trên `/admin`** bằng nút −/+ cạnh mỗi trò (1–20). Giá trị khởi đầu lấy từ `.env`: `MAX_PLAYERS=8` cho mọi trò, `MAX_PLAYERS_DRAW=3` đè riêng trò Vẽ; gõ sai thì server cảnh báo rồi dùng mặc định chứ không sập. Chỉnh ở `/admin` sống trong RAM như mọi state khác — **khởi động lại là về giá trị `.env`**. Mỗi lượt **chốt sức chứa lúc được tạo**, nên đổi số giữa chừng không làm lượt đang chờ đổi luật.
- **Mỗi thời điểm chỉ MỘT trò được chơi.** BTC chọn trò ở `/admin`; người chơi không tự chọn — trang chủ chỉ cho vào trò đang mở, trò còn lại hiện mờ "chưa tới lượt". Đổi trò thì mọi lượt đang **chờ** của trò cũ bị bỏ (lượt đang chơi vẫn chơi hết giờ). Nút **Tạm đóng** chặn người vào lượt mới trong lúc giải lao.
- **Chỉ BTC bắt đầu được lượt.** `POST /api/rounds/:id/start` đòi header `x-admin-token`; gọi thẳng từ DevTools cũng nhận 401. Nút **BẮT ĐẦU** chỉ có ở `/admin`; phòng chờ `/lobby/<mã>` là màn hình người chơi nên không có nút nào — nó chỉ báo "đang chờ BTC".
- Chạy với `NODE_ENV=production` mà **thiếu `ADMIN_TOKEN`** thì mọi thao tác quản trị bị từ chối (503) thay vì mở toang. Ở chế độ dev vẫn cho qua kèm cảnh báo lúc khởi động.
- Bắt đầu được với **≥ 1 người** — không có timeout tự động, BTC chủ động về nhịp.
- Bấm **Bỏ qua** ở `/admin` để kết thúc lượt ngay.
- Ai vào sau khi lượt đã bắt đầu sẽ bị từ chối — để không ai bị thiếu giờ so với người khác.

### 5. Chơi từ điện thoại (LAN)

Lấy IP máy BTC:

```bash
ipconfig                      # tìm dòng "IPv4 Address", ví dụ 192.168.1.14
```

Điện thoại **cùng Wi-Fi**, mở `http://192.168.1.14:8787`.

Nếu không vào được:
- Server phải bind `0.0.0.0` (mặc định), không phải `127.0.0.1`.
- Windows Firewall có thể chặn lần đầu — bấm **Allow** ở hộp thoại, hoặc mở cổng thủ công:
  ```bash
  netsh advfirewall firewall add rule name="ClubDay" dir=in action=allow protocol=TCP localport=8787
  ```
- Điện thoại và máy BTC phải **cùng một mạng** — Wi-Fi khách (guest) thường chặn kết nối nội bộ.

### 6. Checklist ngày sự kiện

```bash
npm run build
MODEL_OFFLINE=1 ADMIN_TOKEN=<mã-bí-mật> npm start
```

- **Bắt buộc `npm run prefetch` trước** khi còn internet, và xác nhận bằng `npm run check:offline`
  → phải in `✅ OFFLINE OK`. Lệnh này chặn hẳn request tải model, nên chạy được nghĩa là
  sự kiện không phụ thuộc internet.
- In QR trỏ `http://<IP>:8787` dán ở khu vực chơi — lấy mã ngay ở `/admin` (ô **Cả sự kiện**,
  bấm **Phóng to** rồi chụp/in). Mã QR sinh ngay trong trình duyệt, KHÔNG gọi dịch vụ ngoài
  nên vẫn chạy khi offline.
- Tắt sleep/hibernate và Windows Update trên máy BTC; cắm sạc.
- Diễn tập trước bằng 5 người thật, cả 2 game.

### Tất cả lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev:server` | Server dev, tự nạp lại khi sửa code |
| `npm run dev:web` | Giao diện dev (Vite) |
| `npm start` | Chạy bản đã build — server phục vụ cả API lẫn web, 1 cổng |
| `npm run build` | Build cả web và server |
| `npm test` | Toàn bộ unit test — cả 2 workspace |
| `npm run smoke` | 71 kiểm tra end-to-end — tự bật server ở cổng 8799 rồi tắt |
| `npm run loadtest` | Load + stress test đường vẽ. `-- --levels 16,32` để đẩy cao hơn |
| `npm run report:loadtest` | Dựng báo cáo HTML từ JSON của lần đo gần nhất |
| `npm run screenshots` | Chụp lại bộ ảnh trong README (Playwright, tự bật server riêng) |
| `npm run prefetch` | Tải model ONNX về `./models` |
| `npm run check:offline` | Xác nhận model vẫn load được khi không có internet |
| `npm run eval:model` | Đo accuracy THẬT rồi sinh lại `allowlist.generated.ts` (~35s) |

### Xử lý sự cố

| Hiện tượng | Cách sửa |
|---|---|
| `EADDRINUSE :8787` | Cổng bị chiếm. Đổi `PORT` trong `.env`, hoặc tìm và tắt tiến trình: `netstat -ano \| grep :8787` rồi `taskkill /F /PID <pid>` |
| Mở 5173 ra trang trắng | Chưa chạy `npm run dev:server` ở terminal kia |
| `/admin` báo "Sai mã quản trị" | `ADMIN_TOKEN` trong `.env` khác với mã đã nhập |
| Vào `/admin` không cần mã | `.env` chưa có `ADMIN_TOKEN` (chỉ xảy ra ở chế độ dev). Server in cảnh báo lúc khởi động — đọc log |
| `/admin` báo 503 `ADMIN_NOT_CONFIGURED` | Chạy production mà thiếu `ADMIN_TOKEN` — đặt biến rồi khởi động lại |
| Người chơi báo "BTC chưa mở trò nào" | Đang ở trạng thái **Tạm đóng** — vào `/admin` tạo lượt cho trò muốn chơi |
| "Lượt này đủ 5 người rồi" | Đúng thiết kế. BTC tạo lượt mới ở `/admin` |
| Model lỗi khi khởi động | Chưa chạy `npm run prefetch` |
| Sửa `.env` mà không thấy đổi | Server chỉ đọc `.env` lúc khởi động — phải khởi động lại |

---

## Ghi chú kỹ thuật

### Model nhận diện hình vẽ — luôn dùng `dtype: 'fp32'`

Đo thật trên 200 mẫu QuickDraw (20 class):

| dtype | top-1 |
|---|---|
| **fp32** | **82.5%** ✅ |
| fp16 | load lỗi ❌ |
| q8 | 7.0% ❌ |

Cùng một bộ weights. `q8` **âm thầm** phá accuracy 82.5% → 7.0% mà không báo lỗi gì — nó vẫn load
bình thường, vẫn chạy 4ms, chỉ là trả về kết quả sai một cách rất tự tin. Đừng "tối ưu RAM" bằng q8
ở đây. Xem `apps/server/src/model.ts`.

### Độ dày nét khi rasterize

Nét vẽ được thu nhỏ về 28×28 trước khi đưa vào model. Độ dày nét ở kích thước đó **quyết định
accuracy**: 1.5px → 70%, còn 2.5px → 19%. Hằng số đã hiệu chỉnh nằm trong
`apps/server/src/services/raster.ts` — ĐỔI LÀ PHẢI CHẠY LẠI `npm run eval:model`.

### Vì sao không có `packages/shared`?

Rasterizer 28×28 và bảng nhãn **chỉ server dùng** — client gửi toạ độ nét thô, server tự rasterize.
Không có code nào dùng chung, nên gộp vào `apps/server/src/` sẽ tránh được friction của TS project
references mà không mất gì.

---

## Tài liệu thiết kế

Ba tài liệu trong `.hermes/plans/`, chia vai rõ ràng:

| Tài liệu | Vai trò |
|---|---|
| **`2026-09-11_231500-...-v2-inmemory.md`** | **Đặc tả kỹ thuật.** Kiến trúc, chống gian lận, hằng số đã đo, checklist sự kiện, bảng rủi ro. Đọc trước. |
| **`2026-09-12_201457-clubday-split-2-tracks.md`** | **Điều phối công việc.** Chia 2 track song song, bảng phân quyền file, hợp đồng đóng băng, quy trình git. |
| **`2026-09-17_161327-clubday-recruitment-funnel.md`** | **Việc đang làm.** Phễu đăng ký thành viên (Wave 4), màn hình chiếu + bảng xếp hạng toàn sự kiện (Wave 5), nợ load test (Wave 3). Có bảng theo dõi trạng thái. |

> Làm việc nhóm? Đọc file **split-2-tracks** để biết file nào của ai. Bảng phân quyền file ở mục 3
> là thứ quyết định việc 2 người có xung đột hay không.
