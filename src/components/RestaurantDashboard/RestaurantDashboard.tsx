import React, { useState, useEffect } from 'react';
import {
  restaurantService,
  setSimulate401,
  getSimulate401
} from '../../services/restaurantService';
import type {
  UserProfile,
  SystemNotification
} from '../../services/restaurantService';
import { SalesMetricCard } from './SalesMetricCard';
import { TablesOccupancyCard } from './TablesOccupancyCard';
import { KitchenPerformanceCard } from './KitchenPerformanceCard';
import { TopSellingItems } from './TopSellingItems';
import { CurrentShifts } from './CurrentShifts';
import { KitchenMonitorView } from './KitchenMonitorView';
import {
  NewReservationModal,
  VoidTransactionModal,
  EODReportModal,
  EmergencySupportModal,
  NewQuickOrderModal,
  LoginGatewayModal
} from './QuickActionModals';
import { SaasOverviewContent } from '../SaaSDashboard/SaasOverviewContent';
import { setSimulateApiFailure, getSimulateApiFailure } from '../../services/saasService';
import logoX7 from '../../assets/logo-x7.png';
import { ProductCategoriesView } from './ProductCategoriesView';

export const RestaurantDashboard: React.FC = () => {
  // Estados de carga e inicialización de sesión
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tier, setTier] = useState<string>('');
  const [isAuthLocked, setIsAuthLocked] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Estados de navegación SPA
  const [activeCategory, setActiveCategory] = useState<string>('saas'); // Categoria activa
  const [activeTab, setActiveTab] = useState<string>('saas-dashboard'); // Sub-item o vista activa
  const [showKitchenKDS, setShowKitchenKDS] = useState<boolean>(false);
  const [isInventoryExpanded, setIsInventoryExpanded] = useState<boolean>(false);

  // Estados de UI
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [demo401Toggle, setDemo401Toggle] = useState<boolean>(getSimulate401());
  const [showDemoPanel, setShowDemoPanel] = useState<boolean>(false);

  // Estados de SaaS unificados
  const [searchText, setSearchText] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [apiFailedToggle, setApiFailedToggle] = useState<boolean>(getSimulateApiFailure());

  // Estados de Modales
  const [isReservationOpen, setIsReservationOpen] = useState<boolean>(false);
  const [isVoidOpen, setIsVoidOpen] = useState<boolean>(false);
  const [isEODOpen, setIsEODOpen] = useState<boolean>(false);
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);
  const [isQuickOrderOpen, setIsQuickOrderOpen] = useState<boolean>(false);

  // 1. Inicialización y chequeo de sesión (AC 1.1 y 1.2)
  const hydrateSession = async () => {
    try {
      setIsAuthLocked(false);
      const userProfile = await restaurantService.getUserProfile();
      setProfile(userProfile);
      const estTier = await restaurantService.getEstablishmentTier();
      setTier(estTier);
    } catch (err: any) {
      if (err.status === 401) {
        setIsAuthLocked(true); // AC 1.3: Bloqueo de sesión
      } else {
        console.error('Error durante la hidratación de sesión', err);
      }
    }
  };

  useEffect(() => {
    hydrateSession();
  }, [refreshTrigger]);

  // Cargar notificaciones (AC 5.1)
  const fetchNotifications = async () => {
    try {
      const data = await restaurantService.getNotifications();
      setNotifications(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!isAuthLocked) {
      fetchNotifications();
    }
  }, [isAuthLocked, refreshTrigger]);

  // Debounce de 300ms para la búsqueda global de SaaS (AC 1.3 de SaaS)
  useEffect(() => {
    if (searchText) {
      setIsSearching(true);
    }
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchText);
      setIsSearching(false);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchText]);

  // Activar clases dinámicas de layout en el root y body según la pestaña activa
  useEffect(() => {
    const rootEl = document.getElementById('root');
    const bodyEl = document.body;
    const isSaaSTab = [
      'saas-dashboard',
      'subscription',
      'companies',
      'merchants',
      'users',
      'reports'
    ].includes(activeTab);

    if (isSaaSTab) {
      rootEl?.classList.remove('restaurant-active');
      bodyEl?.classList.remove('restaurant-active');
      rootEl?.classList.add('saas-active');
      bodyEl?.classList.add('saas-active');
    } else {
      rootEl?.classList.remove('saas-active');
      bodyEl?.classList.remove('saas-active');
      rootEl?.classList.add('restaurant-active');
      bodyEl?.classList.add('restaurant-active');
    }

    return () => {
      rootEl?.classList.remove('restaurant-active', 'saas-active');
      bodyEl?.classList.remove('restaurant-active', 'saas-active');
    };
  }, [activeTab]);

  const handleToggleApiFailure = () => {
    const newState = !apiFailedToggle;
    setSimulateApiFailure(newState);
    setApiFailedToggle(newState);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleToggle401 = () => {
    const newState = !demo401Toggle;
    setSimulate401(newState);
    setDemo401Toggle(newState);
    if (newState) {
      setIsAuthLocked(true);
    } else {
      setRefreshTrigger((prev) => prev + 1);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthLocked(false);
    setRefreshTrigger((prev) => prev + 1);
  };

  // Logout (AC 4.3)
  const handleLogout = async () => {
    try {
      await restaurantService.logout();
      setIsAuthLocked(true);
    } catch (err) {
      console.error(err);
    }
  };

  if (showKitchenKDS) {
    return <KitchenMonitorView onBackToDashboard={() => setShowKitchenKDS(false)} />;
  }

  // Renderizado dinámico de vistas SPA (AC 4.2)
  const renderSPAView = () => {
    if (activeTab === 'saas-dashboard') {
      return (
        <div className="space-y-8 animate-fade-in text-left">
          {/* Header del Dashboard de SaaS en el Canvas central */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
              <h1 className="font-sans text-h1 text-[#222222] uppercase tracking-tighter">
                Platform SaaS <span className="text-[#d51f2c]">/</span> Overview
              </h1>
              <p className="text-body-md text-[#666666] mt-1">
                Real-time performance metrics and merchant growth tracking.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => alert('Exporting SaaS report...')}
                className="px-4 py-2 border border-[#222222] text-[#222222] font-bold text-label-caps hover:bg-[#222222] hover:text-white transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                Export Report
              </button>
              <button
                onClick={() => alert('New Merchant simulation')}
                className="px-4 py-2 bg-[#d51f2c] text-white font-bold text-label-caps hover:opacity-90 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                New Merchant
              </button>
            </div>
          </div>

          <SaasOverviewContent
            refreshTrigger={refreshTrigger}
            onNavigateToView={(view) => setActiveTab(view)}
          />
        </div>
      );
    }

    if (activeTab === 'categories') {
      return <ProductCategoriesView />;
    }

    if (activeTab !== 'dashboard') {
      return (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm">
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">
            {activeTab === 'subscription' && 'loyalty'}
            {activeTab === 'companies' && 'corporate_fare'}
            {activeTab === 'merchants' && 'store'}
            {activeTab === 'users' && 'group'}
            {activeTab === 'reports' && 'description'}
            {activeTab === 'core' && 'settings_applications'}
            {activeTab === 'finance' && 'payments'}
            {activeTab === 'inventory' && 'inventory_2'}
            {activeTab === 'commerce' && 'storefront'}
            {activeTab === 'growth' && 'trending_up'}
          </span>
          <h2 className="text-h2 font-black text-[#222222] mt-4 uppercase">
            {activeTab === 'subscription' && 'Subscription System'}
            {activeTab === 'companies' && 'Companies registry'}
            {activeTab === 'merchants' && 'Merchants Registry'}
            {activeTab === 'users' && 'Users list'}
            {activeTab === 'reports' && 'System Reports'}
            {activeTab === 'core' && 'CORE Operational Module'}
            {activeTab === 'finance' && 'Finance & HR Module'}
            {activeTab === 'inventory' && 'Inventory Management'}
            {activeTab === 'commerce' && 'Commerce Operations'}
            {activeTab === 'growth' && 'Growth Platform'}
          </h2>
          <p className="text-body-md text-[#666666] mt-2 max-w-md mx-auto">
            Acceso virtual al submódulo SPA para la sección{' '}
            <strong className="text-[#d51f2c]">/{activeTab}</strong>. Navegación libre de recargas físicas.
          </p>
          <button
            onClick={() => {
              setActiveCategory('operations');
              setActiveTab('dashboard');
            }}
            className="mt-6 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#d51f2c] transition-all"
          >
            Volver a Operaciones
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {/* Bento Grid Metrics */}
        <div className="grid grid-cols-12 gap-6">
          {/* Daily Sales Card */}
          <SalesMetricCard refreshTrigger={refreshTrigger} />

          {/* Ocupación de mesas y rendimiento apilados */}
          <div className="col-span-12 lg:col-span-4 grid grid-rows-2 gap-6">
            <TablesOccupancyCard refreshTrigger={refreshTrigger} />
            <KitchenPerformanceCard refreshTrigger={refreshTrigger} />
          </div>
        </div>

        {/* Dynamic Lists Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Top Selling Items */}
          <TopSellingItems refreshTrigger={refreshTrigger} />

          {/* Current Shifts */}
          <CurrentShifts refreshTrigger={refreshTrigger} />

          {/* Kitchen Insights Visual (AC 3.3) */}
          <div className="bg-white border border-[#e8e2d8] p-0 overflow-hidden relative group h-[400px]">
            <img
              className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
              alt="Kitchen display station screen"
              src="https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=400&h=400&fit=crop&q=80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#222222] via-transparent to-transparent opacity-80"></div>
            <div className="absolute bottom-0 left-0 p-6 w-full text-left">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-white text-[10px] font-bold uppercase tracking-widest">
                  Live Kitchen Status
                </span>
              </div>
              <h4 className="text-white font-bold text-lg mb-1">Peak Hour Incoming</h4>
              <p className="text-white/70 text-body-sm">
                12 new orders in last 10 minutes. Staffing at optimal levels.
              </p>
              <button
                onClick={() => setShowKitchenKDS(true)}
                className="mt-4 w-full py-2 bg-[#d51f2c] text-white font-bold text-xs uppercase tracking-widest hover:bg-[#b01a24] transition-colors"
              >
                View Monitor
              </button>
            </div>
          </div>
        </div>

        {/* Footer Quick Actions (AC 5.2) */}
        <div className="bg-[#222222] p-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <h3 className="text-white font-bold text-xl">Quick Launch</h3>
            <p className="text-white/60 text-sm">Access core POS functions instantly.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => setIsReservationOpen(true)}
              className="px-6 py-3 bg-white text-[#222222] font-bold text-xs uppercase border-b-4 border-[#d51f2c] hover:translate-y-[-2px] transition-transform duration-200"
            >
              New Reservation
            </button>
            <button
              onClick={() => setIsVoidOpen(true)}
              className="px-6 py-3 bg-white text-[#222222] font-bold text-xs uppercase border-b-4 border-[#d51f2c] hover:translate-y-[-2px] transition-transform duration-200"
            >
              Void Transaction
            </button>
            <button
              onClick={() => setIsEODOpen(true)}
              className="px-6 py-3 bg-white text-[#222222] font-bold text-xs uppercase border-b-4 border-[#d51f2c] hover:translate-y-[-2px] transition-transform duration-200"
            >
              Run EOD Report
            </button>
            <button
              onClick={() => setIsSupportOpen(true)}
              className="px-6 py-3 bg-[#d51f2c] text-white font-bold text-xs uppercase hover:bg-[#b01a24] transition-colors duration-200"
            >
              Emergency Support
            </button>
          </div>
        </div>
      </div>
    );
  };

  const isSaaSTab = [
    'saas-dashboard',
    'subscription',
    'companies',
    'merchants',
    'users',
    'reports'
  ].includes(activeTab);

  return (
    <div className="overflow-hidden min-h-screen relative bg-[#f1ece4]">
      {/* Sidebar Navigation */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-[#222222] border-r border-white/10 z-50 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="flex items-center justify-center gap-3 flex-grow">
            <img 
              alt="X7 Point of Sale" 
              className="w-auto object-contain h-[60px]" 
              src={logoX7} 
            />
          </div>
          <div className="text-left">
            <h2 className="text-md font-black text-white tracking-tight leading-none">
              POINT OF SALE
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#d51f2c]">
              Backoffice
            </span>
          </div>
        </div>

        {/* Sidebar Nav (AC 4.1) */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-1 text-left">
          {/* Platform SaaS (Expandible) */}
          <div>
            <div
              onClick={() => setActiveCategory(activeCategory === 'saas' ? '' : 'saas')}
              className={`py-2.5 px-4 flex items-center gap-3 cursor-pointer transition-colors ${
                activeCategory === 'saas'
                  ? 'border-l-2 border-[#d51f2c] bg-white/10 text-white font-semibold'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className={`material-symbols-outlined text-[20px] ${activeCategory === 'saas' ? 'text-[#d51f2c]' : ''}`}>dashboard</span>
              <span className="font-sans text-[13px]">Platform SaaS</span>
            </div>

            {activeCategory === 'saas' && (
              <div className="mt-1 ml-4 border-l border-white/20 flex flex-col space-y-1">
                {[
                  { id: 'saas-dashboard', label: 'Dashboard' },
                  { id: 'subscription', label: 'Subscription System' },
                  { id: 'companies', label: 'Companies' },
                  { id: 'merchants', label: 'Merchants' },
                  { id: 'users', label: 'Users' },
                  { id: 'reports', label: 'Reports' },
                ].map((sub) => {
                  const isActive = activeTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setActiveTab(sub.id)}
                      className={`pl-6 py-2 text-[13px] text-left transition-colors flex items-center gap-2 w-full ${
                        isActive
                          ? 'text-[#d51f2c] font-semibold bg-white/5 border-l border-[#d51f2c] -ml-[1px]'
                          : 'text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className={`w-1 h-1 rounded-full ${isActive ? 'bg-[#d51f2c]' : 'bg-transparent'}`}></span>
                      {sub.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Categorias del Restaurante (AC 4.2) */}
          {[
            { id: 'core', label: 'CORE', icon: 'settings_applications' },
            { id: 'finance', label: 'Finance & HR', icon: 'payments' },
            { id: 'inventory', label: 'Inventory', icon: 'inventory_2' },
            { id: 'operations', label: 'Restaurant Operations', icon: 'restaurant' },
            { id: 'commerce', label: 'Commerce', icon: 'storefront' },
            { id: 'growth', label: 'Growth', icon: 'trending_up' },
          ].map((cat) => {
            if (cat.id === 'inventory') {
              const isCatActive = ['categories', 'products', 'modifiers', 'variants', 'food-costing'].includes(activeTab);
              return (
                <div key={cat.id} className="w-full text-left">
                  <div
                    onClick={() => {
                      setIsInventoryExpanded(!isInventoryExpanded);
                    }}
                    className={`py-2.5 px-4 flex items-center gap-3 cursor-pointer transition-colors ${
                      isCatActive
                        ? 'border-l-2 border-[#d51f2c] bg-white/10 text-white font-semibold'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${isCatActive ? 'text-[#d51f2c]' : ''}`}>{cat.icon}</span>
                    <span className="font-sans text-[13px]">{cat.label}</span>
                  </div>

                  {isInventoryExpanded && (
                    <div className="ml-10 mt-1 border-l border-white/10 space-y-1">
                      {/* Product/Inventory System */}
                      <div className="pl-6 py-2 text-[#d51f2c] font-medium text-[13px] hover:bg-white/5 transition-colors flex items-center gap-2 cursor-pointer">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#d51f2c]"></span>
                        Product/Inventory System
                      </div>

                      {/* Sub-items Nivel 2 */}
                      <div className="ml-4 mt-1 border-l border-white/10 space-y-1">
                        {[
                          { id: 'categories', label: 'Categories' },
                          { id: 'products', label: 'Products' },
                          { id: 'modifiers', label: 'Modifiers' },
                          { id: 'variants', label: 'Variants' },
                        ].map((sub) => {
                          const isSubActive = activeTab === sub.id;
                          return (
                            <div
                              key={sub.id}
                              onClick={() => {
                                setActiveCategory('inventory');
                                setActiveTab(sub.id);
                              }}
                              className={`pl-4 py-1.5 text-body-sm cursor-pointer transition-colors ${
                                isSubActive
                                  ? 'text-[#222222] font-semibold bg-white/50 border-l-2 border-[#222222] -ml-[1px]'
                                  : 'text-white/60 hover:text-white'
                              }`}
                            >
                              {sub.label}
                            </div>
                          );
                        })}
                      </div>

                      {/* Food costing */}
                      <div
                        onClick={() => {
                          setActiveCategory('inventory');
                          setActiveTab('food-costing');
                        }}
                        className={`pl-6 py-2 text-[#d51f2c] font-medium text-[13px] hover:bg-white/5 transition-colors flex items-center gap-2 cursor-pointer ${
                          activeTab === 'food-costing' ? 'font-semibold bg-white/5 border-l border-[#d51f2c] -ml-[1px]' : ''
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#d51f2c]"></span>
                        Food costing
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            const isSelected =
              (activeCategory === cat.id && !['categories', 'products', 'modifiers', 'variants', 'food-costing'].includes(activeTab)) ||
              (cat.id === 'operations' && activeTab === 'dashboard');
            return (
              <div
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  if (cat.id === 'operations') {
                    setActiveTab('dashboard');
                  } else {
                    setActiveTab(cat.id);
                  }
                }}
                className={`py-2 flex items-center gap-3 cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? 'side-nav-active'
                    : 'side-nav-inactive hover:bg-white/10 text-white/70 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{cat.icon}</span>
                <span className="font-body-sm text-body-sm">{cat.label}</span>
              </div>
            );
          })}
        </nav>


        {/* Bottom items */}
        <div className="p-4 border-t border-white/10 space-y-1">
          <div
            onClick={() => alert('Support escalation initiated.')}
            className="side-nav-inactive hover:bg-white/10 py-2 transition-colors cursor-pointer text-white/70 hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">contact_support</span>
            <span className="font-body-sm text-body-sm">Support</span>
          </div>
          <div
            onClick={handleLogout}
            className="side-nav-inactive hover:bg-white/10 py-2 transition-colors cursor-pointer text-white/70 hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span className="font-body-sm text-body-sm">Logout</span>
          </div>
        </div>
      </aside>

      {/* Top Navigation Bar */}
      <header className="fixed top-0 right-0 left-64 h-16 bg-[#f1ece4] border-b border-[#e8e2d8] z-40 flex justify-between items-center px-6">
        {isSaaSTab ? (
          /* Cabecera del SaaS Dashboard (Lado Izquierdo) */
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#666666] text-lg">
                search
              </span>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full bg-white/50 border border-[#e8e2d8] rounded py-1.5 pl-10 pr-4 text-body-sm focus:ring-0 focus:border-[#222222] transition-all"
                placeholder="Search merchants, users, or companies..."
              />
              {isSearching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#666666] animate-pulse">
                  ...
                </span>
              )}
            </div>
            {debouncedSearchQuery && (
              <div className="bg-[#222222] text-white px-2 py-1 text-[10px] font-bold uppercase flex items-center gap-1.5 rounded animate-fade-in shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping"></span>
                Query: "{debouncedSearchQuery}"
              </div>
            )}
          </div>
        ) : (
          /* Cabecera del Restaurante (Lado Izquierdo) */
          <>
            {activeTab === 'categories' ? (
              <div className="flex items-center gap-6">
                <div className="flex flex-col text-left">
                  <nav className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] mb-1 select-none">
                    <span>Inventory</span>
                    <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'wght' 700" }}>chevron_right</span>
                    <span className="text-[#ae001a] font-bold">Categories</span>
                  </nav>
                  <h2 className="text-xl font-bold text-[#ae001a] leading-tight">Product Categories</h2>
                </div>
                {tier && (
                  <div className="tier-badge-full flex items-center gap-1.5 shadow-sm bg-[#1d1c17] text-white px-3 py-1 rounded text-[11px] font-bold uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      star
                    </span>
                    {tier}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <h2 className="font-sans text-sm font-medium tracking-tight text-[#222222]">
                  {activeTab === 'dashboard' ? 'Restaurant Dashboard' : `${activeTab.toUpperCase()} Subsystem`}
                </h2>
                {/* Badge de Tier (AC 1.2) */}
                {tier && (
                  <div className="tier-badge-full flex items-center gap-1.5 shadow-sm">
                    <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      star
                    </span>
                    {tier}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Lado Derecho de la Cabecera Genérica (Común para SaaS y Restaurante) */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 text-secondary">
            {/* Botón de Notificaciones (AC 5.1) */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-[#222222] hover:bg-[#e8e2d8] transition-colors relative"
              >
                <span className="material-symbols-outlined">notifications</span>
                {notifications.length > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-[#d51f2c] rounded-full border border-[#f1ece4]"></span>
                )}
              </button>

              {/* Dropdown de Notificaciones */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-[#e8e2d8] shadow-2xl z-50 text-left rounded-sm">
                  <div className="p-3 bg-[#222222] text-white text-xs font-bold uppercase rounded-t-sm flex justify-between items-center">
                    <span>Notifications Queue</span>
                    <span className="bg-[#d51f2c] px-1.5 py-0.5 text-[9px] rounded">
                      {notifications.length} Unread
                    </span>
                  </div>
                  <div className="divide-y divide-[#e8e2d8] max-h-60 overflow-y-auto custom-scrollbar">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-secondary italic text-center">No notifications found.</p>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="p-3 hover:bg-[#f9f7f4] transition-colors">
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

            {isSaaSTab && (
              <button
                onClick={() => setRefreshTrigger((prev) => prev + 1)}
                className="p-2 text-[#222222] hover:bg-[#e8e2d8] transition-colors"
                title="Refrescar Datos"
              >
                <span className="material-symbols-outlined">refresh</span>
              </button>
            )}

            <button className="p-2 text-[#222222] hover:bg-[#e8e2d8] transition-colors">
              <span className="material-symbols-outlined">help</span>
            </button>
            <button className="p-2 text-[#222222] hover:bg-[#e8e2d8] transition-colors">
              <span className="material-symbols-outlined">settings</span>
            </button>
            <div className="h-8 w-px bg-[#e8e2d8] mx-2"></div>
          </div>

          {/* Información dinámica de usuario (AC 1.1) */}
          {profile && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-body-sm font-semibold text-[#222222] leading-none">{profile.name}</p>
                <p className="text-[11px] text-secondary">{profile.role}</p>
              </div>
              <img
                alt="Profile Portrait"
                className="w-9 h-9 rounded-full object-cover border border-[#e8e2d8] shadow-sm"
                src={profile.portraitUrl}
              />
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="fixed top-16 bottom-12 left-64 right-0 overflow-y-auto bg-[#f1ece4] p-8 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-8">
          {renderSPAView()}
        </div>
      </main>

      {/* Global Fixed Institutional Footer */}
      <footer className="fixed bottom-0 right-0 left-64 h-12 bg-[#f1ece4] border-t border-[#e8e2d8] z-40 flex justify-between items-center px-8 text-secondary select-none">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#5f5e5e]">
          <span>© 2026 X7 Point of Sale. All rights reserved.</span>
          <span className="material-symbols-outlined text-xs leading-none">chevron_right</span>
        </div>
        <div className="flex gap-6 text-xs font-semibold text-[#5f5e5e]">
          <a href="#" onClick={(e) => { e.preventDefault(); alert('Privacy Policy simulation'); }} className="hover:underline underline">Privacy Policy</a>
          <a href="#" onClick={(e) => { e.preventDefault(); alert('Terms of Service simulation'); }} className="hover:underline underline">Terms of Service</a>
          <a href="#" onClick={(e) => { e.preventDefault(); alert('Help Center simulation'); }} className="hover:underline underline">Help Center</a>
        </div>
      </footer>

      {/* Floating Action Button (FAB - AC 5.3) */}
      {activeTab === 'dashboard' && (
        <button
          onClick={() => setIsQuickOrderOpen(true)}
          className="fixed bottom-8 right-8 w-16 h-16 bg-[#d51f2c] text-white rounded-full shadow-2xl flex items-center justify-center group hover:scale-110 active:scale-95 transition-all z-50 animate-pulse"
        >
          <span className="material-symbols-outlined text-3xl">add</span>
          <span className="absolute right-full mr-4 px-3 py-1 bg-[#222222] text-white text-[10px] font-bold uppercase rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-md">
            New Quick Order
          </span>
        </button>
      )}

      {/* Modales de Acciones Rápidas */}
      <NewReservationModal isOpen={isReservationOpen} onClose={() => setIsReservationOpen(false)} />
      <VoidTransactionModal isOpen={isVoidOpen} onClose={() => setIsVoidOpen(false)} />
      <EODReportModal isOpen={isEODOpen} onClose={() => setIsEODOpen(false)} />
      <EmergencySupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
      <NewQuickOrderModal isOpen={isQuickOrderOpen} onClose={() => setIsQuickOrderOpen(false)} />

      {/* Modal Bloqueante de Login Gateway por 401 Unauthorized (AC 1.3) */}
      <LoginGatewayModal isOpen={isAuthLocked} onLoginSuccess={handleLoginSuccess} />

      {/* Botón Flotante de Controles de Demo en la esquina inferior izquierda del canvas */}
      <div className="fixed bottom-16 left-[272px] z-[9999]">
        <button
          onClick={() => setShowDemoPanel(!showDemoPanel)}
          className="w-10 h-10 bg-[#222222] hover:bg-[#d51f2c] text-white rounded-full shadow-lg flex items-center justify-center border border-white/20 transition-all active:scale-95"
          title="Demo Simulation Controls"
        >
          <span className="material-symbols-outlined text-[20px]">construction</span>
        </button>

        {showDemoPanel && (
          <div className="absolute bottom-12 left-0 w-64 bg-[#222222] border border-white/10 p-4 rounded shadow-2xl space-y-2 animate-fade-in text-left">
            {isSaaSTab ? (
              <>
                <p className="font-bold text-[#d51f2c] uppercase text-[10px] tracking-wider">SaaS Demo Controls</p>
                <p className="text-[10px] text-white/50 mb-2">Simula condiciones de error en las llamadas de API de SaaS.</p>
                <button
                  onClick={() => {
                    handleToggleApiFailure();
                    setShowDemoPanel(false);
                  }}
                  className={`w-full py-1.5 px-2 text-center text-xs font-bold text-white rounded transition-colors ${
                    apiFailedToggle ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {apiFailedToggle ? 'Simular API Online' : 'Simular Error de API'}
                </button>
              </>
            ) : (
              <>
                <p className="font-bold text-[#d51f2c] uppercase text-[10px] tracking-wider">Restaurant Demo Controls</p>
                <p className="text-[10px] text-white/50 mb-2">Simula la expiración de sesión del restaurante.</p>
                <button
                  onClick={() => {
                    handleToggle401();
                    setShowDemoPanel(false);
                  }}
                  className={`w-full py-1.5 px-2 text-center text-xs font-bold text-white rounded transition-colors ${
                    demo401Toggle ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {demo401Toggle ? 'Simular Sesión Ok (200)' : 'Forzar Expiración (401)'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default RestaurantDashboard;
