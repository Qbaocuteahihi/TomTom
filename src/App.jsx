import React, { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import {
  Activity,
  BadgeDollarSign,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CircleAlert,
  Clock3,
  Download,
  LogOut,
  Menu,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { auth, db, firebaseConfigured } from "./lib/firebase.js";
import {
  attendanceId,
  dateKey,
  hoursBetween,
  monthDays,
  monthKey,
  money,
  safeId,
  dayLabel,
} from "./lib/helpers.js";
import ShiftAttendance from "./ShiftAttendance.jsx";
const DEFAULT_SETTINGS = {
  allowance: 35000,
  defaultHourlyRate: 30000,
  currency: "VND",
};

const NOTE_OPTIONS = [
  "OFF",
  "Phụ cấp 35k",
  "Bắt đầu làm",
  "Đi trễ",
  "Thưởng",
  "Nghỉ phép",
];
const moneyInput = (n) => String(Number(n || 0));
const latePenaltyHours = (minutes, excused = false) => {
  if (excused || minutes <= 5) return 0;
  if (minutes <= 15) return 0.3;
  if (minutes <= 30) return 0.5;
  if (minutes <= 60) return 0.7;
  return 1;
};

function Login({ onLogin, error, loading }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-mark">TT</div>
        <p className="eyebrow">TOM TOM · INTERNAL</p>
        <h1>Quản lý chấm công</h1>
        <p className="muted">
          Đăng nhập bằng tài khoản quản trị được cấp quyền.
        </p>

        {!firebaseConfigured && (
          <div className="alert warning">
            Chưa cấu hình Firebase. Hãy tạo file <code>.env</code> từ{" "}
            <code>.env.example</code> rồi điền thông tin dự án.
          </div>
        )}

        {error && <div className="alert danger">{error}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onLogin(email.trim(), password);
          }}
          className="stack"
        >
          <label>
            Email quản trị
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </label>

          <label>
            Mật khẩu
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
            />
          </label>

          <button
            className="btn primary full"
            disabled={loading || !firebaseConfigured}
          >
            {loading ? "Đang đăng nhập…" : "Đăng nhập"}
            <ShieldCheck size={17} />
          </button>
        </form>

        <p className="tiny muted center">
          Dữ liệu chỉ hiển thị khi tài khoản được cho phép trong Firestore
          Rules.
        </p>
      </div>
    </main>
  );
}

const SCHEDULE_SHIFTS = [
  { id: "ca1", name: "CA 1", start: "06:00", end: "12:00", color: "#2563eb" },
  { id: "ca2", name: "CA 2", start: "12:00", end: "17:00", color: "#a16207" },
  { id: "ca3", name: "CA 3", start: "17:00", end: "22:00", color: "#7e22ce" },
];

const CLEANING_TASKS = [
  { id: "counter", label: "Lau dọn quầy thu ngân, đằng sau máy pha cà phê, setup rổ chỗ mèo thần tài, chữ tom tom, menu", color: "#fff500", text: "#5f5600" },
  { id: "glass", label: "Vệ sinh kệ ly thủy tinh, lau máy ép ly, hộc để ly nhựa, hộc để túi, muỗng, hộp topping", color: "#00ff16", text: "#075c12" },
  { id: "table", label: "Lau bàn ghế bằng nước lau trong phòng lạnh, lau kệ bán snack", color: "#14e6e6", text: "#075b63" },
  { id: "mirror", label: "Lau cửa kính phòng lạnh, gương nhà vệ sinh, lau kệ bánh snack", color: "#ff00e8", text: "#6b005e" },
  { id: "floor", label: "Xếp và lau dọn quầy dụng cụ trà đá", color: "#ff1717", text: "#fff" },
  { id: "cabinet", label: "Xếp tủ đựng trà, tủ bên dưới quầy thu ngân, xếp kho cho gọn gàng", color: "#a000ff", text: "#fff" },
  { id: "sink", label: "Lau kệ inox, lau thùng đá, chà bồn rửa ly", color: "#ff9d00", text: "#603600" },
  { id: "tools", label: "Tẩy cổng dụng cụ, rửa máy pha cà phê", color: "#b8b8b8", text: "#343434" },
];

const startOfWeek = (value) => {
  const date = new Date(`${value}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return dateKey(date);
};

const shiftDate = (value, amount) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
};

const weekdayLabel = (value) => {
  const day = new Date(`${value}T12:00:00`).getDay();
  return ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][day];
};

const getContrastColor = (hex) => {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return red * 299 + green * 587 + blue * 114 > 150000 ? "#333" : "#fff";
};

function Schedule({ db, employees, onNotice }) {
  const [week, setWeek] = useState(startOfWeek(dateKey()));
  const [assignments, setAssignments] = useState([]);
  const [cleaningAssignments, setCleaningAssignments] = useState([]);
  const [cleaningTasks, setCleaningTasks] = useState(CLEANING_TASKS);
  const [taskForm, setTaskForm] = useState({ label: "", color: "#fff500" });
  const [editingTask, setEditingTask] = useState(null);
  const [saving, setSaving] = useState("");
  const days = Array.from({ length: 7 }, (_, index) =>
    shiftDate(week, index),
  );
  const activeEmployees = employees.filter((employee) => employee.active !== false);

  useEffect(() => {
    if (!db || !week) return;

    return onSnapshot(
      query(collection(db, "workSchedules"), where("weekStart", "==", week)),
      (snapshot) =>
        setAssignments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => onNotice?.(`Không tải được lịch làm việc: ${error.message}`),
    );
  }, [db, onNotice, week]);

  useEffect(() => {
    if (!db) return;

    return onSnapshot(
      collection(db, "cleaningTaskDefinitions"),
      async (snapshot) => {
        if (snapshot.empty) {
          try {
            await Promise.all(
              CLEANING_TASKS.map((task) =>
                setDoc(doc(db, "cleaningTaskDefinitions", task.id), task),
              ),
            );
          } catch (error) {
            onNotice?.(`Không khởi tạo được danh mục vệ sinh: ${error.message}`);
          }
          return;
        }

        setCleaningTasks(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (a.label || "").localeCompare(b.label || "", "vi")),
        );
      },
      (error) => onNotice?.(`Không tải được danh mục vệ sinh: ${error.message}`),
    );
  }, [db, onNotice]);

  useEffect(() => {
    if (!db || !week) return;

    return onSnapshot(
      query(collection(db, "cleaningSchedules"), where("weekStart", "==", week)),
      (snapshot) =>
        setCleaningAssignments(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        ),
      (error) => onNotice?.(`Không tải được lịch vệ sinh: ${error.message}`),
    );
  }, [db, onNotice, week]);

  const rowsFor = (date, shiftId) =>
    assignments.filter((item) => item.date === date && item.shiftId === shiftId);
  const cleaningFor = (date, shiftId) =>
    cleaningAssignments.find(
      (item) => item.date === date && item.shiftId === shiftId,
    );

  const addToSchedule = async (date, shift, employeeId) => {
    if (!employeeId || !db) return;
    const employee = activeEmployees.find((item) => item.id === employeeId);
    if (!employee) return;

    const savingKey = `${date}|${shift.id}|${employeeId}`;
    setSaving(savingKey);

    try {
      const sameDay = assignments.filter(
        (item) => item.date === date && item.employeeId === employeeId,
      );
      if (sameDay.some((item) => item.shiftId === shift.id)) {
        onNotice?.(`${employee.name} đã có lịch ở ${shift.name} trong ngày này.`);
        return;
      }
      if (sameDay.length >= 2) {
        onNotice?.(`${employee.name} chỉ được xếp tối đa 2 ca trong một ngày.`);
        return;
      }

      const id = `${date}_${shift.id}_${employeeId}`.replaceAll("/", "_");
      await setDoc(doc(db, "workSchedules", id), {
        date,
        weekStart: week,
        shiftId: shift.id,
        shiftName: shift.name,
        start: shift.start,
        end: shift.end,
        employeeId,
        employeeName: employee.name,
        updatedAt: new Date().toISOString(),
      });
      onNotice?.(`Đã xếp ${employee.name} vào ${shift.name}.`);
    } catch (error) {
      onNotice?.(`Không lưu được lịch: ${error.message}`);
    } finally {
      setSaving("");
    }
  };

  const removeFromSchedule = async (assignment) => {
    try {
      await deleteDoc(doc(db, "workSchedules", assignment.id));
      onNotice?.(`Đã bỏ ${assignment.employeeName} khỏi lịch.`);
    } catch (error) {
      onNotice?.(`Không thể bỏ lịch: ${error.message}`);
    }
  };

  const saveCleaning = async (date, shift, taskId) => {
    if (!db || !taskId) return;
    const task = cleaningTasks.find((item) => item.id === taskId);
    if (!task) return;

    try {
      const id = `${date}_${shift.id}`.replaceAll("/", "_");
      await setDoc(doc(db, "cleaningSchedules", id), {
        date,
        weekStart: week,
        shiftId: shift.id,
        shiftName: shift.name,
        taskId: task.id,
        taskLabel: task.label,
        color: task.color,
        updatedAt: new Date().toISOString(),
      });
      onNotice?.(`Đã thêm lịch vệ sinh cho ${shift.name}.`);
    } catch (error) {
      onNotice?.(`Không lưu được lịch vệ sinh: ${error.message}`);
    }
  };

  const saveCleaningTask = async (event) => {
    event.preventDefault();
    const label = taskForm.label.trim();
    if (!db || !label) return;

    const id =
      editingTask ||
      `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    const color = taskForm.color || "#fff500";

    try {
      await setDoc(doc(db, "cleaningTaskDefinitions", id), {
        id,
        label,
        color,
        text: getContrastColor(color),
        updatedAt: new Date().toISOString(),
      });
      if (editingTask) {
        const schedules = await getDocs(
          query(
            collection(db, "cleaningSchedules"),
            where("taskId", "==", editingTask),
          ),
        );
        await Promise.all(
          schedules.docs.map((schedule) =>
            setDoc(
              doc(db, "cleaningSchedules", schedule.id),
              { taskLabel: label, color },
              { merge: true },
            ),
          ),
        );
      }
      setTaskForm({ label: "", color: "#fff500" });
      setEditingTask(null);
      onNotice?.("Đã lưu công việc vệ sinh.");
    } catch (error) {
      onNotice?.(`Không lưu được công việc vệ sinh: ${error.message}`);
    }
  };

  const editCleaningTask = (task) => {
    setEditingTask(task.id);
    setTaskForm({ label: task.label, color: task.color });
  };

  const removeCleaningTask = async (task) => {
    if (!window.confirm(`Xóa công việc "${task.label}" khỏi danh mục?`)) return;

    try {
      await deleteDoc(doc(db, "cleaningTaskDefinitions", task.id));
      onNotice?.("Đã xóa công việc vệ sinh khỏi danh mục.");
    } catch (error) {
      onNotice?.(`Không thể xóa công việc vệ sinh: ${error.message}`);
    }
  };

  const removeCleaning = async (cleaning) => {
    try {
      await deleteDoc(doc(db, "cleaningSchedules", cleaning.id));
      onNotice?.("Đã bỏ lịch vệ sinh.");
    } catch (error) {
      onNotice?.(`Không thể bỏ lịch vệ sinh: ${error.message}`);
    }
  };

  return (
    <section className="page-content schedule-page">
      <div className="section-toolbar">
        <div>
          <h2>Xếp lịch nhân viên</h2>
          <p className="muted">
            Lịch làm việc theo tuần, chỉ dùng để sắp xếp và không tự động tính lương.
          </p>
        </div>
        <div className="schedule-week-controls">
          <button
            className="icon-button"
            onClick={() => setWeek(shiftDate(week, -7))}
            aria-label="Tuần trước"
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            value={week}
            onChange={(event) => setWeek(startOfWeek(event.target.value))}
            aria-label="Chọn tuần"
          />
          <button
            className="icon-button"
            onClick={() => setWeek(shiftDate(week, 7))}
            aria-label="Tuần sau"
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="btn secondary"
            onClick={() => setWeek(startOfWeek(dateKey()))}
            disabled={week === startOfWeek(dateKey())}
          >
            Tuần này
          </button>
        </div>
      </div>

      <div className="schedule-hint">
        Chọn nhân viên trong từng ô để xếp lịch. Mỗi nhân viên được xếp tối đa
        2 ca trong một ngày; các ca đã xếp trước đó vẫn được giữ lại.
      </div>

      <div className="panel schedule-panel">
        <div className="table-wrap schedule-table-wrap">
          <table className="schedule-table">
            <thead>
              <tr>
                <th className="schedule-shift-col">CA / GIỜ</th>
                {days.map((day) => (
                  <th key={day}>
                    <strong className="schedule-weekday">
                      {weekdayLabel(day)}
                    </strong>
                    <small>{dayLabel(day)}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCHEDULE_SHIFTS.map((shift) => (
                <tr key={shift.id}>
                  <th
                    className="schedule-shift-col"
                    style={{ borderLeftColor: shift.color }}
                  >
                    <b>{shift.name}</b>
                    <small>
                      {shift.start} – {shift.end}
                    </small>
                  </th>
                  {days.map((day) => {
                    const rows = rowsFor(day, shift.id);
                    const cleaning = cleaningFor(day, shift.id);
                    return (
                      <td
                        key={day}
                        className={cleaning ? "has-cleaning" : ""}
                        style={
                          cleaning
                            ? {
                                "--cleaning-color": cleaning.color,
                              }
                            : undefined
                        }
                      >
                        <div className="schedule-cell">
                          {rows.map((assignment) => (
                            <div className="schedule-person" key={assignment.id}>
                              <span>{assignment.employeeName}</span>
                              <button
                                type="button"
                                onClick={() => removeFromSchedule(assignment)}
                                aria-label={`Bỏ ${assignment.employeeName}`}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                          <select
                            value=""
                            disabled={Boolean(saving)}
                            onChange={(event) =>
                              addToSchedule(day, shift, event.target.value)
                            }
                            aria-label={`Xếp nhân viên ${shift.name} ngày ${day}`}
                          >
                            <option value="">+ Xếp nhân viên</option>
                            {activeEmployees.map((employee) => (
                              <option key={employee.id} value={employee.id}>
                                {employee.name}
                              </option>
                            ))}
                          </select>
                          {cleaning ? (
                            <div
                              className="cleaning-task"
                              style={{
                                backgroundColor: cleaning.color,
                                color:
                                    cleaningTasks.find(
                                    (task) => task.id === cleaning.taskId,
                                  )?.text || "#333",
                              }}
                              title={cleaning.taskLabel}
                            >
                              <span>
                                Vệ sinh:{" "}
                                {cleaningTasks.find(
                                  (task) => task.id === cleaning.taskId,
                                )?.label || cleaning.taskLabel}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeCleaning(cleaning)}
                                aria-label="Bỏ lịch vệ sinh"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : null}
                          <select
                            value=""
                            disabled={Boolean(saving)}
                            onChange={(event) =>
                              saveCleaning(day, shift, event.target.value)
                            }
                            aria-label={`Thêm lịch vệ sinh ${shift.name} ngày ${day}`}
                            className="cleaning-select"
                          >
                            <option value="">+ Lịch vệ sinh</option>
                            {cleaningTasks.map((task) => (
                              <option key={task.id} value={task.id}>
                                {task.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel cleaning-legend">
        <div className="panel-heading">
          <div>
            <h3>Lịch vệ sinh</h3>
            <p className="muted">
              Chọn công việc trong từng ô ca/ngày. Ô có lịch sẽ được tô màu nổi bật.
            </p>
          </div>
        </div>
        <div className="cleaning-legend-grid">
          {cleaningTasks.map((task) => (
            <div
              className="cleaning-legend-item"
              key={task.id}
              style={{ backgroundColor: task.color, color: task.text }}
            >
              <span />
              {task.label}
            </div>
          ))}
        </div>
      </div>

      <div className="panel cleaning-editor">
        <div className="panel-heading">
          <div>
            <h3>Quản lý công việc vệ sinh</h3>
            <p className="muted">
              Admin có thể thêm, sửa tên và đổi màu công việc bất cứ lúc nào.
            </p>
          </div>
        </div>
        <form className="cleaning-task-form" onSubmit={saveCleaningTask}>
          <input
            value={taskForm.label}
            onChange={(event) =>
              setTaskForm((prev) => ({ ...prev, label: event.target.value }))
            }
            placeholder="Tên công việc vệ sinh"
            required
          />
          <input
            type="color"
            value={taskForm.color}
            onChange={(event) =>
              setTaskForm((prev) => ({ ...prev, color: event.target.value }))
            }
            aria-label="Màu công việc vệ sinh"
          />
          <button className="btn primary" type="submit">
            {editingTask ? "Lưu chỉnh sửa" : "Thêm công việc"}
            <Save size={15} />
          </button>
          {editingTask && (
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setEditingTask(null);
                setTaskForm({ label: "", color: "#fff500" });
              }}
            >
              Hủy
            </button>
          )}
        </form>
        <div className="cleaning-admin-list">
          {cleaningTasks.map((task) => (
            <div className="cleaning-admin-item" key={task.id}>
              <span className="cleaning-color-dot" style={{ background: task.color }} />
              <span>{task.label}</span>
              <button className="btn small secondary" type="button" onClick={() => editCleaningTask(task)}>
                Sửa
              </button>
              <button className="icon-button danger-button" type="button" onClick={() => removeCleaningTask(task)} aria-label={`Xóa ${task.label}`}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [payrollAdjustments, setPayrollAdjustments] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [month, setMonth] = useState(monthKey());

  const [tab, setTab] = useState("overview");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const [employeeForm, setEmployeeForm] = useState({
    name: "",
    hourlyRate: "30000",
    startDate: dateKey(),
    allowance: "0",
    active: true,
  });

  const [editingEmployee, setEditingEmployee] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [payrollEmployeeFilter, setPayrollEmployeeFilter] = useState("all");

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }

    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user || !db) {
      setEmployees([]);
      setAttendance([]);
      setPayrollAdjustments([]);
      return;
    }

    const unsubs = [];

    unsubs.push(
      onSnapshot(
        collection(db, "employees"),
        (snap) =>
          setEmployees(
            snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi")),
          ),
        (err) => setNotice(`Không đọc được nhân viên: ${err.message}`),
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, "attendance"),
        (snap) =>
          setAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => setNotice(`Không đọc được chấm công: ${err.message}`),
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, "payrollAdjustments"),
        (snap) =>
          setPayrollAdjustments(
            snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          ),
        (err) => setNotice(`Không đọc được điều chỉnh lương: ${err.message}`),
      ),
    );

    unsubs.push(
      onSnapshot(
        doc(db, "settings", "payroll"),
        (snap) =>
          setSettings(
            snap.exists()
              ? { ...DEFAULT_SETTINGS, ...snap.data() }
              : DEFAULT_SETTINGS,
          ),
        (err) => setNotice(`Không đọc được cài đặt: ${err.message}`),
      ),
    );

    return () => unsubs.forEach((fn) => fn());
  }, [user]);

  const signIn = async (email, password) => {
    setAuthLoading(true);
    setAuthError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setAuthError(
        e.code === "auth/invalid-credential"
          ? "Email hoặc mật khẩu không đúng."
          : e.message,
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    if (auth) await signOut(auth);
  };

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 5000);
  };

  const monthAttendance = useMemo(
    () => attendance.filter((a) => (a.date || "").startsWith(month)),
    [attendance, month],
  );

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active !== false),
    [employees],
  );

  const attendanceByKey = useMemo(
    () => new Map(attendance.map((a) => [`${a.employeeId}|${a.date}`, a])),
    [attendance],
  );

  const payrollAdjustmentsByKey = useMemo(
    () =>
      new Map(
        payrollAdjustments.map((adjustment) => [
          `${adjustment.employeeId}|${adjustment.month}`,
          adjustment,
        ]),
      ),
    [payrollAdjustments],
  );

  const totals = useMemo(() => {
    let hours = 0;
    let pay = 0;
    let late = 0;
    let allowance = 0;
    let bonus = 0;

    for (const a of monthAttendance) {
      hours += Number(a.hours || 0);
      pay += Number(a.basePay || 0);
      late += Number(a.lateDeduction || 0);
      allowance += Number(a.allowance || 0);
      bonus += Number(a.bonus || 0);
    }

    for (const employee of activeEmployees) {
      const adjustment = payrollAdjustmentsByKey.get(`${employee.id}|${month}`);
      late += Number(adjustment?.deduction || 0);
      allowance += Number(adjustment?.allowance || 0);
      bonus += Number(adjustment?.bonus || 0);
    }

    const autoTotal = pay - late + allowance + bonus;
    const manualTotalDelta = activeEmployees.reduce((sum, employee) => {
      const adjustment = payrollAdjustmentsByKey.get(
        `${employee.id}|${month}`,
      );
      const hasManualTotal =
        adjustment?.manualNetPay !== undefined &&
        adjustment?.manualNetPay !== null &&
        adjustment?.manualNetPay !== "";

      if (!hasManualTotal) return sum;

      const rows = monthAttendance.filter(
        (attendanceRecord) => attendanceRecord.employeeId === employee.id,
      );
      const autoEmployeeTotal =
        rows.reduce((value, record) => value + Number(record.basePay || 0), 0) -
        rows.reduce(
          (value, record) => value + Number(record.lateDeduction || 0),
          0,
        ) -
        Number(adjustment?.deduction || 0) +
        rows.reduce((value, record) => value + Number(record.allowance || 0), 0) +
        Number(adjustment?.allowance || 0) +
        rows.reduce((value, record) => value + Number(record.bonus || 0), 0) +
        Number(adjustment?.bonus || 0);

      return sum + Number(adjustment.manualNetPay) - autoEmployeeTotal;
    }, 0);

    return {
      hours,
      pay,
      late,
      allowance,
      bonus,
      total: autoTotal + manualTotalDelta,
    };
  }, [activeEmployees, month, monthAttendance, payrollAdjustmentsByKey]);

  const employeeTotals = (employeeId) => {
    const rows = monthAttendance.filter((a) => a.employeeId === employeeId);
    const adjustment = payrollAdjustmentsByKey.get(`${employeeId}|${month}`);

    const hours = rows.reduce((s, a) => s + Number(a.hours || 0), 0);
    const base = rows.reduce((s, a) => s + Number(a.basePay || 0), 0);
    const fine =
      rows.reduce((s, a) => s + Number(a.lateDeduction || 0), 0) +
      Number(adjustment?.deduction || 0);
    const allowance =
      rows.reduce((s, a) => s + Number(a.allowance || 0), 0) +
      Number(adjustment?.allowance || 0);
    const bonus =
      rows.reduce((s, a) => s + Number(a.bonus || 0), 0) +
      Number(adjustment?.bonus || 0);
    const payableHours = Math.max(
      0,
      hours - rows.reduce((s, a) => s + Number(a.penaltyHours || 0), 0),
    );

    const autoTotal = base - fine + allowance + bonus;
    const hasManualTotal =
      adjustment?.manualNetPay !== undefined &&
      adjustment?.manualNetPay !== null &&
      adjustment?.manualNetPay !== "";

    return {
      hours,
      payableHours,
      base,
      fine,
      allowance,
      bonus,
      autoTotal,
      manualNetPay: hasManualTotal ? Number(adjustment.manualNetPay) : null,
      total: hasManualTotal ? Number(adjustment.manualNetPay) : autoTotal,
      days: rows.filter((a) => Number(a.hours || 0) > 0).length,
    };
  };

  const calculatePay = (record, employee) => {
    const hours = hoursBetween(record.checkIn, record.checkOut);
    const rate = Number(employee?.hourlyRate ?? settings.defaultHourlyRate);
    // BỎ điều kiện checkIn — chỉ cần lateMinutes > 0 là tính
    const lateMinutes = Math.max(0, Number(record.lateMinutes || 0));
    const penaltyHours = latePenaltyHours(lateMinutes, record.lateExcused);

    return {
      ...record,
      hours: Number(hours.toFixed(1)),
      penaltyHours,
      hourlyRate: rate,
      basePay: Math.round(hours * rate),
      lateMinutes,
      lateDeduction: Math.round(penaltyHours * rate),
      allowance: Number(record.allowance || 0),
      bonus: Number(record.bonus || 0),
    };
  };

  const saveAttendance = async (record) => {
    if (!db) throw new Error("Firebase chưa được cấu hình.");

    const employee = employees.find((e) => e.id === record.employeeId);
    const calculated = calculatePay(record, employee);
    const id = attendanceId(record.employeeId, record.date);

    await setDoc(
      doc(db, "attendance", id),
      {
        ...calculated,
        id,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  };

  const savePayrollAdjustment = async (employeeId, field, value) => {
    if (!db) {
      showNotice("Firebase chưa được cấu hình.");
      return;
    }

    const id = `${month}_${employeeId}`;
    const current = payrollAdjustmentsByKey.get(`${employeeId}|${month}`) || {};

    try {
      await setDoc(
        doc(db, "payrollAdjustments", id),
        {
          ...current,
          id,
          employeeId,
          month,
          [field]:
            field === "manualNetPay" && String(value).trim() === ""
              ? null
              : Math.max(0, Number(value || 0)),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (e) {
      showNotice(`Không lưu được điều chỉnh lương: ${e.message}`);
    }
  };

  const saveEmployee = async (e) => {
    e.preventDefault();
    if (!db) return;

    const name = employeeForm.name.trim();
    if (!name) return;

    setBusy(true);

    try {
      const data = {
        name,
        hourlyRate: Number(
          employeeForm.hourlyRate || settings.defaultHourlyRate,
        ),
        startDate: employeeForm.startDate || dateKey(),
        allowance: Number(employeeForm.allowance || 0),
        active: employeeForm.active !== false,
        updatedAt: new Date().toISOString(),
      };

      const removeEmployee = async (employee) => {
        if (
          !window.confirm(
            `Xóa nhân viên "${employee.name}"? Toàn bộ dữ liệu chấm công và phân ca của nhân viên này cũng sẽ bị xóa.`,
          )
        ) {
          return;
        }

        if (!db) return;
        setBusy(true);

        try {
          const attendanceSnap = await getDocs(
            query(
              collection(db, "attendance"),
              where("employeeId", "==", employee.id),
            ),
          );
          const shiftSnap = await getDocs(
            query(
              collection(db, "shiftAttendance"),
              where("employeeId", "==", employee.id),
            ),
          );
          const scheduleSnap = await getDocs(
            query(
              collection(db, "workSchedules"),
              where("employeeId", "==", employee.id),
            ),
          );

          await Promise.all([
            ...attendanceSnap.docs.map((record) =>
              deleteDoc(doc(db, "attendance", record.id)),
            ),
            ...shiftSnap.docs.map((record) =>
              deleteDoc(doc(db, "shiftAttendance", record.id)),
            ),
            ...scheduleSnap.docs.map((record) =>
              deleteDoc(doc(db, "workSchedules", record.id)),
            ),
            deleteDoc(doc(db, "employees", employee.id)),
          ]);

          if (selectedEmployee === employee.id) setSelectedEmployee("all");
          if (payrollEmployeeFilter === employee.id) {
            setPayrollEmployeeFilter("all");
          }
          if (editingEmployee === employee.id) {
            setEditingEmployee(null);
          }
          showNotice(`Đã xóa nhân viên ${employee.name}.`);
        } catch (err) {
          showNotice(`Không thể xóa nhân viên: ${err.message}`);
        } finally {
          setBusy(false);
        }
      };

      if (editingEmployee) {
        await setDoc(doc(db, "employees", editingEmployee), data, {
          merge: true,
        });
      } else {
        await addDoc(collection(db, "employees"), {
          ...data,
          createdAt: new Date().toISOString(),
        });
      }

      setEmployeeForm({
        name: "",
        hourlyRate: String(settings.defaultHourlyRate),
        startDate: dateKey(),
        allowance: "0",
        active: true,
      });

      setEditingEmployee(null);
      showNotice("Đã lưu nhân viên.");
    } catch (err) {
      showNotice(`Không lưu được: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const editEmployee = (e) => {
    setEditingEmployee(e.id);

    setEmployeeForm({
      name: e.name || "",
      hourlyRate: String(e.hourlyRate ?? settings.defaultHourlyRate),
      startDate: e.startDate || dateKey(),
      allowance: String(e.allowance || 0),
      active: e.active !== false,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveSettings = async (e) => {
    e.preventDefault();

    try {
      await setDoc(
        doc(db, "settings", "payroll"),
        {
          ...settings,
          allowance: Number(settings.allowance || 0),
          defaultHourlyRate: Number(settings.defaultHourlyRate || 0),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      showNotice(
        "Đã lưu cài đặt lương. Các ca đã lưu trước đó không tự tính lại; hãy mở và lưu lại ca nếu cần áp dụng quy tắc mới.",
      );
    } catch (e) {
      showNotice(`Không lưu được cài đặt: ${e.message}`);
    }
  };

  const exportExcel = () => {
    const days = monthDays(month);
    const rows = [];

    for (const employee of employees) {
      if (selectedEmployee !== "all" && employee.id !== selectedEmployee)
        continue;

      const total = employeeTotals(employee.id);

      const row = {
        "Nhân viên": employee.name,
        "Lương/giờ": Number(employee.hourlyRate || settings.defaultHourlyRate),
      };

      for (const day of days) {
        const a = attendanceByKey.get(`${employee.id}|${day}`);
        row[dayLabel(day)] = a
          ? a.status === "off"
            ? "OFF"
            : Number(a.hours || 0)
          : "";
      }

      row["Tổng giờ công"] = Number(total.hours.toFixed(1));
      row["Lương theo giờ"] = total.base;
      row["Trừ đi trễ"] = total.fine;
      row["Phụ cấp"] = total.allowance;
      row["Thưởng"] = total.bonus;
      row["Tổng lương"] = total.total;

      row["Ghi chú"] = monthAttendance
        .filter(
          (a) => a.employeeId === employee.id && (a.notes || a.lateReason),
        )
        .map(
          (a) =>
            `${dayLabel(a.date)}: ${[a.notes, a.lateReason].filter(Boolean).join(" · ")}`,
        )
        .join(" | ");

      row["Chi tiết đi trễ"] = monthAttendance
        .filter(
          (a) => a.employeeId === employee.id && Number(a.lateMinutes || 0) > 0,
        )
        .map(
          (a) =>
            `${dayLabel(a.date)}: ${a.lateExcused ? "Đã báo trước" : `trễ ${a.lateMinutes}p, trừ ${a.penaltyHours || 0.0} giờ`}`,
        )
        .join(" | ");

      rows.push(row);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = Object.keys(rows[0] || { "Nhân viên": "" }).map((k) => ({
      wch: Math.min(24, Math.max(12, k.length + 3)),
    }));

    XLSX.utils.book_append_sheet(wb, ws, "Bang cham cong");

    const summary = employees
      .filter((e) => selectedEmployee === "all" || e.id === selectedEmployee)
      .map((e) => {
        const t = employeeTotals(e.id);

        return {
          "Nhân viên": e.name,
          "Số ngày có công": t.days,
          "Tổng giờ": Number(t.hours.toFixed(1)),
          "Lương gốc": t.base,
          "Tiền trừ": t.fine,
          "Phụ cấp": t.allowance,
          Thưởng: t.bonus,
          "Thực nhận": t.total,
        };
      });

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summary),
      "Tong hop luong",
    );

    XLSX.writeFile(wb, `TOMTOM_ChamCong_${month}.xlsx`);
    showNotice("Đã tạo file Excel.");
  };

  const updateAttendanceField = async (record, field, value) => {
    const employee = employees.find((e) => e.id === record.employeeId);
    let next = { ...record, [field]: value };

    if (
      [
        "checkIn",
        "checkOut",
        "lateMinutes",
        "lateExcused",
        "allowance",
        "bonus",
      ].includes(field)
    ) {
      next = calculatePay(next, employee);
    }

    try {
      await setDoc(
        doc(db, "attendance", attendanceId(record.employeeId, record.date)),
        {
          ...next,
          id: attendanceId(record.employeeId, record.date),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (e) {
      showNotice(`Không lưu được chấm công: ${e.message}`);
    }
  };

  const saveAttendanceNote = async (employee, day, record, value) => {
    try {
      await saveAttendance({
        ...(record || {}),
        employeeId: employee.id,
        employeeName: employee.name,
        date: day,
        notes: value.trim(),
        status: record?.status || "present",
      });
    } catch (e) {
      showNotice(`Không lưu được ghi chú: ${e.message}`);
    }
  };

  const markOff = async (employee, day) => {
    const existing = attendanceByKey.get(`${employee.id}|${day}`) || {};

    try {
      await saveAttendance({
        ...existing,
        employeeId: employee.id,
        employeeName: employee.name,
        date: day,
        checkIn: "",
        checkOut: "",
        hours: 0,
        basePay: 0,
        lateDeduction: 0,
        allowance: 0,
        bonus: 0,
        lateMinutes: 0,
        lateExcused: false,
        lateReason: "",
        status: "off",
        notes: existing.notes || "OFF",
      });
    } catch (e) {
      showNotice(e.message);
    }
  };

  useEffect(() => {
    if (!db || !user) return;

    const today = dateKey();
    const missingPastShifts = monthDays(month).flatMap((day) =>
      day >= today
        ? []
        : activeEmployees
            .filter((employee) => !attendanceByKey.has(`${employee.id}|${day}`))
            .map((employee) => ({
              ...employee,
              date: day,
            })),
    );

    if (missingPastShifts.length === 0) return;

    Promise.all(
      missingPastShifts.map((employee) =>
        saveAttendance({
          employeeId: employee.id,
          employeeName: employee.name,
          date: employee.date,
          checkIn: "",
          checkOut: "",
          lateMinutes: 0,
          lateExcused: false,
          lateReason: "",
          allowance: 0,
          bonus: 0,
          status: "off",
          notes: "OFF",
        }),
      ),
    ).catch((error) => {
      showNotice(`Không tự động đánh dấu OFF: ${error.message}`);
    });
  }, [activeEmployees, attendanceByKey, db, month, user]);

  if (!authReady) {
    return <div className="loading-screen">Đang kiểm tra phiên đăng nhập…</div>;
  }

  if (!user) {
    return <Login onLogin={signIn} error={authError} loading={authLoading} />;
  }

  if (!db) {
    return (
      <Login
        onLogin={signIn}
        error="Firebase chưa được cấu hình."
        loading={false}
      />
    );
  }

  const navItems = [
    ["overview", "Tổng quan", Activity],
    ["attendance", "Bảng chấm công", CalendarDays],
    ["shifts", "Phân ca & Chấm công", Clock3],
    ["schedule", "Xếp lịch nhân viên", ClipboardList],
    ["employees", "Nhân viên", Users],
    ["settings", "Cài đặt lương", Settings],
  ];

  const goMonth = (delta) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(monthKey(d));
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small">TT</div>
          <div>
            <b>TOM TOM</b>
            <span>Attendance</span>
          </div>
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileNav(false)}
            aria-label="Đóng menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="nav-label">QUẢN LÝ</div>

        {navItems.map(([id, label, Icon]) => (
          <button
            key={id}
            className={`nav-item ${tab === id ? "active" : ""}`}
            onClick={() => {
              setTab(id);
              setMobileNav(false);
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="admin-pill">
            <div className="avatar">
              {(user.email || "A").slice(0, 1).toUpperCase()}
            </div>
            <div className="admin-text">
              <b>Quản trị viên</b>
              <span>{user.email}</span>
            </div>
          </div>

          <button className="nav-item logout" onClick={logout}>
            <LogOut size={18} />
            <span>Đăng xuất</span>
          </button>

          <p className="tiny muted">Dữ liệu riêng tư · Firebase</p>
        </div>
      </aside>

      {mobileNav && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Đóng menu"
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileNav(true)}
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>

          <div>
            <div className="breadcrumb">
              TOM TOM <span>/</span> {navItems.find((n) => n[0] === tab)?.[1]}
            </div>
            <h1>{navItems.find((n) => n[0] === tab)?.[1]}</h1>
          </div>

          <div className="topbar-actions">
            <div className="month-chip">
              <CalendarDays size={16} />
              <input
                aria-label="Chọn tháng"
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                }}
              />
            </div>

            <button className="btn primary export-btn" onClick={exportExcel}>
              <Download size={16} />
              <span>Xuất Excel</span>
            </button>
          </div>
        </header>

        {notice && (
          <div className="toast" role="status">
            <Check size={17} />
            {notice}
            <button onClick={() => setNotice("")} aria-label="Đóng">
              <X size={15} />
            </button>
          </div>
        )}

        {tab === "overview" && (
          <section className="page-content">
            <div className="welcome-row">
              <div>
                <p className="eyebrow">BẢNG ĐIỀU KHIỂN</p>
                <h2>
                  Xin chào, quản trị viên <span>👋</span>
                </h2>
                <p className="muted">
                  Tình hình chấm công trong tháng{" "}
                  {month.split("-").reverse().join("/")}.
                </p>
              </div>
            </div>

            <div className="stats-grid">
              <Stat
                icon={Clock3}
                label="Tổng giờ công"
                value={`${totals.hours.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} giờ`}
                sub={`${monthAttendance.filter((a) => Number(a.hours) > 0).length} ca có giờ công`}
              />

              <Stat
                icon={Wallet}
                label="Tổng lương dự kiến"
                value={money(totals.total)}
                sub="Sau phụ cấp, thưởng và khấu trừ"
              />

              <Stat
                icon={Users}
                label="Nhân viên đang làm"
                value={activeEmployees.length}
                sub={`${employees.length} nhân viên trong danh sách`}
              />

              <Stat
                icon={BadgeDollarSign}
                label="Tổng tiền đi trễ"
                value={money(totals.late)}
                sub={`Phụ cấp ${money(totals.allowance)}`}
              />
            </div>

            <div className="content-grid">
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Tổng lương theo nhân viên</h3>
                    <p className="muted">Tháng đang chọn</p>
                  </div>
                  <Wallet size={18} className="muted" />
                </div>

                {activeEmployees.length === 0 ? (
                  <Empty
                    icon={Users}
                    title="Chưa có nhân viên"
                    text="Thêm nhân viên để bắt đầu theo dõi."
                    action={() => setTab("employees")}
                    actionText="Thêm nhân viên"
                  />
                ) : (
                  <div className="salary-list">
                    {activeEmployees.slice(0, 6).map((e) => {
                      const t = employeeTotals(e.id);

                      return (
                        <div className="salary-row" key={e.id}>
                          <div className="avatar pale">
                            {e.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="salary-person">
                            <b>{e.name}</b>
                            <span>
                              {t.hours.toFixed(1)} giờ · {t.days} ngày
                            </span>
                          </div>
                          <strong>{money(t.total)}</strong>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="tip-banner">
              <div className="tip-icon">
                <CircleAlert size={19} />
              </div>
              <div>
                <b>Nhắc bạn kiểm tra cuối tháng</b>
                <p>
                  Kiểm tra các ca thiếu giờ vào/ra, ngày OFF, tiền thưởng và phụ
                  cấp trước khi xuất bảng lương.
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => setTab("attendance")}
              >
                Kiểm tra ngay <ChevronRight size={16} />
              </button>
            </div>
          </section>
        )}

        {tab === "attendance" && (
          <section className="page-content">
            <div className="section-toolbar">
              <div>
                <h2>Bảng chấm công</h2>
                <p className="muted">
                  Chọn ô để chỉnh sửa. Thay đổi được lưu lên Firestore.
                </p>
              </div>

              <div className="toolbar-actions">
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                >
                  <option value="all">Tất cả nhân viên</option>
                  {employees.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="month-navigation">
              <button
                className="icon-button"
                onClick={() => goMonth(-1)}
                aria-label="Tháng trước"
              >
                <ChevronLeft size={18} />
              </button>

              <b>
                {new Date(`${month}-01T12:00:00`).toLocaleDateString("vi-VN", {
                  month: "long",
                  year: "numeric",
                })}
              </b>

              <button
                className="icon-button"
                onClick={() => goMonth(1)}
                aria-label="Tháng sau"
              >
                <ChevronRight size={18} />
              </button>

              <span className="muted tiny">{monthDays(month).length} ngày</span>
            </div>

            {employees.filter(
              (e) => selectedEmployee === "all" || e.id === selectedEmployee,
            ).length === 0 ? (
              <Empty
                icon={Users}
                title="Chưa có nhân viên"
                text="Tạo hồ sơ nhân viên trước khi chấm công."
                action={() => setTab("employees")}
                actionText="Thêm nhân viên"
              />
            ) : (
              <div className="panel attendance-panel compact-sheet-only">
                <div className="table-wrap attendance-wrap">
                  <table className="attendance-table">
                    <thead>
                      <tr>
                        <th className="sticky-col">Nhân viên / Ngày</th>

                        {monthDays(month).map((d) => (
                          <th
                            key={d}
                            className={
                              new Date(`${d}T12:00:00`).getDay() === 0
                                ? "weekend"
                                : ""
                            }
                          >
                            {dayLabel(d)}
                            <small>
                              {
                                ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][
                                  new Date(`${d}T12:00:00`).getDay()
                                ]
                              }
                            </small>
                          </th>
                        ))}

                        <th>Giờ công</th>
                        <th>Giờ tính lương</th>
                        <th>Tổng lương</th>
                      </tr>
                    </thead>

                    <tbody>
                      {employees
                        .filter(
                          (e) =>
                            selectedEmployee === "all" ||
                            e.id === selectedEmployee,
                        )
                        .map((e) => {
                          const t = employeeTotals(e.id);

                          return (
                            <tr key={e.id}>
                              <td className="sticky-col employee-sticky">
                                <b>{e.name}</b>
                                <small>
                                  {money(
                                    e.hourlyRate || settings.defaultHourlyRate,
                                  )}
                                  /giờ
                                </small>
                              </td>

                              {monthDays(month).map((day) => {
                                const a = attendanceByKey.get(`${e.id}|${day}`);

                                return (
                                  <td
                                    key={day}
                                    className={
                                      new Date(`${day}T12:00:00`).getDay() === 0
                                        ? "weekend"
                                        : ""
                                    }
                                  >
                                    <DayCell
                                      employee={e}
                                      day={day}
                                      record={a}
                                      onSave={saveAttendance}
                                      onOff={markOff}
                                      settings={settings}
                                    />
                                  </td>
                                );
                              })}

                              <td className="total-cell">
                                <b>{t.hours.toFixed(1)}</b>
                              </td>

                              <td className="total-cell">
                                <b>{t.payableHours.toFixed(1)}</b>
                              </td>

                              <td className="total-cell">
                                <b>{money(t.total)}</b>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                <div className="attendance-footer">
                  <span>
                    <i className="legend-dot green" /> Đã đủ giờ
                  </span>
                  <span>
                    <i className="legend-dot orange" /> Thiếu giờ
                  </span>
                  <span>
                    <i className="legend-dot gray" /> OFF
                  </span>
                  <b>Tổng lương tháng: {money(totals.total)}</b>
                </div>
              </div>
            )}

            <div className="panel monthly-payroll-panel payroll-summary-panel">
              <div className="panel-heading">
                <div>
                  <h3>Tổng hợp lương tháng</h3>
                  <p className="muted">
                    Tổng hợp nhanh theo nhân viên; các khoản điều chỉnh có thể
                    sửa trực tiếp.
                  </p>
                </div>
              </div>

              <div className="table-wrap">
                <table className="monthly-payroll-table payroll-summary-table">
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Ngày công</th>
                      <th>Giờ công</th>
                      <th>Giờ tính lương</th>
                      <th>Trừ đi trễ</th>
                      <th>Trừ thêm</th>
                      <th>Phụ cấp</th>
                      <th>Thưởng</th>
                      <th>Tổng lương</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees
                      .filter(
                        (employee) =>
                          payrollEmployeeFilter === "all" ||
                          employee.id === payrollEmployeeFilter,
                      )
                      .map((employee) => {
                        const total = employeeTotals(employee.id);
                        const adjustment =
                          payrollAdjustmentsByKey.get(
                            `${employee.id}|${month}`,
                          ) || {};

                        return (
                          <tr key={`summary-${employee.id}`}>
                            <td><b>{employee.name}</b></td>
                            <td>{total.days}</td>
                            <td>{total.hours.toFixed(2)}</td>
                            <td>{total.payableHours.toFixed(2)}</td>
                            <td>{money(total.fine - Number(adjustment.deduction || 0))}</td>
                            <td>{adjustment.deduction ? money(adjustment.deduction) : "—"}</td>
                            <td>{adjustment.allowance ? money(adjustment.allowance) : "—"}</td>
                            <td>{adjustment.bonus ? money(adjustment.bonus) : "—"}</td>
                            <td><b className="payroll-total">{money(total.total)}</b></td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel monthly-payroll-panel payslip-panel">
              <div className="panel-heading">
                <div>
                  <h3>Tổng hợp lương tháng</h3>
                  <p className="muted">
                    Bảng gồm tổng tháng và chi tiết từng ngày. Bấm vào phụ cấp,
                    thưởng, trừ thêm hoặc thực nhận nhập tay để chỉnh sửa.
                  </p>
                </div>
                <div className="payroll-filter">
                  <label htmlFor="payroll-employee-filter">Nhân viên</label>
                  <select
                    id="payroll-employee-filter"
                    value={payrollEmployeeFilter}
                    onChange={(e) => setPayrollEmployeeFilter(e.target.value)}
                  >
                    <option value="all">Tất cả nhân viên</option>
                    {employees.map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="table-wrap">
                <table className="monthly-payroll-table">
                  <thead>
                    <tr>
                      <th>Ngày</th>
                      <th>Giờ công</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees
                      .filter(
                        (employee) =>
                          payrollEmployeeFilter === "all" ||
                          employee.id === payrollEmployeeFilter,
                      )
                      .map((employee) => {
                        const total = employeeTotals(employee.id);
                        const adjustment =
                          payrollAdjustmentsByKey.get(
                            `${employee.id}|${month}`,
                          ) || {};

                        const employeeRows = monthDays(month).map((day) => ({
                          day,
                          attendance: attendanceByKey.get(`${employee.id}|${day}`),
                        }));

                        return (
                          <React.Fragment key={employee.id}>
                            <tr className="payslip-title-row">
                              <td colSpan="3">
                                <b>LƯƠNG THÁNG {month.split("-")[1]}</b>
                                <span>{employee.name}</span>
                              </td>
                            </tr>
                            <tr className="payslip-info-row">
                              <td><b>Lương theo giờ</b></td>
                              <td><b>{money(employee.hourlyRate || settings.defaultHourlyRate)}</b></td>
                              <td>Ghi chú</td>
                            </tr>
                            <tr className="payslip-info-row">
                              <td><b>Lương chính thức</b></td>
                              <td><b>{money(total.autoTotal)}</b></td>
                              <td />
                            </tr>
                            {employeeRows.map(({ day, attendance: a }) => (
                              <tr key={`${employee.id}-${day}`}>
                                <td><b>{dayLabel(day)}</b></td>
                                <td>
                                  {a?.status === "off"
                                    ? ""
                                    : a
                                      ? Number(a.hours || 0).toFixed(2)
                                      : "—"}
                                </td>
                                <td className="monthly-note payslip-note">
                                  <PayslipNoteCell
                                    value={a?.notes || ""}
                                    onSave={(value) =>
                                      saveAttendanceNote(employee, day, a, value)
                                    }
                                  />
                                </td>
                              </tr>
                            ))}
                            <tr className="payslip-total-row">
                              <td><b>Tổng giờ công</b></td>
                              <td><b>{total.hours.toFixed(2)}</b></td>
                              <td />
                            </tr>
                            <tr className="payslip-total-row">
                              <td><b>Thành tiền</b></td>
                              <td><b>{money(total.base)}</b></td>
                              <td />
                            </tr>
                            <tr className="payslip-total-row">
                              <td><b>Tiền phạt</b></td>
                              <td>
                                <PayrollEditCell
                                  value={adjustment.deduction}
                                  placeholder={money(total.fine)}
                                  onSave={(value) =>
                                    savePayrollAdjustment(employee.id, "deduction", value)
                                  }
                                />
                              </td>
                              <td />
                            </tr>
                            <tr className="payslip-total-row">
                              <td><b>Phụ cấp / thưởng</b></td>
                              <td>
                                <PayrollEditCell
                                  value={adjustment.allowance}
                                  placeholder="0"
                                  onSave={(value) =>
                                    savePayrollAdjustment(employee.id, "allowance", value)
                                  }
                                />
                              </td>
                              <td />
                            </tr>
                            <tr className="payslip-grand-total-row">
                              <td><b>Tổng lương</b></td>
                              <td>
                                <PayrollEditCell
                                  value={total.manualNetPay}
                                  placeholder={money(total.autoTotal)}
                                  onSave={(value) =>
                                    savePayrollAdjustment(employee.id, "manualNetPay", value)
                                  }
                                />
                              </td>
                              <td>Nhập tay để thay số tự động</td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    {employees.filter(
                      (employee) =>
                        payrollEmployeeFilter === "all" ||
                        employee.id === payrollEmployeeFilter,
                    ).length === 0 && (
                      <tr>
                        <td colSpan="3" className="empty-table-cell">
                          Chưa có nhân viên phù hợp.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {tab === "shifts" && (
          <ShiftAttendance
            db={db}
            employees={activeEmployees}
            settings={settings}
            onNotice={showNotice}
          />
        )}
        {tab === "schedule" && (
          <Schedule db={db} employees={employees} onNotice={showNotice} />
        )}
        {tab === "employees" && (
          <section className="page-content">
            <div className="section-toolbar">
              <div>
                <h2>Quản lý nhân viên</h2>
                <p className="muted">
                  Mức lương theo giờ được dùng để tính lương tự động.
                </p>
              </div>
              <div className="tag">
                <Users size={15} />
                {employees.length} nhân viên
              </div>
            </div>

            <div className="employee-layout">
              <div className="panel form-panel">
                <div className="panel-heading">
                  <h3>
                    {editingEmployee
                      ? "Chỉnh sửa nhân viên"
                      : "Thêm nhân viên mới"}
                  </h3>

                  {editingEmployee && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setEditingEmployee(null);
                        setEmployeeForm({
                          name: "",
                          hourlyRate: String(settings.defaultHourlyRate),
                          startDate: dateKey(),
                          allowance: "0",
                          active: true,
                        });
                      }}
                    >
                      Hủy sửa
                    </button>
                  )}
                </div>

                <form className="stack" onSubmit={saveEmployee}>
                  <label>
                    Họ tên nhân viên
                    <input
                      required
                      value={employeeForm.name}
                      onChange={(e) =>
                        setEmployeeForm({
                          ...employeeForm,
                          name: e.target.value,
                        })
                      }
                      placeholder="Ví dụ: Bảo"
                    />
                  </label>

                  <label>
                    Lương theo giờ (VNĐ)
                    <input
                      type="number"
                      min="0"
                      required
                      value={employeeForm.hourlyRate}
                      onChange={(e) =>
                        setEmployeeForm({
                          ...employeeForm,
                          hourlyRate: e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Ngày bắt đầu làm
                    <input
                      type="date"
                      value={employeeForm.startDate}
                      onChange={(e) =>
                        setEmployeeForm({
                          ...employeeForm,
                          startDate: e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Phụ cấp mặc định (VNĐ)
                    <input
                      type="number"
                      min="0"
                      value={employeeForm.allowance}
                      onChange={(e) =>
                        setEmployeeForm({
                          ...employeeForm,
                          allowance: e.target.value,
                        })
                      }
                    />
                    <small className="muted">
                      Có thể điều chỉnh riêng từng ngày trong bảng công.
                    </small>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={employeeForm.active !== false}
                      onChange={(e) =>
                        setEmployeeForm({
                          ...employeeForm,
                          active: e.target.checked,
                        })
                      }
                    />
                    Đang làm việc
                  </label>

                  <button className="btn primary full" disabled={busy}>
                    {busy
                      ? "Đang lưu…"
                      : editingEmployee
                        ? "Lưu thay đổi"
                        : "Thêm nhân viên"}
                    <Plus size={16} />
                  </button>
                </form>
              </div>

              <div className="panel employee-list-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Danh sách nhân viên</h3>
                    <p className="muted">Bấm chỉnh sửa để cập nhật hồ sơ.</p>
                  </div>
                </div>

                {employees.length === 0 ? (
                  <Empty
                    icon={Users}
                    title="Chưa có nhân viên"
                    text="Thêm nhân viên đầu tiên ở khung bên trái."
                  />
                ) : (
                  <div className="employee-list">
                    {employees.map((e) => {
                      const t = employeeTotals(e.id);

                      return (
                        <div className="employee-card" key={e.id}>
                          <div className="avatar pale">
                            {e.name.slice(0, 1).toUpperCase()}
                          </div>

                          <div className="employee-info">
                            <b>{e.name}</b>
                            <span>
                              {money(
                                e.hourlyRate || settings.defaultHourlyRate,
                              )}
                              /giờ · Bắt đầu {e.startDate || "chưa cập nhật"}
                            </span>
                            <small>
                              {t.hours.toFixed(1)} giờ trong tháng ·{" "}
                              {money(t.total)}
                            </small>
                          </div>

                          <span
                            className={`status ${e.active === false ? "off-status" : "good"}`}
                          >
                            {e.active === false ? "Đã nghỉ" : "Đang làm"}
                          </span>

                          <button
                            className="btn small secondary"
                            onClick={() => editEmployee(e)}
                          >
                            Sửa
                          </button>
                          <button
                            className="icon-button danger-button"
                            onClick={() => removeEmployee(e)}
                            disabled={busy}
                            title={`Xóa ${e.name}`}
                            aria-label={`Xóa ${e.name}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "settings" && (
          <section className="page-content">
            <div className="section-toolbar">
              <div>
                <h2>Cài đặt lương</h2>
                <p className="muted">
                  Quy định áp dụng cho các ca được tính từ cài đặt này.
                </p>
              </div>
            </div>

            <form className="settings-grid" onSubmit={saveSettings}>
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>
                      <Clock3 size={18} /> Quy tắc đi trễ
                    </h3>
                    <p className="muted">
                      Chỉ trừ tiền khi số phút trễ vượt thời gian miễn trừ.
                    </p>
                  </div>
                </div>

                <div className="stack">
                  <div className="late-policy-list">
                    <div>
                      <b>0–5 phút</b>
                      <span>Không phạt</span>
                    </div>
                    <div>
                      <b>6–15 phút</b>
                      <span>Trừ 0.3 giờ</span>
                    </div>
                    <div>
                      <b>16–30 phút</b>
                      <span>Trừ 0.5 giờ</span>
                    </div>
                    <div>
                      <b>31–60 phút</b>
                      <span>Trừ 0.7 giờ</span>
                    </div>
                    <div>
                      <b>Trên 60 phút</b>
                      <span>Trừ 1 giờ</span>
                    </div>
                  </div>

                  <div className="alert info">
                    <CircleAlert size={17} />
                    <span>
                      Nếu nhân viên đã báo trước ít nhất 5 tiếng, hãy tích xác
                      nhận trong ngày chấm công để không bị trừ. Giờ làm thực tế
                      vẫn được giữ riêng để đối chiếu.
                    </span>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>
                      <BadgeDollarSign size={18} /> Mức lương và phụ cấp
                    </h3>
                    <p className="muted">
                      Mức mặc định dùng khi tạo nhân viên mới.
                    </p>
                  </div>
                </div>

                <div className="stack">
                  <label>
                    Lương mặc định theo giờ (VNĐ)
                    <input
                      type="number"
                      min="0"
                      value={settings.defaultHourlyRate}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultHourlyRate: e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Phụ cấp mặc định (VNĐ)
                    <input
                      type="number"
                      min="0"
                      value={settings.allowance}
                      onChange={(e) =>
                        setSettings({ ...settings, allowance: e.target.value })
                      }
                    />
                  </label>

                  <div className="formula-box">
                    <b>Công thức lương dự kiến</b>
                    <p>
                      (Giờ công × lương/giờ) − tiền đi trễ + phụ cấp + thưởng
                    </p>
                    <small>
                      Tiền OFF không tự tính công. Phụ cấp và thưởng được cộng
                      khi nhập vào từng ngày.
                    </small>
                  </div>
                </div>
              </div>

              <div className="settings-actions">
                <button className="btn primary" type="submit">
                  <Save size={16} /> Lưu cài đặt
                </button>
              </div>
            </form>

            <div className="alert warning settings-warning">
              <CircleAlert size={18} />
              <div>
                <b>Lưu ý về dữ liệu cũ</b>
                <p>
                  Đổi quy tắc không tự cập nhật các ca đã lưu trước đó. Để tránh
                  sai lệch, hãy kiểm tra và lưu lại ca cần áp dụng quy tắc mới
                  trước khi chốt lương.
                </p>
              </div>
            </div>
          </section>
        )}

        <footer className="app-footer">
          <span>© {new Date().getFullYear()} TOM TOM · Chấm công nội bộ</span>
          <span>ReactJS · Firebase · Firestore</span>
        </footer>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <div className="stat-icon">
          <Icon size={18} />
        </div>
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function Status({ status, complete }) {
  if (status === "off") return <span className="status off-status">OFF</span>;
  if (!complete)
    return <span className="status warning-status">Thiếu giờ</span>;
  return <span className="status good">Hoàn tất</span>;
}

function Empty({ icon: Icon, title, text, action, actionText }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={22} />
      </div>
      <b>{title}</b>
      <p>{text}</p>
      {action && (
        <button className="btn secondary" onClick={action}>
          {actionText}
        </button>
      )}
    </div>
  );
}

function PayrollEditCell({ value, placeholder, onSave }) {
  return (
    <input
      className="payroll-edit-input"
      type="number"
      min="0"
      defaultValue={value === undefined || value === null ? "" : value}
      placeholder={placeholder}
      onBlur={(e) => {
        const nextValue = e.target.value.trim() === "" ? "" : Math.max(0, Number(e.target.value));
        e.target.value = nextValue;
        onSave(nextValue);
      }}
      aria-label="Điều chỉnh lương"
    />
  );
}

function PayslipNoteCell({ value, onSave }) {
  return (
    <input
      className="payslip-note-input"
      defaultValue={value}
      onBlur={(event) => onSave(event.target.value)}
      aria-label="Ghi chú ngày"
    />
  );
}

function DayCell({ employee, day, record, onSave, onOff, settings }) {
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    checkIn: record?.checkIn || "",
    checkOut: record?.checkOut || "",
    notes: record?.notes || "",
    status: record?.status || "present",
    lateMinutes: String(record?.lateMinutes || 0),
    lateExcused: record?.lateExcused === true,
    lateReason: record?.lateReason || "",
    allowance: String(record?.allowance || 0),
    bonus: String(record?.bonus || 0),
  });

  useEffect(() => {
    setForm({
      checkIn: record?.checkIn || "",
      checkOut: record?.checkOut || "",
      notes: record?.notes || "",
      status: record?.status || "present",
      lateMinutes: String(record?.lateMinutes || 0),
      lateExcused: record?.lateExcused === true,
      lateReason: record?.lateReason || "",
      allowance: String(record?.allowance || 0),
      bonus: String(record?.bonus || 0),
    });
  }, [
    record?.checkIn,
    record?.checkOut,
    record?.notes,
    record?.status,
    record?.lateMinutes,
    record?.lateExcused,
    record?.lateReason,
    record?.allowance,
    record?.bonus,
  ]);

  const hours = hoursBetween(form.checkIn, form.checkOut);
  const today = record?.status === "off" || form.status === "off";

  const submit = async () => {
    const isOff = form.status === "off" || form.status === "leave";

    await onSave({
      ...record,
      employeeId: employee.id,
      employeeName: employee.name,
      date: day,
      ...form,
      checkIn: isOff ? "" : form.checkIn,
      checkOut: isOff ? "" : form.checkOut,
      hours: isOff ? 0 : hours,
      allowance: Number(form.allowance || 0),
      bonus: Number(form.bonus || 0),
      lateMinutes: Number(form.lateMinutes || 0),
      lateExcused: form.lateExcused,
      lateReason: form.lateExcused ? form.lateReason.trim() : "",
      status: form.status,
      basePay: isOff ? 0 : undefined,
    });

    setOpen(false);
  };

  const penaltyHours = latePenaltyHours(
    Number(form.lateMinutes || 0),
    form.lateExcused,
  );
  const payableHours = Math.max(0, hours - penaltyHours);
  return (
    <div className="day-cell">
      <button
        className={`day-trigger ${today ? "is-off" : record?.lateMinutes > 0 && !record?.lateExcused ? "has-late" : record?.checkIn && record?.checkOut ? "is-complete" : record ? "is-incomplete" : ""} ${record?.allowance ? "has-allowance" : ""}`}
        onClick={() => setOpen(!open)}
        title={
          record?.lateMinutes > 0
            ? `Đi trễ ${record.lateMinutes} phút · trừ ${record.penaltyHours || 0} giờ${record.lateExcused ? " (đã báo trước)" : ""}`
            : record?.allowance
              ? `Phụ cấp ${money(record.allowance)}`
              : "Bấm để chỉnh sửa"
        }
      >
        {today ? (
          "OFF"
        ) : record?.lateMinutes > 0 && !record?.lateExcused ? (
          <>
            {`${record.lateMinutes}p/-${record.penaltyHours || 0}h`}
            {record?.notes && (
              <span className="day-note-dot" title="Có ghi chú">
                •
              </span>
            )}
          </>
        ) : record?.checkIn && record?.checkOut ? (
          Number(record.hours || 0).toFixed(1)
        ) : record?.checkIn || record?.checkOut ? (
          "!"
        ) : record?.notes ? (
          "✎"
        ) : (
          "+"
        )}
      </button>

      {open && (
        <div className="day-popover">
          <div className="popover-head">
            <b>
              {employee.name} · {dayLabel(day)}
            </b>
            <button onClick={() => setOpen(false)} aria-label="Đóng">
              <X size={15} />
            </button>
          </div>

          <label>
            Trạng thái
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="present">Có đi làm</option>
              <option value="off">OFF</option>
              <option value="leave">Nghỉ phép</option>
            </select>
          </label>

          {form.status !== "off" && form.status !== "leave" && (
            <div className="late-rule-box">
              <b>Quy tắc đi trễ</b>
              <small>
                0–5p không phạt · 6–15p trừ 0.3 giờ · 16–30p trừ 0.5 giờ ·
                31–60p trừ 0.7 giờ · trên 60p trừ 1 giờ
              </small>
            </div>
          )}

          {form.status !== "off" && form.status !== "leave" && (
            <>
              <div className="two-fields">
                <label>
                  Check-in
                  <input
                    type="time"
                    value={form.checkIn}
                    onChange={(e) =>
                      setForm({ ...form, checkIn: e.target.value })
                    }
                  />
                </label>

                <label>
                  Check-out
                  <input
                    type="time"
                    value={form.checkOut}
                    onChange={(e) =>
                      setForm({ ...form, checkOut: e.target.value })
                    }
                  />
                </label>
              </div>

              <label>
                Phút đi trễ
                <input
                  type="number"
                  min="0"
                  value={form.lateMinutes}
                  onChange={(e) =>
                    setForm({ ...form, lateMinutes: e.target.value })
                  }
                />
              </label>

              <label className="checkbox-label late-excuse-check">
                <input
                  type="checkbox"
                  checked={form.lateExcused}
                  onChange={(e) =>
                    setForm({ ...form, lateExcused: e.target.checked })
                  }
                />
                Đã báo trước ít nhất 5 tiếng (không trừ lương)
              </label>

              {form.lateExcused && (
                <label>
                  Lý do đi trễ đã báo trước
                  <input
                    value={form.lateReason}
                    onChange={(e) =>
                      setForm({ ...form, lateReason: e.target.value })
                    }
                    placeholder="Nhập lý do để đối chiếu"
                  />
                </label>
              )}

              <div className="two-fields">
                <label>
                  Phụ cấp (đ)
                  <input
                    type="number"
                    min="0"
                    value={form.allowance}
                    onChange={(e) =>
                      setForm({ ...form, allowance: e.target.value })
                    }
                  />
                </label>

                <label>
                  Thưởng (đ)
                  <input
                    type="number"
                    min="0"
                    value={form.bonus}
                    onChange={(e) =>
                      setForm({ ...form, bonus: e.target.value })
                    }
                  />
                </label>
              </div>
            </>
          )}

          <label>
            Ghi chú ngày / phụ cấp
            <select
              value={NOTE_OPTIONS.includes(form.notes) ? form.notes : ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            >
              <option value="">Không có</option>
              {NOTE_OPTIONS.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>

          <label>
            Ghi chú thêm
            <input
              value={NOTE_OPTIONS.includes(form.notes) ? "" : form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Ghi chú tùy ý"
            />
          </label>

          <div className="popover-summary">
            <span>
              Giờ công: <b>{hours.toFixed(1)} giờ</b>
            </span>
            <span>
              Giờ tính lương: <b>{payableHours.toFixed(1)} giờ</b>
            </span>
            {penaltyHours > 0 && <em>Trừ {penaltyHours} giờ</em>}
          </div>

          <div className="popover-actions">
            <button
              className="btn small secondary"
              onClick={() => {
                onOff(employee, day);
                setOpen(false);
              }}
            >
              Đánh dấu OFF
            </button>

            <button className="btn small primary" onClick={submit}>
              <Check size={14} /> Lưu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
