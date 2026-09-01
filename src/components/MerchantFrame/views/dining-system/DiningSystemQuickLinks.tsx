import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

export type DiningSystemAnchorKey =
  | 'floor-plans'
  | 'floor-zones'
  | 'tables'
  | 'table-assignments';

interface DiningSystemQuickLinksProps {
  active: DiningSystemAnchorKey;
  onNavigate?: (view: string) => void;
}

// Cada anchor mapea a un featureId de Features.txt que MerchantFrame resuelve vía onNavigate.
// Ojo: la zona usa la key 'floor-zones' pero el featureId real del catálogo es 'table-zones'.
const DINING_ANCHORS: Array<{
  key: DiningSystemAnchorKey;
  label: string;
  featureId: string;
}> = [
  { key: 'floor-plans', label: 'FLOOR PLANS', featureId: 'floor-plans' },
  { key: 'floor-zones', label: 'FLOOR ZONES', featureId: 'table-zones' },
  { key: 'tables', label: 'DINING TABLES', featureId: 'tables' },
  { key: 'table-assignments', label: 'TABLE ASSIGNMENTS', featureId: 'table-assignments' },
];

// Reutiliza el panel común de quick-launch (mismo componente que Accounts Payable y Suppliers).
// El workspace activo se renderiza destacado (aria-current="page", no navegable) en vez de
// ocultarse, para que el usuario siempre vea dónde está dentro del módulo.
export const DiningSystemQuickLinks: React.FC<DiningSystemQuickLinksProps> = ({
  active,
  onNavigate,
}) => {
  const actions: QuickLaunchAction[] = DINING_ANCHORS.map((anchor) => ({
    id: anchor.featureId,
    label: anchor.label,
    active: anchor.key === active,
    onClick: () => onNavigate?.(anchor.featureId),
  }));

  return (
    <nav aria-label="Dining system workspace shortcuts">
      <QuickLaunchPanel
        title="Dining System"
        description="Jump across the dining system workspaces — floor plans, floor zones, dining tables, and table assignments."
        actions={actions}
      />
    </nav>
  );
};

export default DiningSystemQuickLinks;
