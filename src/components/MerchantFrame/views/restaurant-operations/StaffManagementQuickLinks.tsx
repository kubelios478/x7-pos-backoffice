import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

export type StaffManagementModuleKey =
  | 'roster'
  | 'assignments'
  | 'swaps'
  | 'ledger'
  | 'kiosk'
  | '/staff-management/schedule/roster'
  | '/staff-management/schedule/assignments'
  | '/staff-management/schedule/swaps'
  | '/staff-management/attendance/ledger'
  | '/staff-management/attendance/kiosk'
  | string;

interface StaffManagementQuickLinksProps {
  activeModule?: StaffManagementModuleKey;
  onNavigate?: (viewOrRoute: string) => void;
}

export interface StaffShortcutAnchor {
  key: string;
  route: string;
  label: string;
  icon: string;
}

export const STAFF_SHORTCUT_ANCHORS: StaffShortcutAnchor[] = [
  {
    key: 'my-schedule',
    route: '/staff-management/schedule/me',
    label: 'MY SCHEDULE',
    icon: 'calendar_month',
  },
  {
    key: 'shifts',
    route: '/staff-management/schedule/shifts',
    label: 'WEEKLY MATRIX',
    icon: 'grid_on',
  },
  {
    key: 'daily-timeline',
    route: '/staff-management/schedule/daily',
    label: 'DAILY TIMELINE',
    icon: 'view_day',
  },
  {
    key: 'roster',
    route: '/staff-management/schedule/roster',
    label: 'MONTHLY ROSTER',
    icon: 'calendar_month',
  },
  {
    key: 'swaps',
    route: '/staff-management/schedule/swaps',
    label: 'SHIFT SWAPS',
    icon: 'swap_horiz',
  },
  {
    key: 'ledger',
    route: '/staff-management/attendance/ledger',
    label: 'ATTENDANCE LEDGER',
    icon: 'fact_check',
  },
  {
    key: 'tips-ledger',
    route: '/store-operations/tips-ledger',
    label: 'TIPS LEDGER',
    icon: 'payments',
  },
  {
    key: 'kiosk',
    route: '/staff-management/attendance/kiosk',
    label: 'TIME CLOCK KIOSK',
    icon: 'touch_app',
  },
];

export const StaffManagementQuickLinks: React.FC<StaffManagementQuickLinksProps> = ({
  activeModule = 'ledger',
  onNavigate,
}) => {
  const actions: QuickLaunchAction[] = STAFF_SHORTCUT_ANCHORS.map((anchor) => {
    const isActive =
      activeModule === anchor.key ||
      activeModule === anchor.route ||
      ((activeModule === 'my-schedule' || activeModule === 'personal-schedule' || activeModule === 'collaborator-schedule') && anchor.key === 'my-schedule') ||
      ((activeModule === 'staff-roster' || activeModule === 'roster' || activeModule === 'monthly') && anchor.key === 'roster') ||
      ((activeModule === 'shift-assignment' || activeModule === 'assignments' || activeModule === 'shifts' || activeModule === 'weekly') && anchor.key === 'shifts') ||
      ((activeModule === 'daily-timeline' || activeModule === 'daily' || activeModule === 'timeline') && anchor.key === 'daily-timeline') ||
      ((activeModule === 'staff-swaps' || activeModule === 'swaps') && anchor.key === 'swaps') ||
      ((activeModule === 'collaborators-time-entries' || activeModule === 'time-entries' || activeModule === 'ledger' || activeModule === 'attendance-ledger') && anchor.key === 'ledger') ||
      ((activeModule === 'tips-ledger' || activeModule === 'tips') && anchor.key === 'tips-ledger') ||
      ((activeModule === 'time-clock-kiosk' || activeModule === 'time-clock' || activeModule === 'kiosk') && anchor.key === 'kiosk');

    return {
      id: anchor.key,
      label: anchor.label,
      icon: anchor.icon,
      active: isActive,
      onClick: () => {
        onNavigate?.(anchor.route);
      },
    };
  });

  return (
    <nav
      aria-label="Staff management quick launch shortcuts"
      className="mt-8 border-t border-gray-800/60 pt-6"
    >
      <QuickLaunchPanel
        title="Staff Scheduling & Attendance Shortcuts"
        description="Seamlessly pivot across Roster Matrix, Shift Assignments, Swaps, Attendance Ledger, and Time Clock Kiosk modules."
        actions={actions}
      />
    </nav>
  );
};

export default StaffManagementQuickLinks;
