import React from 'react';
import {
  ROLE_MATRIX,
  SCOPE_MATRIX,
  type AccessMatrixEntry,
} from '../../../lib/user-directory';
import { AppModal } from '../shared/AppModal';

const MatrixSection: React.FC<{
  title: string;
  entries: AccessMatrixEntry[];
}> = ({ title, entries }) => (
  <section>
    <h4 className="text-label-caps font-bold text-[#5f5e5e] uppercase tracking-widest mb-3">
      {title}
    </h4>
    <div className="space-y-2">
      {entries.map((entry) => (
        <div
          key={entry.key}
          className="p-3 rounded border border-[#e8e2d8] bg-white flex flex-col gap-1"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#1d1c17]">{entry.label}</span>
            <code className="font-mono text-[11px] text-[#5f5e5e] bg-[#f2ede5] px-1.5 py-0.5 rounded">
              {entry.key}
            </code>
          </div>
          <p className="text-body-sm text-secondary">{entry.description}</p>
        </div>
      ))}
    </div>
  </section>
);

type RolesAccessMatrixModalProps = {
  onClose: () => void;
};

export const RolesAccessMatrixModal: React.FC<RolesAccessMatrixModalProps> = ({
  onClose,
}) => {
  return (
    <AppModal
      title="Roles & Access Matrix"
      subtitle="Reference Sheet"
      titleId="roles-access-matrix-title"
      onClose={onClose}
      closeAriaLabel="Close roles and access matrix"
    >
      <div className="p-6 space-y-6 overflow-y-auto flex-1">
        <p className="text-body-sm text-secondary">
          What each security role and access scope is allowed to do across the X7
          platform.
        </p>
        <MatrixSection title="User Roles" entries={ROLE_MATRIX} />
        <MatrixSection title="Access Scopes" entries={SCOPE_MATRIX} />
      </div>
    </AppModal>
  );
};
