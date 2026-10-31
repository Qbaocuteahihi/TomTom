import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Clock3,
} from "lucide-react";
import { dateKey, attendanceId, money } from "./lib/helpers.js";

const SHIFTS = [
  {
    id: "ca1",
    name: "Ca 1",
    start: "06:00",
    end: "12:00",
    hours: 6,
    color: "#2563eb",
    bg: "#eff6ff",
  },
  {
    id: "ca2",
    name: "Ca 2",
    start: "12:00",
    end: "17:00",
    hours: 5,
    color: "#a16207",
    bg: "#fef9c3",
  },
  {
    id: "ca3",
    name: "Ca 3",
    start: "17:00",
    end: "22:00",
    hours: 5,
    color: "#7e22ce",
    bg: "#faf5ff",
  },
];

const ALLOWANCE_13 = 35000;
const MAX_EMPLOYEES = 4;

const latePenaltyHours = (minutes) => {
  if (minutes <= 5) return 0;
  if (minutes <= 15) return 0.3;
  if (minutes <= 30) return 0.5;
  if (minutes <= 60) return 0.7;
  return 1;
};

const lateMinutesFromNote = (note) => {
  const text = String(note || "").toLowerCase();
  // "10 phút", "10p", "10 p"
  let m = text.match(/(\d+)\s*(?:phút|p)\b/);
  if (m) return Number(m[1]);
  // "trễ 10", "tre 10", "late 10"
  m = text.match(/(?:trễ|tre|late)[^\d]*(\d+)/);
  if (m) return Number(m[1]);
  // Chỉ có số trần, vd: "10"
  m = text.match(/^\s*(\d+)\s*$/);
  if (m) return Number(m[1]);
  return 0;
};

const assignmentId = (date, shiftId, employeeId) =>
  `${date}_${shiftId}_${employeeId}`.replaceAll("/", "_");

export default function ShiftAttendance({ db, employees, settings, onNotice }) {
  const [date, setDate] = useState(dateKey());
  const [assignments, setAssignments] = useState([]);
  const [selected, setSelected] = useState({});
  const [deductions, setDeductions] = useState({});

  const changeDate = (delta) => {
    const current = new Date(`${date}T12:00:00`);
    current.setDate(current.getDate() + delta);
    setDate(dateKey(current));
  };

  const selectedDateLabel = new Date(`${date}T12:00:00`).toLocaleDateString(
    "vi-VN",
    {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );

  useEffect(() => {
    if (!db || !date) return;

    const q = query(
      collection(db, "shiftAttendance"),
      where("date", "==", date),
    );

    return onSnapshot(
      q,
      (snapshot) => {
        setAssignments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => onNotice?.(`Không tải được lịch ca: ${error.message}`),
    );
  }, [db, date]);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active !== false),
    [employees],
  );

  const getEmployeeAssignments = (employeeId) =>
    assignments.filter((a) => a.employeeId === employeeId);

  const getAllowance = (employeeId) => {
    const rows = getEmployeeAssignments(employeeId);
    const workedShifts = rows.filter((a) => a.worked);
    return workedShifts.length >= 2 ? ALLOWANCE_13 : 0;
  };

  const addEmployeeToShift = async (shift, employeeId) => {
    if (!employeeId) {
      return;
    }

    const deduction = Number(deductions[shift.id] || 0);
    if (
      !Number.isFinite(deduction) ||
      deduction < 0 ||
      deduction > shift.hours
    ) {
      onNotice?.(`Số giờ trừ phải từ 0 đến ${shift.hours} giờ.`);
      return;
    }

    const inShift = assignments.filter((a) => a.shiftId === shift.id);
    if (inShift.length >= MAX_EMPLOYEES) {
      onNotice?.(`Mỗi ca tối đa ${MAX_EMPLOYEES} nhân viên.`);
      return;
    }

    if (inShift.some((a) => a.employeeId === employeeId)) {
      onNotice?.("Nhân viên này đã được xếp vào ca.");
      return;
    }

    const employee = activeEmployees.find((e) => e.id === employeeId);
    if (!employee) return;

    try {
      const id = assignmentId(date, shift.id, employeeId);
      await setDoc(doc(db, "shiftAttendance", id), {
        date,
        shiftId: shift.id,
        shiftName: shift.name,
        start: shift.start,
        end: shift.end,
        scheduledHours: shift.hours,
        hours: shift.hours - deduction,
        deductionHours: deduction,
        employeeId,
        employeeName: employee.name,
        hourlyRate: Number(
          employee.hourlyRate ?? settings.defaultHourlyRate ?? 30000,
        ),
        worked: true,
        lateNote: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await syncDailyAttendance(employeeId);
      setDeductions((prev) => ({ ...prev, [shift.id]: "" }));

      onNotice?.(`Đã xếp ${employee.name} vào ${shift.name}.`);
    } catch (error) {
      onNotice?.(`Không thể xếp ca: ${error.message}`);
    }
  };

  // Đọc lại TOÀN BỘ ca của nhân viên trong ngày từ Firestore rồi mới sync.
  // Tránh dùng state `assignments` cũ (onSnapshot chưa bắn kịp) → gây sai lệch
  // khiến người này bị trừ đúng, người khác không bị trừ.
  const syncDailyAttendance = async (employeeId) => {
    if (!db || !date || !employeeId) return;

    const q = query(
      collection(db, "shiftAttendance"),
      where("date", "==", date),
    );
    const snap = await getDocs(q);
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((row) => row.employeeId === employeeId);
    const workedRows = rows.filter((r) => r.worked === true);
    const employee = activeEmployees.find((e) => e.id === employeeId);

    const hours = workedRows.reduce((sum, r) => sum + Number(r.hours || 0), 0);
    const rate = Number(
      employee?.hourlyRate ?? settings.defaultHourlyRate ?? 30000,
    );
    const allowance = workedRows.length >= 2 ? ALLOWANCE_13 : 0;

    const startTimes = workedRows.map((r) => r.start).sort();
    const endTimes = workedRows.map((r) => r.end).sort();
    const notes = workedRows
      .filter((r) => r.lateNote?.trim())
      .map((r) => `${r.shiftName}: ${r.lateNote.trim()}`)
      .join(" | ");
    const lateMinutes = workedRows.reduce(
      (sum, row) => sum + lateMinutesFromNote(row.lateNote),
      0,
    );
    const penaltyHours = latePenaltyHours(lateMinutes);

    const id = attendanceId(employeeId, date);
    await setDoc(
      doc(db, "attendance", id),
      {
        employeeId,
        employeeName: employee?.name || rows[0]?.employeeName || "Nhân viên",
        date,
        checkIn: workedRows.length ? startTimes[0] : "",
        checkOut: workedRows.length ? endTimes[endTimes.length - 1] : "",
        hours,
        hourlyRate: rate,
        basePay: Math.round(hours * rate),
        lateMinutes,
        penaltyHours,
        lateDeduction: Math.round(penaltyHours * rate),
        allowance,
        bonus: 0,
        notes,
        status: workedRows.length ? "present" : "scheduled",
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  };

  const saveLateNote = async (row, lateNote) => {
    try {
      await setDoc(
        doc(db, "shiftAttendance", row.id),
        { lateNote, updatedAt: new Date().toISOString() },
        { merge: true },
      );
      await syncDailyAttendance(row.employeeId);
    } catch (error) {
      onNotice?.(`Không lưu được ghi chú: ${error.message}`);
    }
  };

  const removeAssignment = async (row) => {
    if (!window.confirm(`Bỏ xếp ${row.employeeName} khỏi ${row.shiftName}?`))
      return;

    try {
      await deleteDoc(doc(db, "shiftAttendance", row.id));
      await syncDailyAttendance(row.employeeId);
      onNotice?.("Đã bỏ nhân viên khỏi ca.");
    } catch (error) {
      onNotice?.(`Không thể bỏ ca: ${error.message}`);
    }
  };

  return (
    <section className="page-content">
      <div className="section-toolbar">
        <div>
          <h2>Phân ca & Chấm công</h2>
          <p className="muted">
            Đang thao tác ngày <b>{selectedDateLabel}</b>.             Xếp nhân viên theo ca; chọn nhân viên là ghi nhận ca đã làm ngay.
          </p>
        </div>
        <div className="shift-date-controls">
          <button
            className="icon-button"
            onClick={() => changeDate(-1)}
            aria-label="Ngày trước"
            type="button"
          >
            <ChevronLeft size={18} />
          </button>
          <label className="shift-date">
            <CalendarDays size={17} />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Chọn ngày phân ca"
            />
          </label>
          <button
            className="icon-button"
            onClick={() => changeDate(1)}
            aria-label="Ngày sau"
            type="button"
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="btn secondary shift-today"
            onClick={() => setDate(dateKey())}
            disabled={date === dateKey()}
            type="button"
          >
            Hôm nay
          </button>
        </div>
      </div>

      <div className="shift-rules">
        <span>
          <Clock3 size={16} /> Làm từ 2 ca trong ngày được phụ cấp 35.000đ.
        </span>
        <span>
          Tối đa 4 nhân viên/ca · Có thể xếp một nhân viên vào nhiều ca trong
          ngày.
        </span>
      </div>

      <div className="shift-grid">
        {SHIFTS.map((shift) => {
          const rows = assignments
            .filter((a) => a.shiftId === shift.id)
            .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "vi"));

          return (
            <article
              className="shift-card"
              key={shift.id}
              style={{ "--shift-color": shift.color, "--shift-bg": shift.bg }}
            >
              <header className="shift-card-head">
                <div>
                  <span className="shift-tag">{shift.name}</span>
                  <h3>
                    {shift.start} – {shift.end}
                  </h3>
                  <p>
                    {shift.hours} giờ · {rows.length}/{MAX_EMPLOYEES} nhân viên
                  </p>
                </div>
                <span className="shift-count">{rows.length}</span>
              </header>

              <div className="shift-add">
                <select
                  value={selected[shift.id] || ""}
                  onChange={(e) => {
                    const employeeId = e.target.value;
                    setSelected((prev) => ({ ...prev, [shift.id]: "" }));
                    addEmployeeToShift(shift, employeeId);
                  }}
                >
                  <option value="">Chọn nhân viên...</option>
                  {activeEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
                <label className="shift-deduction">
                  <span>Trừ giờ</span>
                  <input
                    type="number"
                    min="0"
                    max={shift.hours}
                    step="0.5"
                    value={deductions[shift.id] ?? ""}
                    placeholder="0"
                    onChange={(e) =>
                      setDeductions((prev) => ({
                        ...prev,
                        [shift.id]: e.target.value,
                      }))
                    }
                    aria-label={`Số giờ trừ của ${shift.name}`}
                  />
                </label>
              </div>

              <div className="shift-employee-list">
                {rows.length === 0 ? (
                  <p className="shift-empty">Chưa có nhân viên trong ca.</p>
                ) : (
                  rows.map((row) => (
                    <div className="shift-employee" key={row.id}>
                      <div className="shift-employee-top">
                        <div>
                          <b>{row.employeeName}</b>
                          <small>
                            {row.hours} giờ
                            {Number(row.deductionHours || 0) > 0 &&
                              ` (trừ ${Number(row.deductionHours)} giờ)`}
                            {" · "}
                            {money(row.hourlyRate)}/giờ
                          </small>
                        </div>
                        <button
                          className="shift-remove"
                          title="Bỏ xếp ca"
                          type="button"
                          onClick={() => removeAssignment(row)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <label className="shift-late-note">
                        Ghi chú đi trễ / ghi chú ca
                        <input
                          key={`${row.id}-${row.lateNote || ""}`}
                          defaultValue={row.lateNote || ""}
                          placeholder="Ví dụ: đến trễ 10 phút"
                          onBlur={(e) => {
                            if (e.target.value !== (row.lateNote || "")) {
                              saveLateNote(row, e.target.value);
                            }
                          }}
                        />
                      </label>

                      {row.worked && (
                        <div className="shift-pay-line">
                          <span>Tiền công ca</span>
                          <b>
                            {money(Number(row.hours) * Number(row.hourlyRate))}
                          </b>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="panel shift-summary">
        <div className="panel-heading">
          <div>
            <h3>Tổng hợp theo nhân viên</h3>
            <p className="muted">
              Chỉ cộng giờ của những ca đã được chọn để xếp.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Ca đã làm</th>
                <th>Tổng giờ</th>
                <th>Phụ cấp từ 2 ca</th>
                <th>Tiền công ca</th>
              </tr>
            </thead>
            <tbody>
              {activeEmployees.map((employee) => {
                const rows = getEmployeeAssignments(employee.id);
                const worked = rows.filter((r) => r.worked);
                if (!rows.length) return null;
                const hours = worked.reduce(
                  (sum, r) => sum + Number(r.hours || 0),
                  0,
                );
                const rate = Number(
                  employee.hourlyRate ?? settings.defaultHourlyRate ?? 30000,
                );
                const allowance = getAllowance(employee.id);

                return (
                  <tr key={employee.id}>
                    <td>
                      <b>{employee.name}</b>
                    </td>
                    <td>
                      {worked.map((r) => r.shiftName).join(", ") ||
                        "Chưa xác nhận"}
                    </td>
                    <td>{hours} giờ</td>
                    <td>{money(allowance)}</td>
                    <td>{money(hours * rate + allowance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
