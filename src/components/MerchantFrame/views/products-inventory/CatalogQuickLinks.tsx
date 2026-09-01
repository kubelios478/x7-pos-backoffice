import React from 'react';
import { useNavigate } from 'react-router-dom';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

export type CatalogQuickLinkAnchorKey =
  | 'products'
  | 'categories'
  | 'modifiers'
  | 'variants';

interface CatalogQuickLinksProps {
  current: CatalogQuickLinkAnchorKey;
  onNavigate?: (view: string) => void;
}

const CATALOG_ANCHORS: Array<{
  key: CatalogQuickLinkAnchorKey;
  label: string;
  route: string;
  featureId: string;
  icon: string;
}> = [
  {
    key: 'products',
    label: 'PRODUCTS',
    route: '/dashboard/products',
    featureId: 'products',
    icon: 'fastfood',
  },
  {
    key: 'categories',
    label: 'PRODUCT CATEGORIES',
    route: '/dashboard/categories',
    featureId: 'categories',
    icon: 'label',
  },
  {
    key: 'modifiers',
    label: 'MODIFIERS & TOPPINGS',
    route: '/dashboard/modifiers',
    featureId: 'modifiers',
    icon: 'tune',
  },
  {
    key: 'variants',
    label: 'VARIANTS & SIZES',
    route: '/dashboard/variants',
    featureId: 'variants',
    icon: 'style',
  },
];

export const CatalogQuickLinks: React.FC<CatalogQuickLinksProps> = ({
  current,
  onNavigate,
}) => {
  const navigate = useNavigate();

  const actions: QuickLaunchAction[] = CATALOG_ANCHORS.map((anchor) => ({
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
    <nav aria-label="Product catalog workspace shortcuts">
      <QuickLaunchPanel
        title="Product Catalog Shortcuts"
        description="Transition seamlessly across POS Menu Products, Categories, Modifiers, and Item Variants."
        actions={actions}
      />
    </nav>
  );
};

export default CatalogQuickLinks;
