export const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
export const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const monthKey = (date = new Date()) => dateKey(date).slice(0, 7);
export const dayLabel = (key) => { const [y,m,d] = key.split('-'); return `${d}/${m}`; };
export const monthDays = (month) => {
  const [y,m] = month.split('-').map(Number); const count = new Date(y,m,0).getDate();
  return Array.from({length: count}, (_,i) => `${y}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`);
};
export const toMinutes = (time) => { if (!time) return null; const match = String(time).match(/(\d{1,2})[:h.](\d{2})/); return match ? Number(match[1])*60+Number(match[2]) : null; };
export const hoursBetween = (start, end) => { let a = toMinutes(start), b = toMinutes(end); if (a == null || b == null) return 0; if (b < a) b += 1440; return Math.max(0, (b-a)/60); };
export const safeId = (text) => String(text || '').trim().toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
export const attendanceId = (employeeId, date) => `${employeeId}_${date}`;
