import React from 'react';
import { useNavigate } from 'react-router-dom';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../../shared/QuickLaunchPanel';

export type StockQuickLinkAnchorKey =
  | 'raw-materials'
  | 'raw-material-categories'
  | 'recipes'
  | 'purchase-orders'
  | 'locations'
  | 'stock-movements'
  | 'movements'
  | 'journal-entries';

interface StockQuickLinksProps {
  current: StockQuickLinkAnchorKey;
  onNavigate?: (view: string) => void;
}

const STOCK_ANCHORS: Array<{
  key: StockQuickLinkAnchorKey;
  label: string;
  route: string;
  featureId: string;
  icon: string;
}> = [
  {
    key: 'raw-materials',
    label: 'RAW MATERIALS',
    route: '/inventory/raw-materials',
    featureId: 'raw-materials',
    icon: 'inventory_2',
  },
  {
    key: 'raw-material-categories',
    label: 'RM CATEGORIES',
    route: '/dashboard/raw-material-categories',
    featureId: 'raw-material-categories',
    icon: 'category',
  },
  {
    key: 'recipes',
    label: 'RECIPES & BOM',
    route: '/inventory/recipes',
    featureId: 'recipes',
    icon: 'menu_book',
  },
  {
    key: 'purchase-orders',
    label: 'PURCHASE ORDERS',
    route: '/inventory/purchase-orders',
    featureId: 'purchase-orders',
    icon: 'receipt_long',
  },
  {
    key: 'locations',
    label: 'INVENTORY LOCATIONS',
    route: '/inventory/locations',
    featureId: 'locations',
    icon: 'warehouse',
  },
  {
    key: 'stock-movements',
    label: 'STOCK LEVELS',
    route: '/inventory/stocks',
    featureId: 'stock-movements',
    icon: 'table_rows',
  },
  {
    key: 'movements',
    label: 'STOCK MOVEMENTS',
    route: '/inventory/movements',
    featureId: 'movements',
    icon: 'swap_vert',
  },
  {
    key: 'journal-entries',
    label: 'JOURNAL ENTRIES',
    route: '/inventory/journal-entries',
    featureId: 'journal-entries',
    icon: 'auto_stories',
  },
];

export const StockQuickLinks: React.FC<StockQuickLinksProps> = ({
  current,
  onNavigate,
}) => {
  const navigate = useNavigate();

  const actions: QuickLaunchAction[] = STOCK_ANCHORS.map((anchor) => ({
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
    <nav aria-label="Stock workspace quick links hub">
      <QuickLaunchPanel
        title="Quick Launch"
        description="Transition smoothly between raw materials master data, recipes, stock balances, movements and accounting journal entries."
        actions={actions}
      />
    </nav>
  );
};

export default StockQuickLinks;
