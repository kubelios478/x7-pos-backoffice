//src/components/SaaSDashboard/StatusToggle.tsx
import React from 'react';

export function normalizeStatus(status: string): 'active' | 'inactive' {
  return status === 'active' ? 'active' : 'inactive';
}

interface StatusToggleButtonProps {
  status: string;
  entityLabel: string;
  onClick: () => void;
}

export const StatusToggleButton: React.FC<StatusToggleButtonProps> = ({
  status,
  entityLabel,
  onClick,
}) => {
  const effective = normalizeStatus(status);
  const isActive = effective === 'active';
  const icon = isActive ? 'block' : 'check_circle';
  const label = isActive ? `Deactivate ${entityLabel}` : `Activate ${entityLabel}`;
  const hoverClass = isActive ? 'hover:text-red-600' : 'hover:text-green-600';

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`p-1 transition-colors ${hoverClass}`}
    >
      <span className="material-symbols-outlined text-xl">{icon}</span>
    </button>
  );
};

interface ConfirmStatusToggleDialogProps {
  entityName: string;
  direction: 'activate' | 'deactivate';
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** Optional override for the confirmation body copy. */
  description?: string;
}

export const ConfirmStatusToggleDialog: React.FC<ConfirmStatusToggleDialogProps> = ({
  entityName,
  direction,
  submitting,
  onConfirm,
  onClose,
  description,
}) => {
  const isDeactivate = direction === 'deactivate';
  const title = isDeactivate ? 'DEACTIVATE' : 'ACTIVATE';
  const bodyText =
    description ??
    (isDeactivate
      ? `Deactivating "${entityName}" will set its status to inactive. It will no longer be available for new use, but existing records are preserved.`
      : `Activating "${entityName}" will set its status back to active and make it available for use again.`);
  const buttonIdleLabel = isDeactivate ? 'Deactivate' : 'Activate';
  const buttonBusyLabel = isDeactivate ? 'Deactivating…' : 'Activating…';

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-white/50 hover:text-white transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-sm text-[#1d1c17] leading-relaxed">{bodyText}</p>
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && (
                <span className="material-symbols-outlined text-base animate-spin">
                  progress_activity
                </span>
              )}
              {submitting ? buttonBusyLabel : buttonIdleLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
