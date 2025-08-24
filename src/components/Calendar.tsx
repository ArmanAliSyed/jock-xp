import React, { useEffect, useMemo, useRef, useState } from "react";

type Task = {
  id: string;
  title: string;
  due_at: string;            // ISO datetime
  status?: string | null;    // e.g. "completed" | "open" | null
  completed_at?: string | null;
};

export type CalendarProps = {
  /** Map of YYYY-MM-DD -> tasks due that day */
  eventsByDate?: Record<string, Task[]>;
  /** Called when visible month changes: month is 0..11 */
  onMonthChange?: (year: number, month: number) => void;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const pad2 = (n: number) => n.toString().padStart(2, "0");
const keyFromDate = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const startOfMonthWeekdayISO = (y: number, m: number) => {
  // 1..7, Mon..Sun
  const js = new Date(y, m, 1).getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;
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
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0..11
  const [selectedKey, setSelectedKey] = useState<string>(keyFromDate(now));

  // Only call onMonthChange when the visible y/m actually changes
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
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    const prevDays = daysInMonth(prevYear, prevMonth);

    const cells: Date[] = [];
    // leading
    for (let i = firstISO - 2; i >= 0; i--) {
      cells.push(new Date(prevYear, prevMonth, prevDays - i));
    }
    // current
    for (let d = 1; d <= days; d++) {
      cells.push(new Date(viewYear, viewMonth, d));
    }
    // trailing
    const nextCount = 42 - cells.length;
    const nextMonth = (viewMonth + 1) % 12;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    for (let d = 1; d <= nextCount; d++) {
      cells.push(new Date(nextYear, nextMonth, d));
    }
    return cells;
  }, [viewYear, viewMonth]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const tasksForSelected = (eventsByDate[selectedKey] ?? []).filter(isIncomplete);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-4 md:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewYear((y) => y - 1)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
          >
            «
          </button>
          <button
            onClick={goPrevMonth}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
          >
            ‹
          </button>
        </div>
        <h2 className="text-lg md:text-xl font-semibold tracking-tight">
          {MONTHS[viewMonth]} <span className="text-white/70">{viewYear}</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goNextMonth}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
          >
            ›
          </button>
          <button
            onClick={() => setViewYear((y) => y + 1)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
          >
            »
          </button>
        </div>
      </div>

      {/* Weekdays */}
      <div className="grid grid-cols-7 text-center text-xs md:text-sm text-white/70 mb-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {grid.map((date) => {
          const k = keyFromDate(date); // stable key fixes “Today” flicker
          const isCurrentMonth =
            date.getMonth() === viewMonth && date.getFullYear() === viewYear;
          const isToday = isSameYMD(date, now) && isCurrentMonth;
          const incompleteCount =
            (eventsByDate[k]?.filter(isIncomplete).length ?? 0);
          const hasTasks = incompleteCount > 0;
          const isSelected = selectedKey === k;

          return (
            <button
              type="button"
              key={k}
              onClick={() => setSelectedKey(k)}
              aria-pressed={isSelected}
              className={[
                "relative overflow-hidden rounded-xl border text-center py-2 md:py-3 transition outline-none",
                isCurrentMonth
                  ? "border-white/10 bg-white/[0.05] hover:bg-white/[0.08]"
                  : "border-white/5 bg-white/[0.02] text-white/50",
                isToday ? "ring-1 ring-blue-400/50" : "",
                isSelected ? "outline outline-1 outline-blue-400/60" : "",
              ].join(" ")}
            >
              <span className="text-xs md:text-sm">{date.getDate()}</span>

              {isToday && (
                <span className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] md:text-xs bg-blue-500/20 text-blue-300">
                  Today
                </span>
              )}

              {hasTasks && (
                <>
                  <span className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400/80" />
                  <span className="absolute bottom-1.5 right-1.5 text-[10px] md:text-xs rounded-md px-1 bg-white/10 border border-white/10">
                    {incompleteCount}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={() => {
            setViewYear(now.getFullYear());
            setViewMonth(now.getMonth());
            setSelectedKey(keyFromDate(now));
          }}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
        >
          Jump to Today
        </button>
      </div>

      {/* Selected day task list */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:p-4">
        <div className="mb-2 text-sm text-white/70">
          Tasks due on <span className="text-white font-medium">{selectedKey}</span>
        </div>
        {(eventsByDate[selectedKey]?.filter(isIncomplete).length ?? 0) === 0 ? (
          <div className="text-white/60 text-sm">No due tasks.</div>
        ) : (
          <ul className="space-y-2">
            {eventsByDate[selectedKey]!
              .filter(isIncomplete)
              .map((t) => {
                const d = new Date(t.due_at);
                const time = d.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2"
                  >
                    <span className="truncate">{t.title}</span>
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
