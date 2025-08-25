import React, { useEffect, useMemo, useRef, useState } from "react";

type Task = {
  id: string;
  title: string;
  due_at: string;            // ISO datetime
  status?: string | null;    // "completed" | "open" | null
  completed_at?: string | null;
};

export type CalendarProps = {
  eventsByDate?: Record<string, Task[]>;
  onMonthChange?: (year: number, month: number) => void; // month 0..11
};

const WEEKDAYS_FULL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const pad2 = (n: number) => n.toString().padStart(2, "0");
const keyFromDate = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const startOfMonthWeekdayISO = (y: number, m: number) => {
  const js = new Date(y, m, 1).getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;              // 1..7 (Mon..Sun)
};
const isSameYMD = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isIncomplete = (t: Task) =>
  (t.status ?? "open") !== "completed" && (t.completed_at ?? null) === null;

export default function Calendar({
  eventsByDate = {},
  onMonthChange,
}: CalendarProps) {
  const now = useMemo(() => new Date(), []);
  const [viewYear, setViewYear]   = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0..11
  const [selectedKey, setSelectedKey] = useState<string>(keyFromDate(now));

  // Only call onMonthChange when y/m actually changes
  const lastEmitted = useRef<{ y: number; m: number } | null>(null);
  useEffect(() => {
    if (!onMonthChange) return;
    const prev = lastEmitted.current;
    if (!prev || prev.y !== viewYear || prev.m !== viewMonth) {
      lastEmitted.current = { y: viewYear, m: viewMonth };
      onMonthChange(viewYear, viewMonth);
    }
  }, [viewYear, viewMonth, onMonthChange]);

  // Build fixed 42-day grid
  const grid = useMemo(() => {
    const firstISO = startOfMonthWeekdayISO(viewYear, viewMonth);
    const days = daysInMonth(viewYear, viewMonth);

    const prevMonth = (viewMonth + 11) % 12;
    const prevYear  = viewMonth === 0 ? viewYear - 1 : viewYear;
    const prevDays  = daysInMonth(prevYear, prevMonth);

    const cells: Date[] = [];
    for (let i = firstISO - 2; i >= 0; i--) cells.push(new Date(prevYear, prevMonth, prevDays - i));
    for (let d = 1; d <= days; d++)         cells.push(new Date(viewYear, viewMonth, d));
    const nextCount = 42 - cells.length;
    const nextMonth = (viewMonth + 1) % 12;
    const nextYear  = viewMonth === 11 ? viewYear + 1 : viewYear;
    for (let d = 1; d <= nextCount; d++)    cells.push(new Date(nextYear, nextMonth, d));
    return cells;
  }, [viewYear, viewMonth]);

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else                 { setViewMonth(m => m - 1); }
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else                  { setViewMonth(m => m + 1); }
  };

  const tasksForSelected = useMemo(
    () => (eventsByDate[selectedKey] ?? []).filter(isIncomplete),
    [eventsByDate, selectedKey]
  );

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-3 sm:p-5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
      {/* Header */}
      <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconBtn onClick={() => setViewYear(y => y - 1)}>«</IconBtn>
          <IconBtn onClick={goPrevMonth}>‹</IconBtn>
        </div>

        <h2 className="text-base sm:text-xl font-semibold tracking-tight text-center">
          {MONTHS[viewMonth]} <span className="text-white/70">{viewYear}</span>
        </h2>

        <div className="flex items-center gap-2">
          <IconBtn onClick={goNextMonth}>›</IconBtn>
          <IconBtn onClick={() => setViewYear(y => y + 1)}>»</IconBtn>
        </div>
      </div>

      {/* Weekdays */}
      <div className="grid grid-cols-7 text-center text-[11px] sm:text-xs text-white/70 mb-1 sm:mb-2">
        {/* xs: single letters, ≥sm: full */}
        <div className="py-1 sm:hidden">{WEEKDAYS_SHORT[0]}</div>
        <div className="py-1 sm:hidden">{WEEKDAYS_SHORT[1]}</div>
        <div className="py-1 sm:hidden">{WEEKDAYS_SHORT[2]}</div>
        <div className="py-1 sm:hidden">{WEEKDAYS_SHORT[3]}</div>
        <div className="py-1 sm:hidden">{WEEKDAYS_SHORT[4]}</div>
        <div className="py-1 sm:hidden">{WEEKDAYS_SHORT[5]}</div>
        <div className="py-1 sm:hidden">{WEEKDAYS_SHORT[6]}</div>

        {WEEKDAYS_FULL.map((w) => (
          <div key={w} className="py-1 hidden sm:block">{w}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-[4px] sm:gap-2">
        {grid.map((date) => {
          const k = keyFromDate(date);
          const isCurrentMonth = date.getMonth() === viewMonth && date.getFullYear() === viewYear;
          const isToday   = isSameYMD(date, now) && isCurrentMonth;
          const dueCount  = (eventsByDate[k]?.filter(isIncomplete).length ?? 0);
          const isSelected = selectedKey === k;

          return (
            <button
              type="button"
              key={k}
              onClick={() => setSelectedKey(k)}
              aria-pressed={isSelected}
              className={[
                // bigger tap target on phones
                "relative rounded-xl border text-center h-12 sm:h-16 flex items-center justify-center transition outline-none",
                isCurrentMonth
                  ? "border-white/10 bg-white/[0.05] hover:bg-white/[0.08]"
                  : "border-white/5 bg-white/[0.02] text-white/50",
                isToday    ? "ring-1 ring-blue-400/50" : "",
                isSelected ? "outline outline-1 outline-blue-400/60" : "",
              ].join(" ")}
            >
              <span className="text-[12px] sm:text-sm">{date.getDate()}</span>

              {isToday && (
                <span className="absolute right-1 top-1 rounded-full px-1 py-0.5 text-[9px] sm:text-[10px] bg-blue-500/20 text-blue-300">
                  Today
                </span>
              )}

              {dueCount > 0 && (
                <>
                  <span className="absolute left-1 top-1 h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-emerald-400/80" />
                  <span className="absolute bottom-1 right-1 text-[9px] sm:text-[10px] rounded-md px-1 bg-white/10 border border-white/10">
                    {dueCount}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-3 sm:mt-4 flex items-center justify-end gap-2">
        <button
          onClick={() => {
            setViewYear(now.getFullYear());
            setViewMonth(now.getMonth());
            setSelectedKey(keyFromDate(now));
          }}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 transition"
        >
          Jump to Today
        </button>
      </div>

      {/* Selected-day tray (mobile-friendly) */}
      <div className="mt-3 sm:mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <div className="mb-2 text-xs sm:text-sm text-white/70">
          Tasks due on <span className="text-white font-medium">{selectedKey}</span>
        </div>
        {tasksForSelected.length === 0 ? (
          <div className="text-white/60 text-sm">No due tasks.</div>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-auto pr-1">
            {tasksForSelected.map((t) => {
              const d = new Date(t.due_at);
              const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2"
                >
                  <span className="truncate pr-3">{t.title}</span>
                  <span className="text-white/70 text-sm">{time}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---- tiny button component to keep header neat ---- */
function IconBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm hover:bg-white/10"
    >
      {children}
    </button>
  );
}
