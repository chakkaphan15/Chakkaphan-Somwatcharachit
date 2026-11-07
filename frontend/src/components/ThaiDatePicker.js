import React, { useState, useRef, useEffect } from 'react';
import { FiCalendar } from 'react-icons/fi';

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const DAY_HEAD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const parseYmd = (s) => {
  if (!s) return null;
  const parts = s.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
};

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ThaiDatePicker = ({ value = '', onChange, placeholder = 'เลือกวัน' }) => {
  const now = new Date();
  const initDate = parseYmd(value) || now;
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(initDate.getFullYear());
  const [month, setMonth] = useState(initDate.getMonth() + 1);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (value) {
      const d = parseYmd(value);
      if (d) {
        setYear(d.getFullYear());
        setMonth(d.getMonth() + 1);
      }
    }
  }, [value]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayStr = ymd(now);
  const selDate = parseYmd(value);

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  const pick = (d) => {
    onChange(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    setOpen(false);
  };

  return (
    <div className="tdate-wrap" ref={wrapRef}>
      <button type="button" className="tdate-btn" onClick={() => setOpen(!open)}>
        <FiCalendar size={14} />
        {selDate ? `${selDate.getDate()} ${TH_MONTHS[selDate.getMonth()]} ${selDate.getFullYear() + 543}` : placeholder}
      </button>
      {open && (
        <div className="tdate-pop">
          <div className="tdate-head">
            <button type="button" className="tdate-nav" onClick={prevMonth} title="เดือนก่อนหน้า">‹</button>
            <div className="tdate-title">{TH_MONTHS[month - 1]} {year + 543}</div>
            <button type="button" className="tdate-nav" onClick={nextMonth} title="เดือนถัดไป">›</button>
          </div>
          <div className="tdate-grid tdate-dow">
            {DAY_HEAD.map(h => <span key={h}>{h}</span>)}
          </div>
          <div className="tdate-grid">
            {cells.map((d, i) => d === null ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                className={`tdate-day ${`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}` === todayStr ? 'today' : ''} ${`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}` === value ? 'selected' : ''}`}
                onClick={() => pick(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThaiDatePicker;
