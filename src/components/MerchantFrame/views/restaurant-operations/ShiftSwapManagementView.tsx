import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  ShiftSwapRequest,
  ShiftSwapStatus,
  ShiftAssignment,
  Collaborator,
  CollaboratorRole,
} from '../../../../types/shifts';
import {
  fetchShiftSwapRequests,
  approveShiftSwapRequest,
  rejectShiftSwapRequest,
  createShiftSwapRequest,
  fetchShiftAssignments,
  INITIAL_COLLABORATORS,
  calculateProjectedWeeklyHours,
} from '../../../../api/shifts';

export interface ShiftSwapManagementViewProps {
  onNavigate?: (routeOrView: string) => void;
  activeMerchantId?: string;
  currentUser?: { name: string; role: string };
}

export type ViewLayoutMode = 'grid' | 'table';

export const STATUS_CONFIG: Record<
  ShiftSwapStatus,
  { label: string; bg: string; text: string; border: string; icon: string }
> = {
  PENDING_PEER_ACCEPTANCE: {
    label: 'Pending Peer Acceptance',
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-300',
    icon: 'hourglass_top',
  },
  PENDING_SUPERVISOR_APPROVAL: {
    label: 'Pending Manager Sign-Off',
    bg: 'bg-blue-50',
    text: 'text-blue-900',
    border: 'border-blue-300',
    icon: 'supervisor_account',
  },
  PENDING_APPROVAL: {
    label: 'Pending Manager Sign-Off',
    bg: 'bg-blue-50',
    text: 'text-blue-900',
    border: 'border-blue-300',
    icon: 'supervisor_account',
  },
  APPROVED: {
    label: 'Approved & Roster Updated',
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    border: 'border-emerald-400',
    icon: 'task_alt',
  },
  REJECTED: {
    label: 'Rejected',
    bg: 'bg-rose-50',
    text: 'text-rose-900',
    border: 'border-rose-300',
    icon: 'cancel',
  },
  CANCELLED: {
    label: 'Cancelled',
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-300',
    icon: 'remove_circle_outline',
  },
};

export const ShiftSwapManagementView: React.FC<ShiftSwapManagementViewProps> = ({
  onNavigate,
  activeMerchantId = 'merch-main-01',
  currentUser = { name: 'Carlos Mendoza', role: 'Floor Manager' },
}) => {
  const handleNavigate = (target: string) => {
    if (onNavigate) onNavigate(target);
  };
  const [swaps, setSwaps] = useState<ShiftSwapRequest[]>([]);
  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [collaborators] = useState<Collaborator[]>(INITIAL_COLLABORATORS);
  const [loading, setLoading] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Filter & Search Matrix State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<ShiftSwapStatus | 'ALL'>('ALL');
  const [roleFilter, setRoleFilter] = useState<CollaboratorRole | 'ALL'>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [layoutMode, setLayoutMode] = useState<ViewLayoutMode>('grid');

  // Modal States
  const [selectedSwap, setSelectedSwap] = useState<ShiftSwapRequest | null>(null);
  const [rejectingSwap, setRejectingSwap] = useState<ShiftSwapRequest | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);

  // Load datasets
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [swapsData, shiftsData] = await Promise.all([
        fetchShiftSwapRequests({
          merchant_id: activeMerchantId,
          status: statusFilter,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          search: searchQuery || undefined,
        }),
        fetchShiftAssignments(),
      ]);
      setSwaps(swapsData);
      setShifts(shiftsData);
    } catch (err) {
      console.error('Failed to hydrate shift swap workspace data', err);
    } finally {
      setLoading(false);
    }
  }, [activeMerchantId, statusFilter, startDate, endDate, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Filter matrix logic
  const filteredSwaps = useMemo(() => {
    return swaps.filter((swap) => {
      // Status Filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PENDING_SUPERVISOR_APPROVAL') {
          if (swap.status !== 'PENDING_SUPERVISOR_APPROVAL' && swap.status !== 'PENDING_APPROVAL') return false;
        } else if (swap.status !== statusFilter) {
          return false;
        }
      }

      // Role Filter
      if (roleFilter !== 'ALL') {
        if (swap.requiredRole !== roleFilter && swap.requestingCollaboratorRole !== roleFilter) return false;
      }

      // Alphanumeric Search Matrix (Trade ID, Requester, Recipient, Shift ID)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const cleanQuery = q.replace(/^#/, '');
        const matchTradeId = swap.id.toLowerCase().includes(cleanQuery);
        const matchShiftId = swap.shiftId.toLowerCase().includes(cleanQuery);
        const matchRequester = swap.requestingCollaboratorName.toLowerCase().includes(q);
        const matchTarget = swap.targetCollaboratorName.toLowerCase().includes(q);
        const matchReason = swap.reason.toLowerCase().includes(q);

        if (!matchTradeId && !matchShiftId && !matchRequester && !matchTarget && !matchReason) {
          return false;
        }
      }

      // Date Range
      if (startDate && swap.shiftDate < startDate) return false;
      if (endDate && swap.shiftDate > endDate) return false;

      return true;
    });
  }, [swaps, statusFilter, roleFilter, searchQuery, startDate, endDate]);

  // Statistics Summary Metrics
  const metrics = useMemo(() => {
    const total = swaps.length;
    const pendingPeer = swaps.filter((s) => s.status === 'PENDING_PEER_ACCEPTANCE').length;
    const pendingManager = swaps.filter(
      (s) => s.status === 'PENDING_SUPERVISOR_APPROVAL' || s.status === 'PENDING_APPROVAL'
    ).length;
    const approved = swaps.filter((s) => s.status === 'APPROVED').length;
    const rejected = swaps.filter((s) => s.status === 'REJECTED').length;
    return { total, pendingPeer, pendingManager, approved, rejected };
  }, [swaps]);

  // Handle Approve Trade Request
  const handleApprove = async (swap: ShiftSwapRequest) => {
    setActionInProgress(true);
    try {
      const approverId = `${currentUser.name} (${currentUser.role})`;
      await approveShiftSwapRequest(swap.id, approverId);
      showToast(
        `Trade request #${swap.id} approved successfully! Roster updated for ${swap.targetCollaboratorName}.`,
        'success'
      );
      setSelectedSwap(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      showToast(msg, 'error');
    } finally {
      setActionInProgress(false);
    }
  };

  // Handle Reject Trade Request
  const handleConfirmReject = async () => {
    if (!rejectingSwap) return;
    setActionInProgress(true);
    try {
      const rejecterId = `${currentUser.name} (${currentUser.role})`;
      await rejectShiftSwapRequest(rejectingSwap.id, rejectReason || 'Declined by manager policy check', rejecterId);
      showToast(`Trade request #${rejectingSwap.id} rejected.`, 'info');
      setRejectingSwap(null);
      setRejectReason('');
      setSelectedSwap(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rejection failed';
      showToast(msg, 'error');
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-left animate-fade-in pb-12">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          role="status"
          className={`fixed top-5 right-5 z-[10000] px-5 py-3.5 rounded shadow-2xl font-bold text-xs flex items-center gap-3 transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-800 text-white border border-emerald-600'
              : toastMessage.type === 'error'
              ? 'bg-rose-800 text-white border border-rose-600'
              : 'bg-[#222222] text-white border border-gray-700'
          }`}
        >
          <span className="material-symbols-outlined text-lg">
            {toastMessage.type === 'success'
              ? 'check_circle'
              : toastMessage.type === 'error'
              ? 'error'
              : 'info'}
          </span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Workspace Title & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#e8e2d8] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#d51f2c] text-3xl">swap_horiz</span>
            <h1 className="font-black text-2xl text-[#1d1c17] uppercase tracking-tight">
              Shift Swap & Trade Request Workspace
            </h1>
          </div>
          <p className="text-body-sm text-[#5f5e5e] mt-1">
            Review, audit, approve, or reject peer-to-peer shift exchange requests, pre-validate role qualifications and overtime impacts, and automatically update master roster assignments.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleNavigate('/staff-management/schedule/assignments')}
            className="px-3 py-2.5 border border-gray-300 text-gray-700 font-bold text-xs uppercase hover:bg-gray-100 transition-all rounded flex items-center gap-1.5"
            title="View Roster Shift Assignments"
          >
            <span className="material-symbols-outlined text-sm">schedule</span>
            Assignments
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 bg-[#d51f2c] text-white font-bold text-xs uppercase tracking-wider hover:bg-[#ae001a] transition-all rounded shadow-md flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">add_circle</span>
            New Trade Request
          </button>
          <button
            onClick={loadData}
            className="px-3 py-2.5 border border-[#222222] text-[#222222] font-bold text-xs uppercase hover:bg-[#222222] hover:text-white transition-all rounded flex items-center gap-1.5"
            title="Refresh shift swaps dataset"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Metrics Dashboard Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-3.5 bg-white border rounded shadow-sm cursor-pointer transition-all ${
            statusFilter === 'ALL' ? 'border-[#222222] ring-2 ring-[#222222]/20' : 'border-[#e8e2d8] hover:border-gray-400'
          }`}
        >
          <p className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider">Total Trades</p>
          <p className="text-2xl font-black text-[#1d1c17] mt-0.5">{metrics.total}</p>
        </div>

        <div
          onClick={() => setStatusFilter('PENDING_SUPERVISOR_APPROVAL')}
          className={`p-3.5 bg-white border rounded shadow-sm cursor-pointer transition-all ${
            statusFilter === 'PENDING_SUPERVISOR_APPROVAL' ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-[#e8e2d8] hover:border-blue-300'
          }`}
        >
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">Manager Approval</p>
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          </div>
          <p className="text-2xl font-black text-blue-950 mt-0.5">{metrics.pendingManager}</p>
        </div>

        <div
          onClick={() => setStatusFilter('PENDING_PEER_ACCEPTANCE')}
          className={`p-3.5 bg-white border rounded shadow-sm cursor-pointer transition-all ${
            statusFilter === 'PENDING_PEER_ACCEPTANCE' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-[#e8e2d8] hover:border-amber-300'
          }`}
        >
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">Peer Acceptance</p>
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          </div>
          <p className="text-2xl font-black text-amber-950 mt-0.5">{metrics.pendingPeer}</p>
        </div>

        <div
          onClick={() => setStatusFilter('APPROVED')}
          className={`p-3.5 bg-white border rounded shadow-sm cursor-pointer transition-all ${
            statusFilter === 'APPROVED' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-[#e8e2d8] hover:border-emerald-300'
          }`}
        >
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">Approved</p>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
          <p className="text-2xl font-black text-emerald-950 mt-0.5">{metrics.approved}</p>
        </div>

        <div
          onClick={() => setStatusFilter('REJECTED')}
          className={`p-3.5 bg-white border rounded shadow-sm cursor-pointer transition-all ${
            statusFilter === 'REJECTED' ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-[#e8e2d8] hover:border-rose-300'
          }`}
        >
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-bold text-rose-900 uppercase tracking-wider">Rejected</p>
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          </div>
          <p className="text-2xl font-black text-rose-950 mt-0.5">{metrics.rejected}</p>
        </div>
      </div>

      {/* Multi-Filter & Search Matrix Toolbar */}
      <div className="bg-white border border-[#e8e2d8] rounded p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Input */}
          <div className="md:col-span-4 relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-base">
              search
            </span>
            <input
              type="text"
              aria-label="Search trade requests"
              placeholder="Search Trade ID (#SWP-101), Staff Name, Shift ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-[#f8f6f2] border border-[#e8e2d8] rounded text-xs font-semibold focus:outline-none focus:border-[#222222]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <span className="material-symbols-outlined text-sm">cancel</span>
              </button>
            )}
          </div>

          {/* Status Lifecycle Selector */}
          <div className="md:col-span-3">
            <select
              aria-label="Filter by Trade Request Lifecycle Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ShiftSwapStatus | 'ALL')}
              className="w-full py-2 px-3 bg-[#f8f6f2] border border-[#e8e2d8] rounded text-xs font-bold text-[#1d1c17] focus:outline-none focus:border-[#222222]"
            >
              <option value="ALL">ALL STATUSES (Lifecycle State)</option>
              <option value="PENDING_SUPERVISOR_APPROVAL">PENDING MANAGER APPROVAL</option>
              <option value="PENDING_PEER_ACCEPTANCE">PENDING PEER ACCEPTANCE</option>
              <option value="APPROVED">APPROVED (Roster Updated)</option>
              <option value="REJECTED">REJECTED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          {/* Role Filter */}
          <div className="md:col-span-2">
            <select
              aria-label="Filter by Role Qualification"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as CollaboratorRole | 'ALL')}
              className="w-full py-2 px-3 bg-[#f8f6f2] border border-[#e8e2d8] rounded text-xs font-bold text-[#1d1c17] focus:outline-none focus:border-[#222222]"
            >
              <option value="ALL">ALL ROLES</option>
              <option value="Waitstaff">Waitstaff</option>
              <option value="Line Cook">Line Cook</option>
              <option value="Bartender">Bartender</option>
              <option value="Cashier">Cashier</option>
              <option value="Supervisor">Supervisor</option>
            </select>
          </div>

          {/* Layout Mode Toggles */}
          <div className="md:col-span-3 flex justify-end items-center gap-2">
            <span className="text-[11px] font-bold text-[#5f5e5e] uppercase">Layout:</span>
            <button
              onClick={() => setLayoutMode('grid')}
              className={`p-2 rounded border flex items-center gap-1 text-xs font-bold ${
                layoutMode === 'grid'
                  ? 'bg-[#222222] text-white border-[#222222]'
                  : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:bg-gray-50'
              }`}
              title="Trade Cards Grid Layout"
            >
              <span className="material-symbols-outlined text-base">grid_view</span>
              Grid
            </button>
            <button
              onClick={() => setLayoutMode('table')}
              className={`p-2 rounded border flex items-center gap-1 text-xs font-bold ${
                layoutMode === 'table'
                  ? 'bg-[#222222] text-white border-[#222222]'
                  : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:bg-gray-50'
              }`}
              title="Audit Table Grid Layout"
            >
              <span className="material-symbols-outlined text-base">table_rows</span>
              Table
            </button>
          </div>
        </div>

        {/* Date Range Sub-Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#f1ece4] text-xs">
          <span className="font-bold text-[#5f5e5e] uppercase text-[10px]">Filter Date Range:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-[11px]">From:</span>
            <input
              type="date"
              aria-label="Filter Start Date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 bg-[#f8f6f2] border border-[#e8e2d8] rounded text-xs font-semibold"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-[11px]">To:</span>
            <input
              type="date"
              aria-label="Filter End Date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 bg-[#f8f6f2] border border-[#e8e2d8] rounded text-xs font-semibold"
            />
          </div>
          {(startDate || endDate || searchQuery || statusFilter !== 'ALL' || roleFilter !== 'ALL') && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
                setStatusFilter('ALL');
                setRoleFilter('ALL');
              }}
              className="ml-auto text-xs text-[#d51f2c] font-bold hover:underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">filter_alt_off</span>
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Display Content */}
      {loading ? (
        <div className="p-16 bg-white border border-[#e8e2d8] rounded text-center space-y-3">
          <div className="w-8 h-8 border-3 border-[#d51f2c] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-bold text-[#5f5e5e] uppercase tracking-wider">
            Hydrating Shift Trade Request Engine & Relationships...
          </p>
        </div>
      ) : filteredSwaps.length === 0 ? (
        <div className="p-16 bg-white border border-[#e8e2d8] rounded text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-gray-400">find_in_page</span>
          <h3 className="font-black text-lg text-[#1d1c17] uppercase">No Shift Trade Requests Found</h3>
          <p className="text-body-sm text-[#5f5e5e] max-w-md mx-auto">
            No trade requests matched your active filter criteria. Adjust your search parameters or submit a new trade request.
          </p>
        </div>
      ) : layoutMode === 'grid' ? (
        /* GRID CARDS LAYOUT */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSwaps.map((swap) => {
            const statusStyle = STATUS_CONFIG[swap.status] || STATUS_CONFIG.PENDING_APPROVAL;
            const targetCollab = collaborators.find((c) => c.id === swap.targetCollaboratorId);
            const isQualified = targetCollab
              ? targetCollab.role === swap.requiredRole
              : swap.targetCollaboratorRole === swap.requiredRole;

            // Pre-validation: Overtime calculator for recipient
            const projectedWeekly = targetCollab
              ? calculateProjectedWeeklyHours(shifts, targetCollab.id, swap.hours)
              : 0;
            const overtimeProjected = projectedWeekly > 40 ? projectedWeekly - 40 : 0;

            return (
              <div
                key={swap.id}
                className="bg-white border border-[#e8e2d8] rounded shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group"
              >
                {/* Card Top Header */}
                <div className="p-4 border-b border-[#e8e2d8] bg-[#f8f6f2]/60 flex justify-between items-center">
                  <div>
                    <span className="font-mono font-black text-sm text-[#1d1c17] tracking-tight">#{swap.id}</span>
                    <span className="block text-[10px] text-gray-500 font-semibold mt-0.5">
                      Created: {new Date(swap.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                  >
                    <span className="material-symbols-outlined text-xs">{statusStyle.icon}</span>
                    {statusStyle.label}
                  </span>
                </div>

                {/* Card Content Body */}
                <div className="p-4 space-y-4 text-xs">
                  {/* Original Owner & Shift Details */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider block">
                      Original Owner & Shift (#SFT-{swap.shiftId})
                    </span>
                    <div className="p-2.5 bg-[#f8f6f2] border border-[#e8e2d8] rounded flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {swap.requestingAvatarUrl ? (
                          <img
                            src={swap.requestingAvatarUrl}
                            alt={swap.requestingCollaboratorName}
                            className="w-8 h-8 rounded-full object-cover border border-[#e8e2d8]"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#222222] text-white flex items-center justify-center font-bold text-xs">
                            {swap.requestingCollaboratorName[0]}
                          </div>
                        )}
                        <div>
                          <p className="font-black text-[#1d1c17]">{swap.requestingCollaboratorName}</p>
                          <span className="px-1.5 py-0.2 bg-gray-200 text-[#5f5e5e] font-bold text-[9px] rounded uppercase">
                            {swap.requestingCollaboratorRole}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="font-bold text-[#1d1c17]">{swap.shiftDate}</p>
                        <p className="text-[11px] font-semibold text-gray-600">
                          {swap.startTime} - {swap.endTime} ({swap.hours}h)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Transfer Direction Indicator */}
                  <div className="flex items-center justify-center gap-2 text-gray-400 py-0.5">
                    <span className="h-[1px] bg-gray-200 flex-1"></span>
                    <span className="material-symbols-outlined text-sm text-[#d51f2c]">arrow_downward</span>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                      {swap.targetShiftId ? 'Direct 2-Way Swap' : 'Shift Transfer'}
                    </span>
                    <span className="h-[1px] bg-gray-200 flex-1"></span>
                  </div>

                  {/* Proposed Target / Replacement Collaborator */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider block">
                      Proposed Target / Replacement
                    </span>
                    <div className="p-2.5 bg-gray-50 border border-[#e8e2d8] rounded flex items-center justify-between">
                      {swap.targetCollaboratorId ? (
                        <div className="flex items-center gap-2">
                          {swap.targetAvatarUrl ? (
                            <img
                              src={swap.targetAvatarUrl}
                              alt={swap.targetCollaboratorName}
                              className="w-8 h-8 rounded-full object-cover border border-[#e8e2d8]"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-xs">
                              {swap.targetCollaboratorName[0]}
                            </div>
                          )}
                          <div>
                            <p className="font-black text-[#1d1c17]">{swap.targetCollaboratorName}</p>
                            <span className="px-1.5 py-0.2 bg-blue-100 text-blue-900 font-bold text-[9px] rounded uppercase">
                              {swap.targetCollaboratorRole}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-amber-900">
                          <span className="material-symbols-outlined text-amber-600">storefront</span>
                          <div>
                            <p className="font-black text-xs uppercase">Open Marketplace Pool</p>
                            <p className="text-[10px] text-gray-500">Available for eligible staff sign-up</p>
                          </div>
                        </div>
                      )}

                      {swap.targetShiftId && (
                        <div className="text-right">
                          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-900 font-bold text-[9px] rounded uppercase block mb-0.5">
                            Shift Swapped
                          </span>
                          <p className="text-[10px] text-gray-500 font-semibold">{swap.targetShiftDate}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Automated System Pre-Validation Badges */}
                  <div className="pt-2 space-y-1.5">
                    {/* Role Qualification Check */}
                    <div className="flex items-center justify-between p-2 rounded bg-[#f8f6f2] border border-[#e8e2d8]">
                      <span className="text-[10px] font-bold text-[#5f5e5e] uppercase">Role Certification:</span>
                      {isQualified ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[10px] rounded flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-emerald-700">check_circle</span>
                          ✓ Qualified Role ({swap.requiredRole})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-900 border border-rose-300 font-bold text-[10px] rounded flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-rose-700">warning</span>
                          ⚠️ Unqualified Role
                        </span>
                      )}
                    </div>

                    {/* Overtime Risk Warning */}
                    {overtimeProjected > 0 && (
                      <div className="p-2 bg-amber-50 border border-amber-300 rounded text-amber-950 flex items-center justify-between text-[11px] font-bold">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-amber-600 text-base">schedule</span>
                          <span>Overtime Warning</span>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded font-black text-[10px]">
                          +{overtimeProjected.toFixed(1)}h OT (Proj: {projectedWeekly.toFixed(1)}h)
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Rationale Quote */}
                  <p className="text-gray-600 italic text-[11px] bg-gray-50 p-2 rounded border border-[#e8e2d8] truncate" title={swap.reason}>
                    "{swap.reason}"
                  </p>

                  {/* Audit details if approved or rejected */}
                  {swap.approvedBy && (
                    <div className="text-[10px] text-emerald-800 font-semibold bg-emerald-50/50 p-1.5 rounded border border-emerald-200">
                      Approved by <strong>{swap.approvedBy}</strong> at {new Date(swap.approvedAt || '').toLocaleString()}
                    </div>
                  )}
                  {swap.rejectedBy && (
                    <div className="text-[10px] text-rose-800 font-semibold bg-rose-50/50 p-1.5 rounded border border-rose-200">
                      Rejected by <strong>{swap.rejectedBy}</strong>: {swap.rejectionReason}
                    </div>
                  )}
                </div>

                {/* Card Action Controls Footer */}
                <div className="p-4 border-t border-[#e8e2d8] bg-gray-50 flex justify-between items-center gap-2">
                  <button
                    onClick={() => setSelectedSwap(swap)}
                    className="px-3 py-1.5 border border-gray-300 hover:border-[#222222] text-[#222222] font-bold text-[11px] uppercase rounded transition-colors"
                  >
                    Details & Audit
                  </button>

                  {(swap.status === 'PENDING_SUPERVISOR_APPROVAL' || swap.status === 'PENDING_APPROVAL' || swap.status === 'PENDING_PEER_ACCEPTANCE') && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setRejectingSwap(swap);
                          setRejectReason('');
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] uppercase rounded transition-colors shadow-sm"
                      >
                        REJECT
                      </button>
                      <button
                        onClick={() => handleApprove(swap)}
                        disabled={actionInProgress}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] uppercase rounded transition-colors shadow-sm flex items-center gap-1"
                      >
                        {actionInProgress && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                        APPROVE
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* AUDIT TABLE LAYOUT */
        <div className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs min-w-[950px]">
              <thead>
                <tr className="bg-[#222222] text-white">
                  <th className="p-3.5 font-black uppercase tracking-wider">Trade ID</th>
                  <th className="p-3.5 font-black uppercase tracking-wider">Requester (Original)</th>
                  <th className="p-3.5 font-black uppercase tracking-wider">Target / Recipient</th>
                  <th className="p-3.5 font-black uppercase tracking-wider">Shift Schedule</th>
                  <th className="p-3.5 font-black uppercase tracking-wider">Pre-Validations</th>
                  <th className="p-3.5 font-black uppercase tracking-wider">Status</th>
                  <th className="p-3.5 font-black uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {filteredSwaps.map((swap) => {
                  const statusStyle = STATUS_CONFIG[swap.status] || STATUS_CONFIG.PENDING_APPROVAL;
                  const targetCollab = collaborators.find((c) => c.id === swap.targetCollaboratorId);
                  const isQualified = targetCollab
                    ? targetCollab.role === swap.requiredRole
                    : swap.targetCollaboratorRole === swap.requiredRole;

                  return (
                    <tr key={swap.id} className="hover:bg-[#f8f6f2]/80 transition-colors">
                      <td className="p-3.5 font-mono font-black text-[#1d1c17]">#{swap.id}</td>
                      <td className="p-3.5 font-bold text-[#1d1c17]">
                        <div className="flex items-center gap-2">
                          <span>{swap.requestingCollaboratorName}</span>
                          <span className="px-1.5 py-0.2 bg-gray-100 text-[#5f5e5e] font-bold text-[9px] rounded uppercase">
                            {swap.requestingCollaboratorRole}
                          </span>
                        </div>
                      </td>
                      <td className="p-3.5 font-bold text-[#1d1c17]">
                        {swap.targetCollaboratorId ? (
                          <div className="flex items-center gap-2">
                            <span>{swap.targetCollaboratorName}</span>
                            <span className="px-1.5 py-0.2 bg-blue-100 text-blue-900 font-bold text-[9px] rounded uppercase">
                              {swap.targetCollaboratorRole}
                            </span>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-bold text-[10px] rounded uppercase">
                            Open Pool
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-[#1d1c17] font-semibold">
                        <div>{swap.shiftDate}</div>
                        <div className="text-[11px] text-gray-500 font-normal">
                          {swap.startTime} - {swap.endTime} ({swap.hours}h)
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="flex flex-col gap-1">
                          {isQualified ? (
                            <span className="text-emerald-700 font-bold text-[10px]">✓ Role Qualified</span>
                          ) : (
                            <span className="text-rose-600 font-bold text-[10px]">⚠️ Role Mismatch</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                        >
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        <button
                          onClick={() => setSelectedSwap(swap)}
                          className="px-2.5 py-1 bg-gray-200 hover:bg-gray-300 text-[#1d1c17] font-bold text-[10px] uppercase rounded"
                        >
                          Audit Log
                        </button>
                        {(swap.status === 'PENDING_SUPERVISOR_APPROVAL' || swap.status === 'PENDING_APPROVAL' || swap.status === 'PENDING_PEER_ACCEPTANCE') && (
                          <button
                            onClick={() => handleApprove(swap)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase rounded"
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DETAILED SWAP REVIEW & AUDIT MODAL */}
      {selectedSwap && (
        <div className="fixed inset-0 bg-black/65 z-[9999] flex justify-center items-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in text-left font-sans">
            <div className="bg-[#222222] p-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#d51f2c]">fact_check</span>
                <h3 className="font-black text-sm uppercase tracking-wider">
                  Trade Request Audit Panel — #{selectedSwap.id}
                </h3>
              </div>
              <button onClick={() => setSelectedSwap(null)} className="text-white/70 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 space-y-5 text-sm text-[#1d1c17]">
              {/* Status Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#e8e2d8]">
                <div>
                  <span className="text-[10px] font-bold text-[#5f5e5e] uppercase">Tenant Scope / Merchant ID</span>
                  <p className="font-mono font-bold text-xs">{selectedSwap.merchantId || activeMerchantId}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#5f5e5e] uppercase">Shift Date & Hours</span>
                  <p className="font-bold text-xs">{selectedSwap.shiftDate} ({selectedSwap.startTime} - {selectedSwap.endTime})</p>
                </div>
                <span
                  className={`px-3 py-1 text-xs font-black rounded uppercase border ${
                    STATUS_CONFIG[selectedSwap.status]?.bg || 'bg-gray-100'
                  } ${STATUS_CONFIG[selectedSwap.status]?.text || 'text-gray-800'}`}
                >
                  {STATUS_CONFIG[selectedSwap.status]?.label || selectedSwap.status}
                </span>
              </div>

              {/* Transfers Side-by-Side */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-[#f8f6f2] border border-[#e8e2d8] rounded space-y-2">
                  <span className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider block">Original Owner (Requester)</span>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-[#222222] text-white flex items-center justify-center font-black text-xs">
                      {selectedSwap.requestingCollaboratorName[0]}
                    </div>
                    <div>
                      <h4 className="font-black text-sm">{selectedSwap.requestingCollaboratorName}</h4>
                      <p className="text-xs text-gray-500 font-semibold">{selectedSwap.requestingCollaboratorRole}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-[#f8f6f2] border border-[#e8e2d8] rounded space-y-2">
                  <span className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider block">Proposed Replacement</span>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-blue-900 text-white flex items-center justify-center font-black text-xs">
                      {selectedSwap.targetCollaboratorName[0] || 'O'}
                    </div>
                    <div>
                      <h4 className="font-black text-sm">{selectedSwap.targetCollaboratorName}</h4>
                      <p className="text-xs text-gray-500 font-semibold">{selectedSwap.targetCollaboratorRole}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rationale */}
              <div>
                <span className="text-[10px] font-bold text-[#5f5e5e] uppercase block mb-1">Transfer Rationale</span>
                <p className="p-3 bg-gray-50 border border-[#e8e2d8] rounded text-xs italic text-gray-700">
                  "{selectedSwap.reason}"
                </p>
              </div>

              {/* Audit Log Trail */}
              <div className="p-3.5 bg-gray-100 border border-gray-300 rounded space-y-1 text-xs">
                <span className="font-black text-[10px] text-[#5f5e5e] uppercase block">Audit Log Trail</span>
                <p>Created: <strong>{new Date(selectedSwap.createdAt).toLocaleString()}</strong></p>
                {selectedSwap.approvedBy && (
                  <p className="text-emerald-800 font-bold">
                    Approved by: <strong>{selectedSwap.approvedBy}</strong> on {new Date(selectedSwap.approvedAt || '').toLocaleString()}
                  </p>
                )}
                {selectedSwap.rejectedBy && (
                  <p className="text-rose-800 font-bold">
                    Rejected by: <strong>{selectedSwap.rejectedBy}</strong> on {new Date(selectedSwap.rejectedAt || '').toLocaleString()} (Reason: {selectedSwap.rejectionReason})
                  </p>
                )}
              </div>

              {/* Actions Footer */}
              <div className="pt-4 border-t border-[#e8e2d8] flex justify-between items-center">
                <button
                  onClick={() => setSelectedSwap(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 font-bold text-xs uppercase rounded hover:bg-gray-100"
                >
                  Close
                </button>

                {(selectedSwap.status === 'PENDING_SUPERVISOR_APPROVAL' || selectedSwap.status === 'PENDING_APPROVAL' || selectedSwap.status === 'PENDING_PEER_ACCEPTANCE') && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setRejectingSwap(selectedSwap);
                        setRejectReason('');
                      }}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase rounded"
                    >
                      REJECT TRADE
                    </button>
                    <button
                      onClick={() => handleApprove(selectedSwap)}
                      disabled={actionInProgress}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase rounded shadow-md flex items-center gap-1.5"
                    >
                      {actionInProgress && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                      APPROVE TRADE
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY REJECTION RATIONALE MODAL */}
      {rejectingSwap && (
        <div className="fixed inset-0 bg-black/70 z-[10000] flex justify-center items-center p-4">
          <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md p-6 space-y-4 text-left font-sans animate-fade-in">
            <h4 className="font-black text-sm uppercase tracking-wider text-[#222222] flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-600 text-base">block</span>
              Mandatory Rejection Rationale
            </h4>
            <p className="text-xs text-[#5f5e5e]">
              Provide a rationale for rejecting shift swap request <strong className="font-mono">#{rejectingSwap.id}</strong>.
            </p>

            <textarea
              aria-label="Rejection Reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="E.g., Target collaborator lacks Waitstaff certification or creates overtime breach..."
              className="w-full p-3 border border-[#e8e2d8] rounded text-xs focus:outline-none focus:border-rose-600"
              required
            />

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setRejectReason('Overtime threshold policy breach (>40h limit)')}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-bold rounded text-gray-700"
              >
                + Overtime Breach
              </button>
              <button
                onClick={() => setRejectReason('Lack of required role certification')}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-bold rounded text-gray-700"
              >
                + Role Mismatch
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e2d8]">
              <button
                onClick={() => setRejectingSwap(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 font-bold text-xs uppercase rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={actionInProgress || !rejectReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase rounded disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW TRADE REQUEST MODAL */}
      {showCreateModal && (
        <CreateTradeModal
          collaborators={collaborators}
          shifts={shifts}
          activeMerchantId={activeMerchantId}
          onClose={() => setShowCreateModal(false)}
          onCreated={async (newSwap) => {
            showCreateModal && setShowCreateModal(false);
            showToast(`New trade request #${newSwap.id} created successfully!`, 'success');
            await loadData();
          }}
        />
      )}
    </div>
  );
};

interface CreateTradeModalProps {
  collaborators: Collaborator[];
  shifts: ShiftAssignment[];
  activeMerchantId: string;
  onClose: () => void;
  onCreated: (swap: ShiftSwapRequest) => void;
}

const CreateTradeModal: React.FC<CreateTradeModalProps> = ({
  collaborators,
  shifts,
  activeMerchantId,
  onClose,
  onCreated,
}) => {
  const [requesterId, setRequesterId] = useState<string>(collaborators[0]?.id || '');
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>(collaborators[1]?.id || '');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const requester = collaborators.find((c) => c.id === requesterId);
  const target = collaborators.find((c) => c.id === targetId);

  // Available shifts for chosen requester
  const requesterShifts = useMemo(() => {
    return shifts.filter((s) => s.collaboratorId === requesterId);
  }, [shifts, requesterId]);

  const activeShift = shifts.find((s) => s.id === selectedShiftId) || requesterShifts[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requester || !activeShift) return;
    setSubmitting(true);

    try {
      const created = await createShiftSwapRequest({
        merchantId: activeMerchantId,
        shiftId: activeShift.id,
        requestingCollaboratorId: requester.id,
        requestingCollaboratorName: requester.name,
        requestingCollaboratorRole: requester.role,
        requestingAvatarUrl: requester.avatarUrl,
        targetCollaboratorId: target?.id || '',
        targetCollaboratorName: target?.name || 'Open Marketplace Pool',
        targetCollaboratorRole: target?.role || requester.role,
        targetAvatarUrl: target?.avatarUrl,
        shiftDate: activeShift.date,
        startTime: activeShift.startTime,
        endTime: activeShift.endTime,
        requiredRole: activeShift.role || requester.role,
        hours: activeShift.hours || 8,
        reason: reason || 'Peer shift swap request',
      });
      onCreated(created);
    } catch (err) {
      console.error('Failed to submit trade request', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/65 z-[10000] flex justify-center items-center p-4 backdrop-blur-sm">
      <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in text-left font-sans">
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#d51f2c]">add_circle</span>
            <h3 className="font-black text-sm uppercase tracking-wider">
              Create Shift Swap / Trade Request
            </h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs text-[#1d1c17]">
          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              Requesting Collaborator (Shift Owner)
            </label>
            <select
              aria-label="Requesting Collaborator"
              value={requesterId}
              onChange={(e) => {
                setRequesterId(e.target.value);
                setSelectedShiftId('');
              }}
              className="w-full p-2.5 bg-[#f8f6f2] border border-[#e8e2d8] rounded font-semibold text-sm focus:outline-none focus:border-[#222222]"
            >
              {collaborators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — [{c.role}] ({c.department})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              Select Shift to Swap
            </label>
            <select
              aria-label="Select Shift to Swap"
              value={selectedShiftId || activeShift?.id || ''}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              className="w-full p-2.5 bg-[#f8f6f2] border border-[#e8e2d8] rounded font-semibold text-sm focus:outline-none focus:border-[#222222]"
            >
              {requesterShifts.length === 0 ? (
                <option value="">No shifts assigned to this collaborator</option>
              ) : (
                requesterShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    #SFT-{s.id} | {s.date} ({s.startTime} - {s.endTime}) — {s.presetName} ({s.hours}h)
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              Replacement Target / Coworker
            </label>
            <select
              aria-label="Replacement Target Coworker"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full p-2.5 bg-[#f8f6f2] border border-[#e8e2d8] rounded font-semibold text-sm focus:outline-none focus:border-[#222222]"
            >
              <option value="">Open Marketplace Pool (No specific coworker)</option>
              {collaborators
                .filter((c) => c.id !== requesterId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — [{c.role}] ({c.department})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              Trade Rationale / Reason
            </label>
            <textarea
              aria-label="Trade Rationale"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="E.g., Medical appointment, agreed shift exchange..."
              className="w-full p-2.5 bg-[#f8f6f2] border border-[#e8e2d8] rounded font-semibold focus:outline-none focus:border-[#222222]"
              required
            />
          </div>

          <div className="pt-4 border-t border-[#e8e2d8] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 font-bold text-xs uppercase rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !activeShift}
              className="px-5 py-2 bg-[#d51f2c] text-white font-bold text-xs uppercase rounded shadow-md disabled:opacity-50"
            >
              Submit Trade Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShiftSwapManagementView;
