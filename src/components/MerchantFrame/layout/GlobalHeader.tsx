import React, { useEffect, useState } from 'react';
import type { UserProfile, SystemNotification } from '../../../services/restaurantService';
import type { NavCategory } from '../../../services/navigationService';
import logoX7 from '../../../assets/logo-x7.png';

interface GlobalHeaderProps {
  activeTab: string;
  activeCategory: string;
  refreshTrigger: number;
  navCategories: NavCategory[];
  notifications: SystemNotification[];
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onLogoClick: () => void;
  onSelectFeature?: (featureId: string, categoryId?: string) => void;
  onMenuSearchChange?: (query: string) => void;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({
  activeTab,
  activeCategory,
  refreshTrigger,
  navCategories,
  notifications,
  showNotifications,
  setShowNotifications,
  isSidebarCollapsed,
  onToggleSidebar,
  onLogoClick,
  onSelectFeature,
  onMenuSearchChange,
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tier, setTier] = useState<string>('');

  // Estado para la Lupa de Búsqueda Desplegable en el Menú Lateral / Header
  const [isMenuSearchOpen, setIsMenuSearchOpen] = useState<boolean>(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState<string>('');

  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  useEffect(() => {
    if (isSidebarCollapsed) {
      setIsMenuSearchOpen(false);
      setMenuSearchQuery('');
      onMenuSearchChange('');
    }
  }, [isSidebarCollapsed]);

  // Lista estandarizada de todas las funcionalidades del backoffice para búsqueda rápida
  const ALL_BACKOFFICE_FEATURES: Array<{ id: string; name: string; categoryId: string; categoryName: string }> = [
    { id: 'products', name: 'Products Catalog', categoryId: 'catalog', categoryName: 'POS Product Catalog' },
    { id: 'categories', name: 'Product Categories', categoryId: 'catalog', categoryName: 'POS Product Catalog' },
    { id: 'modifiers', name: 'Product Modifiers', categoryId: 'catalog', categoryName: 'POS Product Catalog' },
    { id: 'variants', name: 'Product Variants', categoryId: 'catalog', categoryName: 'POS Product Catalog' },
    { id: 'raw-materials', name: 'Raw Materials Workspace', categoryId: 'inventory', categoryName: 'Products & Inventory System' },
    { id: 'raw-material-categories', name: 'Raw Material Categories', categoryId: 'inventory', categoryName: 'Products & Inventory System' },
    { id: 'recipes', name: 'Product Recipes (BOM)', categoryId: 'inventory', categoryName: 'Products & Inventory System' },
    { id: 'purchase-orders', name: 'Purchase Orders', categoryId: 'inventory', categoryName: 'Products & Inventory System' },
    { id: 'locations', name: 'Inventory Locations', categoryId: 'inventory', categoryName: 'Products & Inventory System' },
    { id: 'stock-movements', name: 'Stock & Inventory Control', categoryId: 'inventory', categoryName: 'Products & Inventory System' },
    { id: 'movements', name: 'Inventory Movements Log', categoryId: 'inventory', categoryName: 'Products & Inventory System' },
    { id: 'inventory-journal-lines', name: 'Inventory Journal Lines', categoryId: 'inventory', categoryName: 'Products & Inventory System' },
    { id: 'kitchen-stations', name: 'Kitchen Stations routing', categoryId: 'restaurant-operations', categoryName: 'Restaurant Operations' },
    { id: 'kitchen-display-devices', name: 'KDS Display Devices Inventory', categoryId: 'restaurant-operations', categoryName: 'Restaurant Operations' },
    { id: 'floor-plans', name: 'Floor Plans Workspace', categoryId: 'restaurant-operations', categoryName: 'Restaurant Operations' },
    { id: 'table-zones', name: 'Floor Zones', categoryId: 'restaurant-operations', categoryName: 'Restaurant Operations' },
    { id: 'tables', name: 'Dining Tables', categoryId: 'restaurant-operations', categoryName: 'Restaurant Operations' },
    { id: 'table-assignments', name: 'Table Assignments', categoryId: 'restaurant-operations', categoryName: 'Restaurant Operations' },
    { id: 'cash-drawers', name: 'Cash Drawers', categoryId: 'restaurant-operations', categoryName: 'Restaurant Operations' },
    { id: 'cash-shifts', name: 'Cash Shifts', categoryId: 'restaurant-operations', categoryName: 'Restaurant Operations' },
    { id: 'cash-movements', name: 'Cash Movements', categoryId: 'restaurant-operations', categoryName: 'Restaurant Operations' },
    { id: 'cash-transactions', name: 'Cash Transactions Log', categoryId: 'restaurant-operations', categoryName: 'Restaurant Operations' },
    { id: 'ledger-accounts', name: 'Chart of Accounts (Ledger)', categoryId: 'financial-engine', categoryName: 'Financial Engine' },
    { id: 'journal-entries', name: 'General Journal Entries', categoryId: 'financial-engine', categoryName: 'Financial Engine' },
    { id: 'journal-entries-lines', name: 'Posting Journal Lines', categoryId: 'financial-engine', categoryName: 'Financial Engine' },
    { id: 'merchant-tax-rules', name: 'Tax Rules Configuration', categoryId: 'configurations', categoryName: 'Merchant Configuration' },
    { id: 'merchant-tips-rules', name: 'Tips Management Rules', categoryId: 'configurations', categoryName: 'Merchant Configuration' },
    { id: 'merchant-overtime-rules', name: 'Overtime Rules', categoryId: 'configurations', categoryName: 'Merchant Configuration' },
    { id: 'merchant-payroll-rules', name: 'Payroll Rules', categoryId: 'configurations', categoryName: 'Merchant Configuration' },
    { id: 'suppliers', name: 'Master Suppliers', categoryId: 'accounts-payable', categoryName: 'Accounts Payable' },
    { id: 'supplier-invoices', name: 'Supplier Invoices', categoryId: 'accounts-payable', categoryName: 'Accounts Payable' },
    { id: 'supplier-credit-notes', name: 'Supplier Credit Notes', categoryId: 'accounts-payable', categoryName: 'Accounts Payable' },
    { id: 'supplier-payments', name: 'Supplier Payments', categoryId: 'accounts-payable', categoryName: 'Accounts Payable' },
    { id: 'merchant-directory', name: 'Merchant Directory', categoryId: 'saas', categoryName: 'Platform SaaS' },
    { id: 'user-management', name: 'User Management', categoryId: 'saas', categoryName: 'Platform SaaS' },
    { id: 'company-profile', name: 'Company Profile', categoryId: 'saas', categoryName: 'Platform SaaS' },
    { id: 'company-configurations', name: 'Company Configurations', categoryId: 'saas', categoryName: 'Platform SaaS' },
  ];

  const menuSearchResults = menuSearchQuery.trim() === '' ? [] : ALL_BACKOFFICE_FEATURES.filter(item =>
    item.name.toLowerCase().includes(menuSearchQuery.toLowerCase()) ||
    item.id.toLowerCase().includes(menuSearchQuery.toLowerCase()) ||
    item.categoryName.toLowerCase().includes(menuSearchQuery.toLowerCase())
  );

  useEffect(() => {
    const fetchHeaderData = async () => {
      try {
        const [profileRes, tierRes] = await Promise.all([
          fetch(`${API_BASE}/v1/auth/profile`).then(r => r.json()),
          fetch(`${API_BASE}/v1/establishments/tier`).then(r => r.json())
        ]);
        setProfile(profileRes);
        setTier(tierRes.tier);
      } catch (err) {
        console.error('Error fetching header data:', err);
      }
    };

    fetchHeaderData();
  }, [refreshTrigger]);

  // Resolver breadcrumbs y títulos de manera reactiva y dinámica desde navCategories
  let parentAppName = '';
  let activeFeatureName = '';

  // 1. Intentar resolver parentAppName y activeFeatureName dinámicamente desde navCategories buscando por activeTab
  if (navCategories.length > 0) {
    for (const cat of navCategories) {
      for (const app of cat.applications) {
        const feat = app.features.find(f => f.id === activeTab);
        if (feat) {
          parentAppName = cat.name || app.name;
          activeFeatureName = feat.name;
          break;
        }
        if (app.id === activeTab) {
          parentAppName = cat.name;
          activeFeatureName = app.name;
          break;
        }
      }
      if (parentAppName) break;
    }
  }

  // Lista de pestañas por dominio para mapear el Breadcrumb de forma 100% precisa e inmune a clics de acordeón
  const restaurantOpsTabs = [
    'kitchen-stations',
    'kitchen-display-devices',
    'kitchen-orders',
    'kitchen-order-items',
    'kitchen-event-log',
    'kitchen-analytics',
    'kitchen-kds-hub',
    'kds-dashboard',
    'floor-plans',
    'table-zones',
    'tables',
    'table-assignments',
    'cash-drawers',
    'cash-shifts',
    'cash-movements',
    'cash-transactions',
  ];

  const productsInventoryTabs = [
    'products',
    'categories',
    'variants',
    'modifiers',
    'recipes',
    'raw-materials',
    'raw-material-categories',
    'stock-movements',
    'movements',
    'locations',
    'purchase-orders',
    'inventory-journal-lines',
  ];

  const accountsPayableTabs = [
    'suppliers',
    'supplier-invoices',
    'supplier-invoice-items',
    'supplier-credit-notes',
    'supplier-payments',
    'supplier-payment-items',
    'supplier-payments-allocation',
  ];

  const financialEngineTabs = [
    'ledger-accounts',
    'journal-entries',
    'journal-entries-lines',
  ];

  const ruleConfigTabs = [
    'merchant-tax-rules',
    'merchant-tips-rules',
    'merchant-overtime-rules',
    'merchant-payroll-rules',
  ];

  const saasTabs = [
    'merchant-directory',
    'user-management',
    'company-profile',
    'company-configurations',
    'saas-dashboard',
  ];

  // Forzar la categoría padre real según la vista abierta (activeTab)
  if (restaurantOpsTabs.includes(activeTab)) {
    parentAppName = 'Restaurant Operations';
  } else if (productsInventoryTabs.includes(activeTab)) {
    parentAppName = 'Products & Inventory System';
  } else if (accountsPayableTabs.includes(activeTab)) {
    parentAppName = 'Accounts Payable';
  } else if (financialEngineTabs.includes(activeTab)) {
    parentAppName = 'Financial Engine';
  } else if (ruleConfigTabs.includes(activeTab)) {
    parentAppName = 'Rule Configuration';
  } else if (saasTabs.includes(activeTab)) {
    parentAppName = 'Platform SaaS';
  } else if (activeTab === 'dashboard') {
    parentAppName = 'CORE';
  } else if (!parentAppName) {
    parentAppName = 'SYSTEM';
  }

  // Fallback de nombres de features si no vinieron en navCategories
  if (!activeFeatureName) {
    if (activeTab === 'products') activeFeatureName = 'Products';
    else if (activeTab === 'categories') activeFeatureName = 'Categories';
    else if (activeTab === 'variants') activeFeatureName = 'Product Variants';
    else if (activeTab === 'modifiers') activeFeatureName = 'Product Modifiers';
    else if (activeTab === 'recipes') activeFeatureName = 'Product Recipes (BOM)';
    else if (activeTab === 'raw-materials') activeFeatureName = 'Raw Materials Workspace';
    else if (activeTab === 'raw-material-categories') activeFeatureName = 'Raw Material Categories';
    else if (activeTab === 'stock-movements') activeFeatureName = 'Stock & Inventory Control';
    else if (activeTab === 'movements') activeFeatureName = 'Inventory Movements Log';
    else if (activeTab === 'locations') activeFeatureName = 'Inventory Locations';
    else if (activeTab === 'purchase-orders') activeFeatureName = 'Purchase Orders';
    else if (activeTab === 'suppliers') activeFeatureName = 'Master Suppliers';
    else if (activeTab === 'kds-dashboard' || activeTab === 'kitchen-kds-hub') activeFeatureName = 'KDS Command Hub';
    else if (activeTab === 'kitchen-stations') activeFeatureName = 'Kitchen Stations Directory';
    else if (activeTab === 'kitchen-display-devices') activeFeatureName = 'KDS Display Devices Inventory';
    else activeFeatureName = activeTab.replace(/-/g, ' ').toUpperCase();
  }




  // Friendly title para el Headline h2
  let friendlyTitle = activeFeatureName;
  if (activeTab === 'dashboard') {
    friendlyTitle = 'Restaurant Dashboard';
  } else if (activeTab === 'saas-dashboard') {
    friendlyTitle = 'Platform SaaS / Overview';
  } else if (activeTab === 'categories') {
    friendlyTitle = 'Categories';
  } else if (activeTab === 'products') {
    friendlyTitle = 'Products';
  } else if (activeTab === 'stock-movements') {
    friendlyTitle = 'Stock and Stock Movements Management';
  } else if (activeTab === 'locations') {
    friendlyTitle = 'Inventory Locations';
  } else if (activeTab === 'kitchen-stations') {
    friendlyTitle = 'Kitchen Stations Directory';
  } else if (activeTab === 'purchase-orders') {
    friendlyTitle = 'Purchase Orders';
  } else if (activeTab === 'merchant-directory') {
    friendlyTitle = 'Merchant Directory';
  } else if (activeTab === 'user-management') {
    friendlyTitle = 'User Management';
  } else if (activeTab === 'company-profile') {
    friendlyTitle = 'Company Profile';
  } else if (activeTab === 'company-configurations') {
    friendlyTitle = 'Company Configurations';
  } else if (profile?.role === 'SaaS Owner') {
    if (activeTab === 'subscription') {
      friendlyTitle = 'Subscription System';
    } else if (activeTab === 'companies') {
      friendlyTitle = 'Companies Registry';
    } else if (activeTab === 'merchants') {
      friendlyTitle = 'Merchants Registry';
    } else if (activeTab === 'users') {
      friendlyTitle = 'Users List';
    } else if (activeTab === 'reports') {
      friendlyTitle = 'System Reports';
    }
  }

  // Fallback de iniciales para el avatar de usuario si no hay portraitUrl
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-header-height z-50 flex border-b border-[#e8e2d8] select-none font-sans overflow-hidden">
      {/* Apartado del Logo con su nombre, con su background de color negro (#222222) */}
      <div className="w-64 h-full bg-[#222222] flex items-center justify-between px-3 shrink-0 border-r border-white/10 relative">
        {!isMenuSearchOpen ? (
          <>
            {/* Agrupación Fija a la Izquierda: Hamburguesa + Logo (sin desplazamiento) */}
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Botón de Hamburguesa */}
              <button 
                onClick={onToggleSidebar}
                className="p-1 hover:bg-white/10 active:scale-95 transition-all text-white rounded flex items-center justify-center cursor-pointer shrink-0"
                title={isSidebarCollapsed ? "Mostrar menú" : "Ocultar menú"}
              >
                <span className="material-symbols-outlined text-[24px]">menu</span>
              </button>

              {/* Logo / Branding Completo del Backoffice */}
              <div 
                onClick={onLogoClick}
                className="flex items-center gap-2 cursor-pointer hover:opacity-90 active:scale-98 transition-all select-none min-w-0"
              >
                <img 
                  alt="X7 Point of Sale" 
                  className="w-auto object-contain h-[30px] shrink-0" 
                  src={logoX7} 
                />
                <div className="text-left flex flex-col justify-center min-w-0">
                  <span 
                    style={{ color: '#ffffff', display: 'block', fontSize: '11px', fontWeight: 'bold', lineHeight: '1.2', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                  >
                    POINT OF SALE
                  </span>
                  <span 
                    style={{ color: '#d51f2c', display: 'block', fontSize: '9px', fontWeight: 'bold', lineHeight: '1.2', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '1px' }}
                  >
                    Backoffice
                  </span>
                </div>
              </div>
            </div>

            {/* Lupa a la derecha (espacio reservado de forma fija para evitar saltos del logo) */}
            <button
              type="button"
              onClick={() => setIsMenuSearchOpen(true)}
              className={`p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded transition-all cursor-pointer shrink-0 ml-auto ${
                isSidebarCollapsed ? 'invisible pointer-events-none' : 'visible opacity-100'
              }`}
              title="Buscar en menú lateral"
              aria-label="Buscar en menú lateral"
            >
              <span className="material-symbols-outlined text-[20px]">search</span>
            </button>
          </>
        ) : (
          <>
            {/* Logo en tamaño completo original (Solo Icono X7 + Búsqueda) */}
            <div 
              onClick={onLogoClick}
              className="flex items-center cursor-pointer hover:opacity-90 transition-all select-none shrink-0"
              title="X7 POS Home"
            >
              <img 
                alt="X7 POS" 
                className="w-auto object-contain h-[30px] shrink-0" 
                src={logoX7} 
              />
            </div>

            {/* Campo de Búsqueda Desplegado */}
            <div className="flex-1 relative flex items-center min-w-0 ml-1">
              <input
                type="text"
                autoFocus
                value={menuSearchQuery}
                onChange={(e) => {
                  setMenuSearchQuery(e.target.value);
                  onMenuSearchChange?.(e.target.value);
                }}
                placeholder="Search menu..."
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/50 text-xs pl-2 pr-7 py-1 rounded outline-none focus:border-[#d51f2c] transition-all font-sans"
              />
              <button
                type="button"
                onClick={() => {
                  setIsMenuSearchOpen(false);
                  setMenuSearchQuery('');
                  onMenuSearchChange?.('');
                }}
                className="absolute right-1 text-white/60 hover:text-white transition-colors cursor-pointer"
                title="Cerrar búsqueda"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </>
        )}

        {/* Desplegable en vivo de Resultados de Búsqueda */}
        {isMenuSearchOpen && menuSearchQuery.trim() !== '' && (
          <div className="absolute top-16 left-0 w-64 bg-[#2a2a2a] text-white shadow-2xl rounded-b border-b border-x border-white/10 z-[10000] p-2 max-h-80 overflow-y-auto text-left font-sans animate-fade-in">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 px-2 py-1 border-b border-white/10 mb-1 flex justify-between items-center">
              <span>Menu Search ({menuSearchResults.length})</span>
              <span className="text-[9px] text-white/40">Click to navigate</span>
            </div>
            {menuSearchResults.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-white/60">
                No matching menu items found
              </div>
            ) : (
              menuSearchResults.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectFeature?.(item.id, item.categoryId);
                    setIsMenuSearchOpen(false);
                    setMenuSearchQuery('');
                    onMenuSearchChange?.('');
                  }}
                  className="px-2.5 py-2 hover:bg-white/10 rounded cursor-pointer transition-colors flex items-center justify-between text-xs group"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-semibold text-white group-hover:text-[#d51f2c] transition-colors truncate">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-white/50 truncate">
                      {item.categoryName}
                    </span>
                  </div>
                  <span className="material-symbols-outlined text-white/40 group-hover:text-white text-[16px] shrink-0">
                    chevron_right
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Contenido principal del Header con fondo claro */}
      <div className="flex-1 h-full bg-surface flex justify-between items-center px-xl">
        {/* Lado Izquierdo: Breadcrumbs & Títulos */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col text-left">
            {/* Breadcrumb location tracking */}
            <nav className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] mb-0.5">
              <span>{parentAppName}</span>
              <span className="material-symbols-outlined text-[10px] text-text/40" style={{ fontVariationSettings: "'wght' 700" }}>
                chevron_right
              </span>
              <span className="text-primary font-bold">{activeFeatureName}</span>
            </nav>
            
            {/* Main Headline */}
            <h2 className="text-lg font-bold text-primary leading-tight">
              {friendlyTitle}
            </h2>
          </div>

          {/* Subscription Tier Badge */}
          {tier && (
            <div className="tier-badge-full flex items-center gap-1.5 shadow-sm bg-[#1d1c17] text-white px-3 py-1 rounded text-[11px] font-bold uppercase tracking-wider">
              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                star
              </span>
              {tier}
            </div>
          )}
        </div>

        {/* Lado Derecho: Utilidades (Notificaciones, Help, Settings) & User Profile */}
        <div className="flex items-center gap-6">
          {/* Quick Utility Tools */}
          <div className="flex items-center gap-3 text-primary">
            {/* Notifications Utility */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-primary hover:bg-surface-container-low rounded transition-colors duration-200 relative flex items-center justify-center"
                title="Notifications"
              >
                <span className="material-symbols-outlined">notifications</span>
                {/* Conditional Unread Indicator bound to the notification count */}
                {notifications.length > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border border-surface"></span>
                )}
              </button>

              {/* Dropdown de Notificaciones */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-[#e8e2d8] shadow-2xl z-50 text-left rounded-sm">
                  <div className="p-3 bg-[#222222] text-white text-xs font-bold uppercase rounded-t-sm flex justify-between items-center">
                    <span>Notifications Queue</span>
                    <span className="bg-primary px-1.5 py-0.5 text-[9px] rounded text-white font-bold">
                      {notifications.length} Unread
                    </span>
                  </div>
                  <div className="divide-y divide-[#e8e2d8] max-h-60 overflow-y-auto custom-scrollbar">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-secondary italic text-center">No notifications found.</p>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="p-3 hover:bg-[#f9f7f4] transition-colors duration-200">
                          <p className="text-xs font-bold text-[#222222]">{n.title}</p>
                          <p className="text-[11px] text-[#666666] mt-0.5">{n.message}</p>
                          <span className="text-[9px] text-secondary mt-1 block text-right">{n.time}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Time Clock Terminal Utility */}
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-time-clock-kiosk'));
              }}
              className="px-2.5 py-1 bg-[#d51f2c] hover:bg-[#b01a24] text-white rounded font-bold text-xs uppercase flex items-center gap-1 transition-colors duration-200 shadow-sm"
              title="Time Clock Terminal (Reloj de Fichaje)"
            >
              <span className="material-symbols-outlined text-base">punch_clock</span>
              <span className="hidden lg:inline text-[11px]">Time Clock</span>
            </button>

            {/* Help Center Utility */}
            <a
              href="/support/help-center"
              onClick={(e) => {
                e.preventDefault();
                alert('Provisional Help Center directory: /support/help-center');
              }}
              className="p-2 text-primary hover:bg-surface-container-low rounded transition-colors duration-200 flex items-center justify-center"
              title="Help Center"
            >
              <span className="material-symbols-outlined">help</span>
            </a>

            {/* Settings Utility */}
            <a
              href="/settings/account"
              onClick={(e) => {
                e.preventDefault();
                alert('Provisional Account settings layout: /settings/account');
              }}
              className="p-2 text-primary hover:bg-surface-container-low rounded transition-colors duration-200 flex items-center justify-center"
              title="Settings"
            >
              <span className="material-symbols-outlined">settings</span>
            </a>
            
            <div className="h-8 w-px bg-[#e8e2d8] mx-2"></div>
          </div>

          {/* User Profile Identity Block */}
          {profile && (
            <div 
              onClick={() => alert(`Profile of ${profile.name} (${profile.role})`)}
              className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-surface-container-low transition-colors duration-200 cursor-pointer"
            >
              <div className="text-right">
                <p className="text-body-sm font-semibold text-[#222222] leading-none">
                  {profile.name}
                </p>
                <p className="text-[11px] text-secondary">
                  {profile.role}
                </p>
              </div>
              
              {profile.portraitUrl ? (
                <img
                  alt="Profile Portrait"
                  className="w-9 h-9 rounded-full object-cover border border-[#e8e2d8] shadow-sm hover:opacity-95 transition-opacity duration-200"
                  src={profile.portraitUrl}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const fallbackAvatar = e.currentTarget.nextElementSibling as HTMLElement;
                    if (fallbackAvatar) fallbackAvatar.style.display = 'flex';
                  }}
                />
              ) : null}
              
              <div 
                style={{ display: profile.portraitUrl ? 'none' : 'flex' }}
                className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm select-none border border-[#e8e2d8] shadow-sm"
              >
                {getInitials(profile.name)}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
