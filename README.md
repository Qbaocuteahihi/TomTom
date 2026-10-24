# TOM TOM Attendance — React + Firebase

Web app quản lý chấm công nội bộ: ReactJS/Vite, Firebase Authentication, Cloud Firestore, xuất Excel XLSX.

## 1. Cần cài đặt

- Node.js LTS (khuyến nghị Node 20 trở lên)
- Tài khoản Google/Firebase
- Firebase CLI để deploy: `npm install -g firebase-tools`

## 2. Tạo Firebase project

1. Mở https://console.firebase.google.com/ và tạo project.
2. Vào **Project settings → General → Your apps → Web app**. Đăng ký ứng dụng web và sao chép cấu hình.
3. Vào **Authentication → Get started → Sign-in method**, bật **Email/Password**.
4. Vào **Authentication → Users → Add user**, tự tạo đúng một tài khoản admin bằng email/mật khẩu riêng. Không bật đăng ký công khai trong giao diện này.
5. Trong danh sách Users, sao chép **UID** của tài khoản admin.
6. Vào **Firestore Database → Create database**. Chọn vùng gần người dùng của bạn và chế độ production.
7. Mở file `firestore.rules`, thay `REPLACE_WITH_ADMIN_UID` bằng UID admin vừa sao chép. Không để nguyên placeholder.
8. Vào **Project settings → General → Your apps** và điền các giá trị cấu hình web vào file `.env` ở thư mục gốc, theo mẫu `.env.example`.

Ví dụ `.env` (điền giá trị thật của dự án, không dùng nguyên giá trị ví dụ):

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=ten-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ten-project
VITE_FIREBASE_STORAGE_BUCKET=ten-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Firebase web config không phải mật khẩu quản trị; quyền truy cập dữ liệu được bảo vệ bằng Authentication và Firestore Security Rules. Không đưa service-account private key vào frontend.

## 3. Chạy trên máy tính

Giải nén project, mở terminal tại thư mục `tomtom-attendance`, chạy:

```bash
npm install
npm run dev
```

Mở URL local mà Vite hiển thị (thường là `http://localhost:5173`). Đăng nhập bằng tài khoản admin đã tạo trong Firebase.

## 4. Deploy lên Firebase Hosting

Cài CLI và đăng nhập:

```bash
npm install -g firebase-tools
firebase login
```

Tại thư mục project:

```bash
firebase use --add
```

Chọn đúng Firebase project đã tạo. Sau đó triển khai rules và hosting:

```bash
npm install
npm run build
firebase deploy --only firestore:rules,hosting
```

Firebase CLI sẽ trả về URL Hosting. Mở URL đó trên điện thoại hoặc máy tính và đăng nhập tài khoản admin. Không chia sẻ tài khoản/mật khẩu.

## 5. Cách dùng

1. **Nhân viên:** tạo từng nhân viên và cài mức lương giờ.
2. **Cài đặt lương:** cài thời gian miễn trừ và mức trừ tiền mỗi phút hoặc mức tiền cố định cho một lần đi trễ.
3. **Bảng chấm công:** bấm dấu `+` tại ngày của nhân viên để nhập/sửa giờ vào, giờ ra, phút trễ, phụ cấp, thưởng và ghi chú; chọn OFF nếu nghỉ. Giờ công hiển thị theo 0.1 giờ.
4. **Xuất Excel:** chọn tháng và nhân viên (nếu cần), bấm Xuất Excel. File có sheet chấm công theo ngày và sheet tổng hợp lương.

Quy tắc đi trễ: 0–5 phút không phạt; 6–15 phút trừ 0.3 giờ; 16–30 phút trừ 0.5 giờ; 31–60 phút trừ 0.7 giờ; trên 60 phút trừ 1 giờ. Nếu nhân viên báo trước ít nhất 5 tiếng, quản trị viên tích xác nhận và nhập lý do để miễn trừ.

## 6. Bảo mật quan trọng

- File `firestore.rules` chỉ cho UID admin đọc/ghi. Phải thay placeholder bằng UID thật rồi deploy rules.
- Nếu cần đổi admin, cập nhật UID trong `firestore.rules` và deploy lại.
- Không tạo tài khoản Firebase khác cho người không được phép. Dù họ có thể nhìn thấy trang đăng nhập, Firestore Rules vẫn chặn dữ liệu nếu UID không khớp.
- Không lưu dữ liệu lương thật vào dự án trước khi kiểm tra rules bằng tài khoản admin và một tài khoản không được cấp quyền.
- Không dùng mức phạt đi trễ như một mặc định pháp lý; hãy bảo đảm quy định lương/khấu trừ phù hợp thỏa thuận lao động và quy định áp dụng.

## 7. Giới hạn của phiên bản đầu

- Ca thiếu giờ được báo lỗi, bạn cần bổ sung bằng tay.
- Khi đổi quy tắc lương, các ca cũ không tự tính lại; kiểm tra và lưu lại các ca liên quan trước khi chốt lương.
- Mỗi nhân viên có một bản ghi chấm công/ngày; nếu có nhiều ca trong cùng ngày, phiên bản đầu cần được nâng cấp để hỗ trợ nhiều ca/ngày trước khi dùng cho lịch phức tạp.
