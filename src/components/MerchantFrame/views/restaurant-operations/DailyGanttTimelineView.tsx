import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ShiftAssignment, Collaborator, CollaboratorRole } from '../../../../types/shifts';
import type { TimeEntry, CollaboratorPunchState } from '../../../../types/attendance';
import { parseTimeToMinutes } from '../../../../api/shifts';
import { loadTimeEntries } from '../../../../api/attendance';

export interface DailyGanttTimelineViewProps {
  date: string; // YYYY-MM-DD
  shifts: ShiftAssignment[];
  collaborators: Collaborator[];
  onDateChange?: (newDate: string) => void;
  onUpdateShift?: (shiftId: string, updated: Partial<ShiftAssignment>) => Promise<void>;
  onReassignShift?: (shiftId: string, newCollaboratorId: string) => Promise<void>;
  onOpenAddModal?: (collabId?: string, dateStr?: string) => void;
  onOpenEditModal?: (shift: ShiftAssignment) => void;
}

export type GridResolution = '15min' | '1hr';

// Minimum required staffing thresholds per role per hour (default settings for peak revenue windows)
export interface StaffingThreshold {
  role: CollaboratorRole;
  minHeadcount: number;
  startHour: number; // 0..23
  endHour: number;   // 0..23
}

const DEFAULT_THRESHOLDS: StaffingThreshold[] = [
  { role: 'Waitstaff', minHeadcount: 3, startHour: 12, endHour: 15 }, // Lunch peak
  { role: 'Waitstaff', minHeadcount: 4, startHour: 18, endHour: 22 }, // Dinner peak
  { role: 'Line Cook', minHeadcount: 2, startHour: 11, endHour: 15 },
  { role: 'Line Cook', minHeadcount: 2, startHour: 17, endHour: 22 },
  { role: 'Bartender', minHeadcount: 1, startHour: 17, endHour: 24 },
  { role: 'Supervisor', minHeadcount: 1, startHour: 7, endHour: 23 },
];

const ROLES_ORDER: CollaboratorRole[] = [
  'Supervisor',
  'Waitstaff',
  'Line Cook',
  'Bartender',
  'Cashier',
];

export function getMinutesFromTimeStr(timeStr: string): number {
  return parseTimeToMinutes(timeStr);
}

export function formatMinutesToTimeStr(totalMinutes: number): string {
  let m = Math.max(0, Math.min(1439, Math.round(totalMinutes)));
  let hours = Math.floor(m / 60);
  const minutes = m % 60;
  const isPM = hours >= 12;
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  const mm = String(minutes).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  return `${hh}:${mm} ${isPM ? 'PM' : 'AM'}`;
}

export const DailyGanttTimelineView: React.FC<DailyGanttTimelineViewProps> = ({
  date,
  shifts,
  collaborators,
  onDateChange,
  onUpdateShift,
  onReassignShift,
  onOpenAddModal,
  onOpenEditModal,
}) => {
  const [resolution, setResolution] = useState<GridResolution>('1hr');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());
  const [activeInspectorShift, setActiveInspectorShift] = useState<ShiftAssignment | null>(null);

  // Dragging state for shift resizing/moving
  const [draggingShiftId, setDraggingShiftId] = useState<string | null>(null);
  const [dragType, setDragType] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragInitialStartMin, setDragInitialStartMin] = useState<number>(0);
  const [dragInitialEndMin, setDragInitialEndMin] = useState<number>(0);
  const [dragStartMin, setDragStartMin] = useState<number>(0);
  const [dragEndMin, setDragEndMin] = useState<number>(0);
  
  const timelineCanvasRef = useRef<HTMLDivElement>(null);

  // Live timer for current time indicator
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Hydrate actual daily time entries
  useEffect(() => {
    Promise.resolve(typeof loadTimeEntries === 'function' ? loadTimeEntries() : [])
      .then((entries) => {
        if (Array.isArray(entries)) {
          const dailyEntries = entries.filter((e) => e && e.date === date);
          setTimeEntries(dailyEntries);
        }
      })
      .catch(() => {});
  }, [date]);

  // Derive current time in minutes for today's active marker
  const nowMinutes = useMemo(() => {
    const d = new Date(currentTimeMs);
    return d.getHours() * 60 + d.getMinutes();
  }, [currentTimeMs]);

  const isSelectedDateToday = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return date === todayStr;
  }, [date]);

  // Map of actual punch status per collaborator
  const collabPunchStateMap = useMemo(() => {
    const map = new Map<string, { state: CollaboratorPunchState; clockIn?: string; clockOut?: string; isLate?: boolean }>();
    timeEntries.forEach((te) => {
      const existing = map.get(te.collaboratorId);
      if (!existing || new Date(te.timestamp) > new Date(existing.clockIn || 0)) {
        map.set(te.collaboratorId, {
          state: te.punchState,
          clockIn: te.timeFormatted,
          isLate: te.isLate,
        });
      }
    });
    return map;
  }, [timeEntries]);

  // Filter collaborators
  const filteredCollaborators = useMemo(() => {
    return collaborators.filter((c) => {
      if (selectedRole !== 'all' && c.role !== selectedRole) return false;
      if (
        searchQuery &&
        !c.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !c.role.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !c.department.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [collaborators, selectedRole, searchQuery]);

  // 24-Hour Timeline Columns (0..23)
  const hoursArray = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  // Calculate Hourly Scheduled Headcount density across 24 hours
  const hourlyHeadcount = useMemo(() => {
    const counts = Array<number>(24).fill(0);
    const roleCounts: Record<CollaboratorRole, number[]> = {
      Supervisor: Array(24).fill(0),
      Waitstaff: Array(24).fill(0),
      'Line Cook': Array(24).fill(0),
      Bartender: Array(24).fill(0),
      Cashier: Array(24).fill(0),
    };

    const todaysShifts = shifts.filter((s) => s.date === date);

    todaysShifts.forEach((s) => {
      let startMin = getMinutesFromTimeStr(s.startTime);
      let endMin = getMinutesFromTimeStr(s.endTime);
      if (endMin <= startMin) endMin += 24 * 60; // Overnight shift

      const startHr = Math.floor(startMin / 60);
      const endHr = Math.min(24, Math.ceil(endMin / 60));

      for (let h = startHr; h < endHr && h < 24; h++) {
        counts[h] += 1;
        if (roleCounts[s.role]) {
          roleCounts[s.role][h] += 1;
        }
      }
    });

    return { total: counts, byRole: roleCounts };
  }, [shifts, date]);

  // Hourly understaffing peak revenue warnings
  const hourlyWarnings = useMemo(() => {
    const warnings: { hour: number; role: CollaboratorRole; required: number; actual: number }[] = [];
    DEFAULT_THRESHOLDS.forEach((t) => {
      for (let h = t.startHour; h < t.endHour && h < 24; h++) {
        const actual = hourlyHeadcount.byRole[t.role]?.[h] || 0;
        if (actual < t.minHeadcount) {
          if (!warnings.some((w) => w.hour === h && w.role === t.role)) {
            warnings.push({ hour: h, role: t.role, required: t.minHeadcount, actual });
          }
        }
      }
    });
    return warnings;
  }, [hourlyHeadcount]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const todaysShifts = shifts.filter((s) => s.date === date);
    const totalScheduled = todaysShifts.length;
    let onDutyCount = 0;
    let onBreakCount = 0;
    let tardyOrMissedCount = 0;

    todaysShifts.forEach((s) => {
      const punch = collabPunchStateMap.get(s.collaboratorId);
      if (punch) {
        if (punch.state === 'WORKING') onDutyCount++;
        else if (punch.state === 'ON_BREAK') onBreakCount++;
        else if (punch.isLate || s.status === 'absent') tardyOrMissedCount++;
      } else {
        const startMin = getMinutesFromTimeStr(s.startTime);
        if (isSelectedDateToday && nowMinutes > startMin + 30 && s.status !== 'confirmed') {
          tardyOrMissedCount++;
        }
      }
    });

    return { totalScheduled, onDutyCount, onBreakCount, tardyOrMissedCount };
  }, [shifts, date, collabPunchStateMap, isSelectedDateToday, nowMinutes]);

  // Timeline coordinate helpers: convert minutes (0..1440) to percentage (0..100%)
  const minToPct = (min: number) => (Math.max(0, Math.min(1440, min)) / 1440) * 100;

  // Handle Drag Start
  const handleDragStart = (
    e: React.MouseEvent,
    shift: ShiftAssignment,
    type: 'move' | 'resize-left' | 'resize-right'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingShiftId(shift.id);
    setDragType(type);
    setDragStartX(e.clientX);
    const startM = getMinutesFromTimeStr(shift.startTime);
    let endM = getMinutesFromTimeStr(shift.endTime);
    if (endM <= startM) endM += 24 * 60;

    setDragInitialStartMin(startM);
    setDragInitialEndMin(endM);
    setDragStartMin(startM);
    setDragEndMin(endM);
  };

  // Drag Movement Listener
  useEffect(() => {
    if (!draggingShiftId || !dragType || !timelineCanvasRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineCanvasRef.current) return;
      const rect = timelineCanvasRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartX;
      const minutesPerPixel = 1440 / rect.width;
      const deltaMinutes = Math.round((deltaX * minutesPerPixel) / 15) * 15; // Snap to 15 mins

      if (dragType === 'move') {
        const duration = dragInitialEndMin - dragInitialStartMin;
        let newStart = Math.max(0, Math.min(1440 - duration, dragInitialStartMin + deltaMinutes));
        setDragStartMin(newStart);
        setDragEndMin(newStart + duration);
      } else if (dragType === 'resize-left') {
        let newStart = Math.max(0, Math.min(dragInitialEndMin - 30, dragInitialStartMin + deltaMinutes));
        setDragStartMin(newStart);
      } else if (dragType === 'resize-right') {
        let newEnd = Math.max(dragInitialStartMin + 30, Math.min(1440, dragInitialEndMin + deltaMinutes));
        setDragEndMin(newEnd);
      }
    };

    const handleMouseUp = async () => {
      if (draggingShiftId && onUpdateShift) {
        const newStartStr = formatMinutesToTimeStr(dragStartMin);
        const newEndStr = formatMinutesToTimeStr(dragEndMin % 1440);
        const hours = (dragEndMin - dragStartMin) / 60;
        await onUpdateShift(draggingShiftId, {
          startTime: newStartStr,
          endTime: newEndStr,
          hours: Number(hours.toFixed(1)),
        });
      }
      setDraggingShiftId(null);
      setDragType(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingShiftId, dragType, dragStartX, dragInitialStartMin, dragInitialEndMin, dragStartMin, dragEndMin, onUpdateShift]);

  return (
    <div className="bg-white border border-[#e8e2d8] rounded p-6 shadow-sm space-y-6 font-['Poppins',sans-serif] text-left animate-fade-in">
      {/* 1. Header Toolbar & Date Switcher */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-[#e8e2d8] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#d51f2c]">view_timeline</span>
            <span className="px-2 py-0.5 bg-[#d51f2c]/10 text-[#d51f2c] font-black text-[10px] uppercase tracking-widest rounded">
              Gantt / Timeline Workspace
            </span>
            <span className="text-[#5f5e5e] text-xs font-bold">• 24-Hour Business Day Interval</span>
          </div>
          <h2 className="font-sans text-xl font-black text-[#222222] uppercase tracking-tight mt-1 flex items-center gap-2">
            Shift Coverage & Clock-In Monitor
          </h2>
          <p className="text-body-sm text-[#5f5e5e] mt-0.5">
            Visualize active staffing density, contrast scheduled boundaries against live punches, and detect peak coverage gaps.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Date Picker Input */}
          <div className="flex items-center gap-2 bg-[#f8f6f2] border border-[#e8e2d8] p-1.5 rounded">
            <span className="material-symbols-outlined text-gray-500 text-lg">calendar_today</span>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && onDateChange?.(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#222222] focus:outline-none"
              aria-label="Select Date for Timeline"
            />
          </div>

          {/* Grid Resolution Switcher */}
          <div className="flex bg-[#f1ece4] border border-[#e8e2d8] rounded p-1">
            <button
              onClick={() => setResolution('1hr')}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase rounded transition-colors ${
                resolution === '1hr' ? 'bg-[#222222] text-white shadow-sm' : 'text-[#5f5e5e] hover:text-[#222222]'
              }`}
            >
              1-Hour Grid
            </button>
            <button
              onClick={() => setResolution('15min')}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase rounded transition-colors ${
                resolution === '15min' ? 'bg-[#222222] text-white shadow-sm' : 'text-[#5f5e5e] hover:text-[#222222]'
              }`}
            >
              15-Min Ticks
            </button>
          </div>

          {/* Quick Add Shift Button */}
          <button
            onClick={() => onOpenAddModal?.(undefined, date)}
            className="px-4 py-2 bg-[#222222] hover:bg-[#d51f2c] text-white font-bold text-xs uppercase tracking-wider rounded transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Assign Shift
          </button>
        </div>
      </div>

      {/* 2. Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-[#e8e2d8] rounded shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 bg-blue-50 border border-blue-200 rounded flex items-center justify-center text-blue-700 shrink-0">
            <span className="material-symbols-outlined text-xl">view_timeline</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider">Total Scheduled</p>
            <h4 className="text-xl font-black text-[#1d1c17]">{summaryMetrics.totalScheduled} Shifts</h4>
            <p className="text-[10px] text-blue-700 font-semibold mt-0.5">Planned for {date}</p>
          </div>
        </div>

        <div className="p-4 bg-white border border-[#e8e2d8] rounded shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 bg-emerald-50 border border-emerald-200 rounded flex items-center justify-center text-emerald-700 shrink-0">
            <span className="material-symbols-outlined text-xl">person_pin</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider">Currently On Duty</p>
            <h4 className="text-xl font-black text-[#1d1c17]">{summaryMetrics.onDutyCount} Active</h4>
            <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">Clocked-in & Working</p>
          </div>
        </div>

        <div className="p-4 bg-white border border-[#e8e2d8] rounded shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded flex items-center justify-center text-amber-700 shrink-0">
            <span className="material-symbols-outlined text-xl">free_breakfast</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider">On Active Break</p>
            <h4 className="text-xl font-black text-[#1d1c17]">{summaryMetrics.onBreakCount} Staff</h4>
            <p className="text-[10px] text-amber-700 font-semibold mt-0.5">Meal / Rest Interval</p>
          </div>
        </div>

        <div className="p-4 bg-white border border-[#e8e2d8] rounded shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 bg-rose-50 border border-rose-200 rounded flex items-center justify-center text-rose-700 shrink-0">
            <span className="material-symbols-outlined text-xl">warning</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider">Tardy / Unstaffed</p>
            <h4 className="text-xl font-black text-rose-700">{summaryMetrics.tardyOrMissedCount} Alerts</h4>
            <p className="text-[10px] text-rose-700 font-semibold mt-0.5">Late arrival or missed punch</p>
          </div>
        </div>
      </div>

      {/* 3. Hourly Staffing Density Heatmap & Peak Revenue Threshold Warning Banner */}
      <div className="bg-[#f8f6f2] border border-[#e8e2d8] rounded p-5 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#d51f2c] text-lg">trending_up</span>
            <h3 className="font-black text-xs uppercase tracking-wider text-[#222222]">
              Hourly Staffing Density & Peak Coverage Heatmap
            </h3>
          </div>
          {hourlyWarnings.length > 0 && (
            <span className="px-2.5 py-1 bg-rose-100 text-rose-900 border border-rose-300 rounded font-bold text-[10px] uppercase flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">warning</span>
              {hourlyWarnings.length} Coverage Gap{hourlyWarnings.length > 1 ? 's' : ''} Detected
            </span>
          )}
        </div>

        {/* Peak Warning Highlights Alert Banner if gaps exist */}
        {hourlyWarnings.length > 0 && (
          <div className="p-3 bg-amber-50 border-l-4 border-amber-500 rounded text-xs text-amber-950 flex flex-wrap items-center gap-3">
            <span className="material-symbols-outlined text-amber-600 text-base shrink-0">report_problem</span>
            <div className="flex-1 min-w-[200px]">
              <strong className="font-black uppercase text-[10px] text-amber-800">Peak Hour Coverage Alert: </strong>
              <span>
                Understaffing detected during peak revenue hours:
                {hourlyWarnings.slice(0, 3).map((w, idx) => (
                  <span key={idx} className="ml-1 font-bold">
                    [{w.hour}:00 - {w.role}: {w.actual}/{w.required} min]
                  </span>
                ))}
                {hourlyWarnings.length > 3 && ` (+${hourlyWarnings.length - 3} more)`}.
              </span>
            </div>
          </div>
        )}

        {/* 24-Hour Headcount Bars */}
        <div className="grid grid-cols-24 gap-0.5 pt-2 border-t border-[#e8e2d8] text-center">
          {hoursArray.map((h) => {
            const count = hourlyHeadcount.total[h];
            const hasWarning = hourlyWarnings.some((w) => w.hour === h);
            const isPeakWindow = (h >= 12 && h <= 15) || (h >= 18 && h <= 22);

            return (
              <div
                key={h}
                className={`p-1 rounded text-center transition-all ${
                  hasWarning
                    ? 'bg-rose-100 border border-rose-400 text-rose-900 font-bold'
                    : count > 0
                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-950 font-bold'
                    : 'bg-gray-100 border border-gray-200 text-gray-400'
                }`}
                title={`Hour ${h}:00 - Total ${count} staff scheduled ${hasWarning ? ' (UNDERSTAFFED)' : ''}`}
              >
                <div className="text-[9px] font-mono text-gray-500">{h}h</div>
                <div className="text-xs font-black">{count}</div>
                {isPeakWindow && (
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mx-auto mt-0.5" title="Peak Revenue Window"></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 p-3 border border-[#e8e2d8] rounded">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e] font-bold">
            <span className="material-symbols-outlined text-base">filter_list</span>
            <span>Filter Role:</span>
          </div>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="px-2.5 py-1 bg-white border border-[#e8e2d8] rounded text-xs font-bold text-[#222222] focus:outline-none"
          >
            <option value="all">All Functional Roles ({collaborators.length})</option>
            {ROLES_ORDER.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search staff name or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1 bg-white border border-[#e8e2d8] rounded text-xs font-medium focus:outline-none w-64"
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-[#5f5e5e] uppercase">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-blue-500 rounded-xs"></span>
            <span>Scheduled</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-emerald-500 rounded-xs"></span>
            <span>ON DUTY</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-amber-400 rounded-xs"></span>
            <span>ON BREAK</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-rose-500 border border-rose-700 rounded-xs"></span>
            <span>Late / Unstaffed</span>
          </div>
        </div>
      </div>

      {/* 5. 24-Hour Gantt Timeline Canvas Grid */}
      <div className="overflow-x-auto border border-[#e8e2d8] rounded shadow-sm bg-white relative">
        <div className="min-w-[1200px]" ref={timelineCanvasRef}>
          {/* Header Row: 24-Hour Time Axis (00:00 to 24:00) */}
          <div className="flex border-b border-[#e8e2d8] bg-[#222222] text-white text-xs font-bold sticky top-0 z-20">
            <div className="w-64 p-3 border-r border-white/10 shrink-0 uppercase tracking-wider sticky left-0 bg-[#222222] z-30">
              Collaborator / Functional Role
            </div>
            <div className="flex-1 flex relative">
              {hoursArray.map((h) => {
                const hourLabel = formatMinutesToTimeStr(h * 60);
                return (
                  <div
                    key={h}
                    className="flex-1 border-r border-white/10 p-2 text-center text-[11px] font-mono shrink-0"
                  >
                    {hourLabel.replace(':00', '')}
                    {resolution === '15min' && (
                      <div className="flex justify-between text-[8px] text-gray-400 mt-0.5">
                        <span>:15</span>
                        <span>:30</span>
                        <span>:45</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body: Staff Rows Grouped by Role */}
          <div className="divide-y divide-[#e8e2d8] relative">
            {/* Live Current Time Red Marker Overlay */}
            {isSelectedDateToday && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-rose-600 z-10 pointer-events-none shadow-[0_0_8px_rgba(225,29,72,0.8)]"
                style={{ left: `calc(16rem + (100% - 16rem) * ${minToPct(nowMinutes) / 100})` }}
              >
                <div className="bg-rose-600 text-white text-[9px] font-black uppercase px-1 py-0.2 rounded-full transform -translate-x-1/2 -translate-y-1/2 sticky top-2">
                  LIVE
                </div>
              </div>
            )}

            {filteredCollaborators.length === 0 ? (
              <div className="p-10 text-center text-[#5f5e5e] font-bold text-sm">
                No collaborators match the current role or search filter.
              </div>
            ) : (
              Array.from(new Set([...ROLES_ORDER, ...filteredCollaborators.map((c) => c.role)])).map((role) => {
                const roleStaff = filteredCollaborators.filter((c) => c.role === role);
                if (roleStaff.length === 0) return null;

                return (
                  <React.Fragment key={role}>
                    {/* Role Header Separator Row */}
                    <div className="bg-[#f1ece4] px-4 py-2 font-black text-xs text-[#222222] uppercase tracking-wider flex items-center gap-2 border-t border-b border-[#e8e2d8]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#d51f2c]"></span>
                      {role} ({roleStaff.length} Team Members)
                    </div>

                    {/* Staff Row */}
                    {roleStaff.map((collab) => {
                      const collabShifts = shifts.filter((s) => s.collaboratorId === collab.id && s.date === date);
                      const punch = collabPunchStateMap.get(collab.id);

                      return (
                        <div key={collab.id} className="flex hover:bg-gray-50/60 transition-colors relative min-h-[64px]">
                          {/* Y-Axis Staff Header Cell */}
                          <div className="w-64 p-3 border-r border-[#e8e2d8] shrink-0 sticky left-0 bg-white z-10 flex items-center justify-between gap-2 shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                            <div className="flex items-center gap-2.5 truncate">
                              {collab.avatarUrl ? (
                                <img
                                  src={collab.avatarUrl}
                                  alt={collab.name}
                                  className="w-8 h-8 rounded-full object-cover border border-[#e8e2d8] shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-[#222222] text-white flex items-center justify-center font-bold text-xs shrink-0">
                                  {collab.name.split(' ').map((n) => n[0]).join('')}
                                </div>
                              )}
                              <div className="truncate">
                                <h4 className="font-black text-xs text-[#1d1c17] truncate leading-tight">
                                  {collab.name}
                                </h4>
                                <span className="text-[10px] text-[#5f5e5e] font-semibold block truncate">
                                  {collab.department}
                                </span>
                              </div>
                            </div>

                            {/* Punch State Indicator Pill */}
                            {punch ? (
                              <span
                                className={`px-1.5 py-0.5 text-[9px] font-black rounded uppercase shrink-0 ${
                                  punch.state === 'WORKING'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : punch.state === 'ON_BREAK'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'bg-gray-100 text-gray-600 border border-gray-300'
                                }`}
                              >
                                {punch.state === 'WORKING' ? 'DUTY' : punch.state}
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-gray-400 shrink-0">OFF</span>
                            )}
                          </div>

                          {/* X-Axis Timeline Track Canvas */}
                          <div className="flex-1 relative h-16 bg-gradient-to-r from-gray-50/30 via-white to-gray-50/30">
                            {/* Hour Vertical Grid Lines */}
                            <div className="absolute inset-0 flex pointer-events-none">
                              {hoursArray.map((h) => (
                                <div key={h} className="flex-1 border-r border-gray-100 h-full"></div>
                              ))}
                            </div>

                            {/* Render Dynamic Gantt Shift Bars */}
                            {collabShifts.map((shift) => {
                              const isDraggingThis = draggingShiftId === shift.id;
                              let startM = isDraggingThis ? dragStartMin : getMinutesFromTimeStr(shift.startTime);
                              let endM = isDraggingThis ? dragEndMin : getMinutesFromTimeStr(shift.endTime);
                              if (endM <= startM) endM += 24 * 60;

                              const leftPct = minToPct(startM);
                              const widthPct = minToPct(endM - startM);

                              // Visual status contrast styling
                              let barBg = 'bg-blue-600 border-blue-700 text-white';
                              let accentStrip = 'bg-blue-300';

                              if (punch?.state === 'WORKING') {
                                barBg = 'bg-emerald-600 border-emerald-700 text-white';
                                accentStrip = 'bg-emerald-300';
                              } else if (punch?.state === 'ON_BREAK') {
                                barBg = 'bg-amber-500 border-amber-600 text-white';
                                accentStrip = 'bg-amber-200';
                              } else if (shift.status === 'absent' || (punch?.isLate)) {
                                barBg = 'bg-rose-600 border-rose-800 text-white';
                                accentStrip = 'bg-rose-300';
                              }

                              return (
                                <div
                                  key={shift.id}
                                  onClick={() => setActiveInspectorShift(shift)}
                                  className={`absolute top-2.5 bottom-2.5 rounded shadow-sm border transition-all duration-200 cursor-pointer group hover:shadow-md hover:z-20 flex items-center justify-between px-2 overflow-hidden ${barBg}`}
                                  style={{
                                    left: `${leftPct}%`,
                                    width: `${Math.max(4, widthPct)}%`,
                                  }}
                                  title={`Shift #${shift.id}: ${shift.startTime} - ${shift.endTime} (${shift.presetName})`}
                                >
                                  {/* Drag Handle Left */}
                                  <div
                                    onMouseDown={(e) => handleDragStart(e, shift, 'resize-left')}
                                    className="w-1.5 h-full opacity-0 group-hover:opacity-100 hover:bg-white/40 cursor-ew-resize shrink-0 mr-1"
                                    title="Drag to trim start time"
                                  ></div>

                                  {/* Bar Content */}
                                  <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                    <span className="material-symbols-outlined text-sm shrink-0">drag_indicator</span>
                                    <div className="truncate text-left leading-tight">
                                      <p className="font-black text-[11px] truncate">
                                        {shift.startTime} - {shift.endTime}
                                      </p>
                                      <span className="text-[9px] font-medium text-white/80 truncate block">
                                        {shift.presetName} ({shift.hours}h)
                                      </span>
                                    </div>
                                  </div>

                                  {/* Accent Status Indicator */}
                                  <div className={`h-full w-1 rounded-full ${accentStrip} shrink-0 ml-1`}></div>

                                  {/* Drag Handle Right */}
                                  <div
                                    onMouseDown={(e) => handleDragStart(e, shift, 'resize-right')}
                                    className="w-1.5 h-full opacity-0 group-hover:opacity-100 hover:bg-white/40 cursor-ew-resize shrink-0 ml-1"
                                    title="Drag to extend end time"
                                  ></div>

                                  {/* Rich Hover Popover Card */}
                                  <div className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 hidden group-hover:block bg-[#222222] text-white p-3 rounded shadow-2xl text-xs w-56 z-50 pointer-events-none font-sans text-left border border-white/10 animate-fade-in">
                                    <div className="flex justify-between items-center pb-1 border-b border-white/10 mb-1.5">
                                      <span className="font-black text-[#d51f2c] uppercase text-[10px]">
                                        Shift #{shift.id}
                                      </span>
                                      <span className="px-1.5 py-0.2 bg-white/20 text-[9px] font-bold rounded uppercase">
                                        {shift.status}
                                      </span>
                                    </div>
                                    <p className="font-bold text-white mb-0.5">{collab.name}</p>
                                    <p className="text-[11px] text-gray-300">
                                      Scheduled: <strong>{shift.startTime} - {shift.endTime}</strong> ({shift.hours} hrs)
                                    </p>
                                    {punch && (
                                      <p className="text-[11px] text-emerald-400 mt-1">
                                        Actual Clock-In: <strong>{punch.clockIn || 'N/A'}</strong> ({punch.state})
                                      </p>
                                    )}
                                    <p className="text-[10px] text-gray-400 mt-1">
                                      Department: {shift.department || collab.department}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 6. Quick Reassignment Inspector Drawer Modal */}
      {activeInspectorShift && (
        <InspectorDrawer
          shift={activeInspectorShift}
          collaborators={collaborators}
          onClose={() => setActiveInspectorShift(null)}
          onReassign={async (shiftId, newCollabId) => {
            await onReassignShift?.(shiftId, newCollabId);
            setActiveInspectorShift(null);
          }}
          onEdit={() => {
            const currentShift = activeInspectorShift;
            setActiveInspectorShift(null);
            onOpenEditModal?.(currentShift);
          }}
        />
      )}
    </div>
  );
};

// Inspector Side Drawer Modal
interface InspectorDrawerProps {
  shift: ShiftAssignment;
  collaborators: Collaborator[];
  onClose: () => void;
  onReassign: (shiftId: string, newCollabId: string) => Promise<void>;
  onEdit: () => void;
}

const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  shift,
  collaborators,
  onClose,
  onReassign,
  onEdit,
}) => {
  const [targetCollabId, setTargetCollabId] = useState<string>(shift.collaboratorId);
  const [saving, setSaving] = useState<boolean>(false);
  const [overrideNotes, setOverrideNotes] = useState<string>('');

  const handleConfirmReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetCollabId === shift.collaboratorId) return;
    setSaving(true);
    try {
      await onReassign(shift.id, targetCollabId);
    } catch (err) {
      console.error('Reassign failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-end backdrop-blur-xs font-['Poppins',sans-serif]">
      <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-slide-in text-left">
        {/* Drawer Header */}
        <div className="bg-[#222222] p-5 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#d51f2c]">badge</span>
            <h3 className="font-black text-sm uppercase tracking-wider">
              Shift Inspector & Reassignment
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Inspector Drawer"
            className="text-white/70 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Drawer Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-sm text-[#1d1c17]">
          {/* Shift Details Summary */}
          <div className="p-4 bg-[#f8f6f2] border border-[#e8e2d8] rounded space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black text-[#d51f2c] uppercase tracking-wider">
                Shift Assignment #{shift.id}
              </span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-300 font-bold text-[10px] rounded uppercase">
                {shift.status}
              </span>
            </div>
            <h4 className="font-black text-base text-[#1d1c17]">{shift.collaboratorName}</h4>
            <p className="text-xs text-[#5f5e5e] font-semibold">{shift.role} • {shift.department}</p>

            <div className="pt-2 border-t border-[#e8e2d8] flex justify-between text-xs">
              <div>
                <span className="text-[10px] text-gray-500 font-bold uppercase block">Date & Hours</span>
                <span className="font-black text-[#1d1c17]">{shift.date} ({shift.hours} hrs)</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 font-bold uppercase block">Window</span>
                <span className="font-black text-[#1d1c17]">{shift.startTime} - {shift.endTime}</span>
              </div>
            </div>
          </div>

          {/* Quick Reassignment Form */}
          <form onSubmit={handleConfirmReassign} className="space-y-4">
            <div>
              <label className="block text-xs font-black text-[#222222] uppercase tracking-wider mb-1">
                Reassign Shift to Available Collaborator
              </label>
              <select
                aria-label="Target Collaborator"
                value={targetCollabId}
                onChange={(e) => setTargetCollabId(e.target.value)}
                className="w-full p-2.5 bg-white border border-[#e8e2d8] rounded font-bold text-xs text-[#222222] focus:outline-none focus:border-[#222222]"
              >
                {collaborators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.role} - {c.department})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Supervisor Override Rationale / Note
              </label>
              <textarea
                rows={2}
                value={overrideNotes}
                onChange={(e) => setOverrideNotes(e.target.value)}
                placeholder="Optional supervisor override explanation..."
                className="w-full p-2.5 bg-white border border-[#e8e2d8] rounded text-xs focus:outline-none focus:border-[#222222]"
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={saving || targetCollabId === shift.collaboratorId}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded transition-all shadow-sm flex items-center justify-center gap-1.5"
            >
              {saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
              Confirm Reassignment
            </button>
          </form>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 bg-gray-50 border-t border-[#e8e2d8] flex justify-between items-center gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="px-4 py-2.5 bg-[#222222] hover:bg-[#d51f2c] text-white font-bold text-xs uppercase tracking-wider rounded transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
            Full Shift Edit
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-[#e8e2d8] text-[#5f5e5e] font-bold text-xs uppercase tracking-wider hover:bg-gray-100 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DailyGanttTimelineView;
