import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { TimeEntry, PunchType, AttendanceLedgerRecord, AttendanceStatus } from '../../../../types/attendance';
import { fetchTimeEntries, fetchAttendanceLedgerRecords, STORE_LOCATIONS } from '../../../../api/attendance';
import { TimeClockKioskView } from './TimeClockKioskView';
import { TimesheetCorrectionModal } from './TimesheetCorrectionModal';
import { StaffManagementQuickLinks } from './StaffManagementQuickLinks';

interface TimeEntriesViewProps {
  onNavigate?: (view: string) => void;
}

export const TimeEntriesView: React.FC<TimeEntriesViewProps> = ({ onNavigate }) => {
  // Mode toggle: LEDGER vs PUNCH_LOGS
  const [workspaceMode, setWorkspaceMode] = useState<'LEDGER' | 'PUNCH_LOGS'>('LEDGER');

  // Ledger state
  const [ledgerRecords, setLedgerRecords] = useState<AttendanceLedgerRecord[]>([]);
  const [selectedRecordForCorrection, setSelectedRecordForCorrection] = useState<AttendanceLedgerRecord | null>(null);

  // Raw Punch Logs state
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [showKioskModal, setShowKioskModal] = useState<boolean>(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);

  // Filters state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('loc-all');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Punch log specific filters
  const [filterPunchType, setFilterPunchType] = useState<string>('ALL');
  const [filterOverrideOnly, setFilterOverrideOnly] = useState<boolean>(false);

  const loadData = () => {
    const rawPunches = fetchTimeEntries();
    setEntries(rawPunches);

    const ledger = fetchAttendanceLedgerRecords();
    setLedgerRecords(ledger);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Ledger Records
  const filteredLedgerRecords = useMemo(() => {
    return ledgerRecords.filter((r) => {
      const matchSearch =
        r.collaboratorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.department.toLowerCase().includes(searchTerm.toLowerCase());

      const matchLocation =
        selectedLocation === 'loc-all' || r.storeLocationId === selectedLocation;

      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;

      return matchSearch && matchLocation && matchStatus;
    });
  }, [ledgerRecords, searchTerm, selectedLocation, statusFilter]);

  // Filtered Raw Punches
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchSearch =
        e.collaboratorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.department.toLowerCase().includes(searchTerm.toLowerCase());

      const matchPunch = filterPunchType === 'ALL' || e.punchType === filterPunchType;
      const matchOverride = !filterOverrideOnly || Boolean(e.supervisorOverride);

      return matchSearch && matchPunch && matchOverride;
    });
  }, [entries, searchTerm, filterPunchType, filterOverrideOnly]);

  // Ledger Summary Metrics
  const ledgerMetrics = useMemo(() => {
    const totalRecords = ledgerRecords.length;
    const totalNetHours = ledgerRecords.reduce((acc, r) => acc + r.netPayableHours, 0);
    const onTimeCount = ledgerRecords.filter((r) => r.status === 'ON_TIME').length;
    const tardyCount = ledgerRecords.filter((r) => r.status === 'TARDY').length;
    const earlyDepartureCount = ledgerRecords.filter((r) => r.status === 'EARLY_DEPARTURE').length;
    const missedPunchCount = ledgerRecords.filter((r) => r.status === 'MISSED_PUNCH').length;
    const unscheduledCount = ledgerRecords.filter((r) => r.status === 'UNSCHEDULED').length;

    const onTimePercentage = totalRecords > 0 ? Math.round((onTimeCount / totalRecords) * 100) : 0;

    return {
      totalRecords,
      totalNetHours: parseFloat(totalNetHours.toFixed(2)),
      onTimeCount,
      onTimePercentage,
      tardyCount,
      earlyDepartureCount,
      missedPunchCount,
      unscheduledCount,
    };
  }, [ledgerRecords]);

  // Raw Punch Metrics
  const rawPunchMetrics = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayEntries = entries.filter((e) => e.date === today);
    const overridesCount = entries.filter((e) => e.supervisorOverride).length;

    const workingNowCount = new Set(
      entries.filter((e) => e.punchState === 'WORKING').map((e) => e.collaboratorId)
    ).size;

    const onBreakCount = new Set(
      entries.filter((e) => e.punchState === 'ON_BREAK').map((e) => e.collaboratorId)
    ).size;

    return {
      totalToday: todayEntries.length,
      workingNow: workingNowCount,
      onBreak: onBreakCount,
      overrides: overridesCount,
    };
  }, [entries]);

  const renderStatusBadge = (status: AttendanceStatus, label: string) => {
    switch (status) {
      case 'ON_TIME':
        return (
          <span className="px-2.5 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-black uppercase rounded inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            {label}
          </span>
        );
      case 'TARDY':
        return (
          <span className="px-2.5 py-1 bg-rose-100 border border-rose-300 text-rose-800 text-[10px] font-black uppercase rounded inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
            {label}
          </span>
        );
      case 'EARLY_DEPARTURE':
        return (
          <span className="px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-black uppercase rounded inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
            {label}
          </span>
        );
      case 'MISSED_PUNCH':
        return (
          <span className="px-2.5 py-1 bg-rose-50 border border-rose-400 text-rose-900 text-[10px] font-black uppercase rounded animate-pulse inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
            {label}
          </span>
        );
      case 'UNSCHEDULED':
      default:
        return (
          <span className="px-2.5 py-1 bg-purple-100 border border-purple-300 text-purple-900 text-[10px] font-black uppercase rounded inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
            {label}
          </span>
        );
    }
  };

  const renderPunchBadge = (type: PunchType) => {
    switch (type) {
      case 'CLOCK_IN':
        return (
          <span className="px-2.5 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-black uppercase rounded">
            CLOCK IN
          </span>
        );
      case 'START_BREAK':
        return (
          <span className="px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-black uppercase rounded">
            START BREAK
          </span>
        );
      case 'END_BREAK':
        return (
          <span className="px-2.5 py-1 bg-blue-100 border border-blue-300 text-blue-900 text-[10px] font-black uppercase rounded">
            END BREAK
          </span>
        );
      case 'CLOCK_OUT':
        return (
          <span className="px-2.5 py-1 bg-rose-100 border border-rose-300 text-rose-800 text-[10px] font-black uppercase rounded">
            CLOCK OUT
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 animate-fade-in text-left">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">
            Human Resources <span className="text-[#d51f2c]">/</span> Attendance Ledger & Time Control
          </p>
          <h1 className="font-sans text-h1 text-[#222222] uppercase tracking-tighter">
            Attendance Ledger & Timesheet Audit
          </h1>
          <p className="text-body-md text-[#666666] mt-1">
            Monitor live shift attendance, review timesheet variances (tardiness, early departures, missed punches), adjust records, and audit total worked hours.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Workspace View Selector */}
          <div className="bg-white border border-[#e8e2d8] rounded p-1 flex items-center shadow-sm">
            <button
              onClick={() => setWorkspaceMode('LEDGER')}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1.5 ${
                workspaceMode === 'LEDGER'
                  ? 'bg-[#222222] text-white shadow'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              <span className="material-symbols-outlined text-base">table_view</span>
              Attendance Ledger
            </button>
            <button
              onClick={() => setWorkspaceMode('PUNCH_LOGS')}
              className={`px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1.5 ${
                workspaceMode === 'PUNCH_LOGS'
                  ? 'bg-[#222222] text-white shadow'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              <span className="material-symbols-outlined text-base">list_alt</span>
              Raw Punch Logs
            </button>
          </div>

          <button
            onClick={() => setShowKioskModal(true)}
            className="px-5 py-2.5 bg-[#d51f2c] text-white font-bold text-xs uppercase tracking-wider hover:bg-[#b01a24] transition-all rounded shadow flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">punch_clock</span>
            Launch Kiosk Terminal
          </button>
        </div>
      </div>

      {workspaceMode === 'LEDGER' ? (
        <>
          {/* Summary Metric Cards for Attendance Ledger */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Net Payable Worked Hours Card */}
            <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
              <div className="flex justify-between items-center text-emerald-700 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Total Net Payable Hours
                </span>
                <span className="material-symbols-outlined text-xl">payments</span>
              </div>
              <p className="text-3xl font-black text-[#222222] font-mono">
                {ledgerMetrics.totalNetHours}{' '}
                <span className="text-xs text-gray-500 font-sans font-normal">hrs</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                Subtracted unpaid breaks across {ledgerMetrics.totalRecords} shift records
              </p>
            </div>

            {/* On-Time Attendance Rate */}
            <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
              <div className="flex justify-between items-center text-emerald-600 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  On-Time Attendance Rate
                </span>
                <span className="material-symbols-outlined text-xl">verified</span>
              </div>
              <p className="text-3xl font-black text-emerald-600 font-mono">
                {ledgerMetrics.onTimePercentage}%
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                {ledgerMetrics.onTimeCount} of {ledgerMetrics.totalRecords} shifts within grace period
              </p>
            </div>

            {/* Timesheet Variances */}
            <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
              <div className="flex justify-between items-center text-amber-600 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Late & Early Variances
                </span>
                <span className="material-symbols-outlined text-xl">schedule</span>
              </div>
              <p className="text-3xl font-black text-amber-600 font-mono">
                {ledgerMetrics.tardyCount + ledgerMetrics.earlyDepartureCount}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                {ledgerMetrics.tardyCount} Late • {ledgerMetrics.earlyDepartureCount} Early departures
              </p>
            </div>

            {/* Unresolved Missed Punches */}
            <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
              <div className="flex justify-between items-center text-rose-600 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Missed Punches & Unscheduled
                </span>
                <span className="material-symbols-outlined text-xl">warning</span>
              </div>
              <p className="text-3xl font-black text-rose-600 font-mono">
                {ledgerMetrics.missedPunchCount + ledgerMetrics.unscheduledCount}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                {ledgerMetrics.missedPunchCount} Missed punches • {ledgerMetrics.unscheduledCount} Unscheduled
              </p>
            </div>
          </div>

          {/* Ledger Toolbar & Filters */}
          <div className="bg-white border border-[#e8e2d8] p-4 rounded shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              {/* Search & Location Selectors */}
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-sm">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search collaborator, role..."
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 text-xs rounded focus:outline-none focus:border-[#d51f2c]"
                  />
                </div>

                {/* Store Location Filter */}
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="px-3 py-2 border border-gray-300 text-xs font-semibold rounded bg-white focus:outline-none"
                >
                  {STORE_LOCATIONS.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Attendance Status Filter Tabs */}
              <div className="flex flex-wrap gap-1.5 w-full md:w-auto justify-start md:justify-end">
                {[
                  { id: 'ALL', label: 'All Records', count: ledgerRecords.length },
                  { id: 'ON_TIME', label: 'On Time', count: ledgerMetrics.onTimeCount },
                  { id: 'TARDY', label: 'Tardy', count: ledgerMetrics.tardyCount },
                  { id: 'EARLY_DEPARTURE', label: 'Early', count: ledgerMetrics.earlyDepartureCount },
                  { id: 'MISSED_PUNCH', label: 'Missed Punch', count: ledgerMetrics.missedPunchCount },
                  { id: 'UNSCHEDULED', label: 'Unscheduled', count: ledgerMetrics.unscheduledCount },
                ].map((st) => (
                  <button
                    key={st.id}
                    data-testid={`filter-${st.id.toLowerCase()}`}
                    onClick={() => setStatusFilter(st.id)}
                    className={`px-3 py-1.5 text-[11px] font-bold uppercase rounded border transition-all flex items-center gap-1.5 ${
                      statusFilter === st.id
                        ? 'bg-[#222222] text-white border-[#222222] shadow'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <span>{st.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono ${
                        statusFilter === st.id
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-200 text-gray-800'
                      }`}
                    >
                      {st.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Core Workspace Grid Layout Data-Binding */}
          <div className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#222222] text-white uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="p-4">Collaborator Profile</th>
                    <th className="p-4">Store Location & Date</th>
                    <th className="p-4">Scheduled Window</th>
                    <th className="p-4">Actual Punches</th>
                    <th className="p-4">Variance Indicator</th>
                    <th className="p-4 text-center">Unpaid Break</th>
                    <th className="p-4 text-right">Net Payable Hours</th>
                    <th className="p-4 text-center">Timesheet Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredLedgerRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-500 font-bold">
                        No attendance ledger records found matching current location or status filter.
                      </td>
                    </tr>
                  ) : (
                    filteredLedgerRecords.map((record) => (
                      <tr
                        key={record.id}
                        className="hover:bg-amber-50/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedRecordForCorrection(record)}
                      >
                        {/* Collaborator Profile */}
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={
                                record.avatarUrl ||
                                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50&h=50&fit=crop'
                              }
                              alt={record.collaboratorName}
                              className="w-9 h-9 rounded-full object-cover border border-gray-300"
                            />
                            <div>
                              <p className="font-bold text-[#222222] flex items-center gap-1.5">
                                {record.collaboratorName}
                                {record.isManualOverride && (
                                  <span
                                    className="material-symbols-outlined text-amber-600 text-sm"
                                    title="Manually adjusted by manager"
                                  >
                                    edit_note
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                {record.role} <span className="text-[#d51f2c]">•</span>{' '}
                                {record.department}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Location & Date */}
                        <td className="p-4 font-mono">
                          <p className="font-bold text-gray-800 text-xs">
                            {record.storeLocationName}
                          </p>
                          <p className="text-[10px] text-gray-400">{record.date}</p>
                        </td>

                        {/* Scheduled Window */}
                        <td className="p-4 font-mono">
                          {record.scheduledWindow ? (
                            <div>
                              <p className="text-gray-900 font-semibold">
                                {record.scheduledWindow.startTime} - {record.scheduledWindow.endTime}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                ({record.scheduledWindow.scheduledHours.toFixed(1)} hrs scheduled)
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic text-[11px]">Unscheduled</span>
                          )}
                        </td>

                        {/* Actual Punches */}
                        <td className="p-4 font-mono">
                          <div className="text-xs">
                            <p className="text-gray-900">
                              <span className="text-gray-400 text-[10px]">IN:</span>{' '}
                              <strong className="text-emerald-700">
                                {record.actualPunches.clockIn || 'N/A'}
                              </strong>
                            </p>
                            <p className="text-gray-900">
                              <span className="text-gray-400 text-[10px]">OUT:</span>{' '}
                              <strong
                                className={
                                  record.actualPunches.clockOut
                                    ? 'text-rose-700'
                                    : 'text-rose-600 italic underline'
                                }
                              >
                                {record.actualPunches.clockOut || 'MISSING PUNCH'}
                              </strong>
                            </p>
                          </div>
                        </td>

                        {/* Variance Indicator */}
                        <td className="p-4">
                          {renderStatusBadge(record.status, record.varianceLabel)}
                        </td>

                        {/* Break Summary */}
                        <td className="p-4 text-center font-mono">
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded font-bold text-[11px]">
                            {record.unpaidBreakMinutes} min
                          </span>
                        </td>

                        {/* Net Payable Worked Hours */}
                        <td className="p-4 text-right font-mono">
                          <p className="text-sm font-black text-[#222222]">
                            {record.netPayableHours.toFixed(2)} hrs
                          </p>
                          <p className="text-[9px] text-gray-400">
                            Raw: {record.rawWorkedHours.toFixed(2)} hrs
                          </p>
                        </td>

                        {/* Timesheet Action */}
                        <td className="p-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecordForCorrection(record);
                            }}
                            className="px-3 py-1.5 bg-[#222222] text-white text-[11px] font-bold uppercase rounded hover:bg-[#d51f2c] transition-colors flex items-center gap-1 mx-auto"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                            Adjust
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Raw Punch Event Logs View */
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
              <div className="flex justify-between items-center text-secondary mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest">Total Punches Today</span>
                <span className="material-symbols-outlined text-primary text-xl">history</span>
              </div>
              <p className="text-3xl font-black text-[#222222] font-mono">{rawPunchMetrics.totalToday}</p>
            </div>

            <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
              <div className="flex justify-between items-center text-emerald-600 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest">Active Working Now</span>
                <span className="material-symbols-outlined text-xl">badge</span>
              </div>
              <p className="text-3xl font-black text-emerald-600 font-mono">{rawPunchMetrics.workingNow}</p>
            </div>

            <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
              <div className="flex justify-between items-center text-amber-600 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest">On Break Currently</span>
                <span className="material-symbols-outlined text-xl">free_breakfast</span>
              </div>
              <p className="text-3xl font-black text-amber-600 font-mono">{rawPunchMetrics.onBreak}</p>
            </div>

            <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
              <div className="flex justify-between items-center text-rose-600 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest">Supervisor Overrides</span>
                <span className="material-symbols-outlined text-xl">admin_panel_settings</span>
              </div>
              <p className="text-3xl font-black text-rose-600 font-mono">{rawPunchMetrics.overrides}</p>
            </div>
          </div>

          {/* Filters Toolbar */}
          <div className="bg-white border border-[#e8e2d8] p-4 rounded shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-sm">
                  search
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search collaborator or role..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 text-xs rounded focus:outline-none focus:border-[#d51f2c]"
                />
              </div>

              <select
                value={filterPunchType}
                onChange={(e) => setFilterPunchType(e.target.value)}
                className="px-3 py-2 border border-gray-300 text-xs font-semibold rounded bg-white focus:outline-none"
              >
                <option value="ALL">All Punch Types</option>
                <option value="CLOCK_IN">Clock In</option>
                <option value="START_BREAK">Start Break</option>
                <option value="END_BREAK">End Break</option>
                <option value="CLOCK_OUT">Clock Out</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#222222]">
              <input
                type="checkbox"
                checked={filterOverrideOnly}
                onChange={(e) => setFilterOverrideOnly(e.target.checked)}
                className="w-4 h-4 accent-[#d51f2c] rounded"
              />
              Show Supervisor Overrides Only
            </label>
          </div>

          {/* Time Entries Table */}
          <div className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#222222] text-white uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="p-4">Timestamp</th>
                    <th className="p-4">Collaborator</th>
                    <th className="p-4">Role & Dept</th>
                    <th className="p-4">Punch Action</th>
                    <th className="p-4">Scheduled Shift</th>
                    <th className="p-4">Supervisor Override</th>
                    <th className="p-4 text-center">Photo Snapshot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500 font-bold">
                        No attendance punch records found matching current criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-mono">
                          <p className="font-bold text-[#222222]">{e.timeFormatted}</p>
                          <p className="text-[10px] text-gray-400">{e.date}</p>
                        </td>

                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={
                                e.avatarUrl ||
                                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50&h=50&fit=crop'
                              }
                              alt={e.collaboratorName}
                              className="w-8 h-8 rounded-full object-cover border border-gray-300"
                            />
                            <span className="font-bold text-[#222222]">{e.collaboratorName}</span>
                          </div>
                        </td>

                        <td className="p-4">
                          <p className="font-semibold text-gray-800">{e.role}</p>
                          <p className="text-[10px] text-gray-400 uppercase">{e.department}</p>
                        </td>

                        <td className="p-4">{renderPunchBadge(e.punchType)}</td>

                        <td className="p-4 font-mono">
                          {e.scheduledStartTime ? (
                            <div>
                              <p className="text-gray-800">
                                {e.scheduledStartTime} - {e.scheduledEndTime}
                              </p>
                              {e.isEarly && (
                                <span className="text-[10px] text-amber-600 font-bold">EARLY CLOCK-IN</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">Unscheduled</span>
                          )}
                        </td>

                        <td className="p-4">
                          {e.supervisorOverride ? (
                            <div className="bg-amber-50 border border-amber-200 p-2 rounded max-w-xs">
                              <p className="font-bold text-amber-900 text-[11px]">
                                {e.supervisorOverride.supervisorName}
                              </p>
                              <p className="text-[10px] text-amber-800 italic">
                                "{e.supervisorOverride.reason}"
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-[10px]">None</span>
                          )}
                        </td>

                        <td className="p-4 text-center">
                          {e.photoUrl ? (
                            <button
                              onClick={() => setSelectedPhotoUrl(e.photoUrl || null)}
                              className="group relative inline-block rounded overflow-hidden border border-gray-300 shadow-sm"
                            >
                              <img
                                src={e.photoUrl}
                                alt="Snapshot"
                                className="w-10 h-10 object-cover group-hover:scale-110 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                <span className="material-symbols-outlined text-xs">zoom_in</span>
                              </div>
                            </button>
                          ) : (
                            <span className="text-gray-400 text-[10px]">No Photo</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MANUAL CORRECTION MODAL / DRAWER */}
      {selectedRecordForCorrection && (
        <TimesheetCorrectionModal
          record={selectedRecordForCorrection}
          isOpen={Boolean(selectedRecordForCorrection)}
          onClose={() => setSelectedRecordForCorrection(null)}
          onSaved={() => loadData()}
        />
      )}

      {/* FULL KIOSK MODAL OVERLAY */}
      {showKioskModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md overflow-y-auto p-2 sm:p-4 flex flex-col justify-start sm:justify-center items-center">
            <div className="w-full max-w-3xl my-auto py-2">
              <TimeClockKioskView
                isEmbedded={true}
                onClose={() => {
                  setShowKioskModal(false);
                  loadData();
                }}
              />
            </div>
          </div>,
          document.body
        )}

      {/* PHOTO PREVIEW MODAL */}
      {selectedPhotoUrl && (
        <div
          onClick={() => setSelectedPhotoUrl(null)}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="bg-white p-4 rounded-xl max-w-md w-full text-center space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm uppercase text-[#222222]">Anti-Buddy Photo Verification</h3>
              <button onClick={() => setSelectedPhotoUrl(null)} className="text-gray-500 hover:text-black">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <img src={selectedPhotoUrl} alt="High resolution punch capture" className="w-full rounded-lg border object-cover max-h-80" />
            <button
              onClick={() => setSelectedPhotoUrl(null)}
              className="w-full py-2 bg-[#222222] text-white font-bold text-xs uppercase rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Persistent Staff Management Navigation Bar */}
      <StaffManagementQuickLinks activeModule="ledger" onNavigate={onNavigate} />
    </div>
  );
};
