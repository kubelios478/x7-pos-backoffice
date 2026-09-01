import React from 'react';
import { useNavigate } from 'react-router-dom';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../../shared/QuickLaunchPanel';

export type KitchenQuickLinkAnchorKey =
  | 'kitchen-stations'
  | 'kitchen-display-devices'
  | 'kitchen-orders'
  | 'kitchen-order-items'
  | 'kitchen-event-log'
  | 'kitchen-analytics';

interface KitchenQuickLinksProps {
  current: KitchenQuickLinkAnchorKey;
  onNavigate?: (view: string) => void;
}

const KITCHEN_ANCHORS: Array<{
  key: KitchenQuickLinkAnchorKey;
  label: string;
  route: string;
  featureId: string;
  icon: string;
}> = [
  {
    key: 'kitchen-stations',
    label: 'KITCHEN STATIONS',
    route: '/kds/stations',
    featureId: 'kitchen-stations',
    icon: 'soup_kitchen',
  },
  {
    key: 'kitchen-display-devices',
    label: 'KDS DEVICES',
    route: '/kds/devices',
    featureId: 'kitchen-display-devices',
    icon: 'desktop_windows',
  },
  {
    key: 'kitchen-orders',
    label: 'KITCHEN ORDERS',
    route: '/kds/orders',
    featureId: 'kitchen-orders',
    icon: 'dinner_dining',
  },
  {
    key: 'kitchen-order-items',
    label: 'ORDER ITEMS',
    route: '/kds/order-items',
    featureId: 'kitchen-order-items',
    icon: 'format_list_bulleted',
  },
  {
    key: 'kitchen-event-log',
    label: 'KDS EVENT LOG',
    route: '/kds/event-log',
    featureId: 'kitchen-event-log',
    icon: 'history',
  },
  {
    key: 'kitchen-analytics',
    label: 'KDS ANALYTICS',
    route: '/kds/analytics',
    featureId: 'kitchen-analytics',
    icon: 'monitoring',
  },
];

export const KitchenQuickLinks: React.FC<KitchenQuickLinksProps> = ({
  current,
  onNavigate,
}) => {
  const navigate = useNavigate();

  const actions: QuickLaunchAction[] = KITCHEN_ANCHORS.map((anchor) => ({
    id: anchor.featureId,
    label: anchor.label,
    icon: anchor.icon,
    active: anchor.key === current,
    onClick: () => {
      if (onNavigate) {
        onNavigate(anchor.featureId);
      } else {
        navigate(anchor.route);
      }
    },
  }));

  return (
    <nav aria-label="Kitchen Display System workspace shortcuts">
      <QuickLaunchPanel
        title="Kitchen & KDS Shortcuts"
        description="Pivot smoothly between Kitchen Stations Directory, Display Devices, Orders Queue, and System Event Logs."
        actions={actions}
      />
    </nav>
  );
};

export default KitchenQuickLinks;
