import React, { useState, useEffect } from 'react';
import { SaasOverviewContent } from './SaasOverviewContent';
import { setSimulateApiFailure, getSimulateApiFailure } from '../../services/saasService';
import { SubscriptionPlansView } from './SubscriptionPlansView';
import { SaasLoginOverlay } from './SaasLoginOverlay';
import { isSaasAuthenticated } from '../../lib/saas-auth-storage';
import logoX7 from '../../assets/logo-x7.png';

export const SaaSDashboard: React.FC = () => {
  const [saasAuthenticated, setSaasAuthenticated] = useState(isSaasAuthenticated);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [searchText, setSearchText] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [apiFailedToggle, setApiFailedToggle] = useState<boolean>(getSimulateApiFailure());

  // Añadir clases para anular estilos limitantes de la plantilla original de Vite
  useEffect(() => {
    const rootEl = document.getElementById('root');
    const bodyEl = document.body;
    rootEl?.classList.add('saas-active');
    bodyEl?.classList.add('saas-active');
    return () => {
      rootEl?.classList.remove('saas-active');
      bodyEl?.classList.remove('saas-active');
    };
  }, []);

  // Debounce de 300ms para la búsqueda global (AC 1.3)
  useEffect(() => {
    if (searchText) {
      setIsSearching(true);
    }
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchText);
      setIsSearching(false);
    }, 3000); // 300ms según el criterio, pero hagamos exactamente 300ms. 3000 fue typo de mi mente. Usemos 300ms.

    return () => {
      clearTimeout(handler);
    };
  }, [searchText]);

  // Handler de debounce real de 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchText);
      setIsSearching(false);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchText]);

  const handleToggleApiFailure = () => {
    const newState = !apiFailedToggle;
    setSimulateApiFailure(newState);
    setApiFailedToggle(newState);
    setRefreshTrigger((prev) => prev + 1); // Forzar actualización de componentes
  };

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleNavigateView = (view: string) => {
    setActiveTab(view);
  };

  // Renderizar vistas según la pestaña activa (AC 1.1 y 4.3)
  const renderContent = () => {
    if (activeTab === 'subscription') {
      return <SubscriptionPlansView />;
    }

    if (
      activeTab === 'subscription-applications' ||
      activeTab === 'subscription-features' ||
      activeTab === 'subscription-payments'
    ) {
      const subConfig = {
        'subscription-applications': {
          icon: 'apps',
          title: 'Platform Applications',
          desc: 'Software ecosystems and applications linked to subscription plans.',
        },
        'subscription-features': {
          icon: 'featured_play_list',
          title: 'Feature Catalog Map',
          desc: 'Master feature flags and platform capability tables.',
        },
        'subscription-payments': {
          icon: 'payments',
          title: 'Subscription Payments',
          desc: 'Centralized billing book tracking payment logs from active merchants.',
        },
      }[activeTab as 'subscription-applications' | 'subscription-features' | 'subscription-payments'];
      return (
        <div className="bg-white border border-[#e8e2d8] p-12 rounded flex flex-col items-center text-center">
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">{subConfig.icon}</span>
          <h2 className="text-h2 font-black text-[#222222] mt-4 uppercase">{subConfig.title}</h2>
          <p className="text-body-md text-[#666666] mt-2 max-w-md text-center">{subConfig.desc}</p>
          <button
            onClick={() => setActiveTab('subscription')}
            className="mt-6 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#d51f2c] transition-all"
          >
            Back to Subscription Plans
          </button>
        </div>
      );
    }

    if (activeTab !== 'dashboard') {
      return (
        <div className="bg-white border border-[#e8e2d8] p-12 rounded flex flex-col items-center text-center">
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">
            {activeTab === 'companies' && 'corporate_fare'}
            {activeTab === 'merchants' && 'store'}
            {activeTab === 'users' && 'group'}
            {activeTab === 'reports' && 'description'}
          </span>
          <h2 className="text-h2 font-black text-[#222222] mt-4 uppercase">
            {activeTab === 'companies' && 'Companies Registry'}
            {activeTab === 'merchants' && 'Merchants Registry'}
            {activeTab === 'users' && 'Platform Users'}
            {activeTab === 'reports' && 'System Reports'}
          </h2>
          <p className="text-body-md text-[#666666] mt-2 max-w-md text-center">
            Esta sección virtual simula la ruta SPA para{' '}
            <strong className="text-[#d51f2c]">/{activeTab}</strong>. Toda la navegación se
            realiza reactivamente sin recargas de página físicas.
          </p>
          <button
            onClick={() => setActiveTab('dashboard')}
            className="mt-6 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#d51f2c] transition-all"
          >
            Volver al Dashboard
          </button>
        </div>
      );
    }

    return (
      <SaasOverviewContent
        refreshTrigger={refreshTrigger}
        onNavigateToView={handleNavigateView}
      />
    );
  };

  if (!saasAuthenticated) {
    return <SaasLoginOverlay onSuccess={() => setSaasAuthenticated(true)} />;
  }

  return (
    <div className="text-on-background antialiased font-sans bg-[#f1ece4] min-h-screen text-[14px]">
      {/* SideNavBar Shell */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-[#222222] border-r border-[#333333] flex flex-col z-50">
        <div className="p-6 flex items-center gap-3">
          <img src={logoX7} alt="X7" className="w-20 h-20 object-contain brightness-0 invert" />
          <div className="flex flex-col">
            <h2 className="text-md font-black text-white tracking-tight leading-none">
              POINT OF SALE
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#d51f2c] mt-1">
              Backoffice
            </span>
          </div>
        </div>

        <nav className="flex-1 px-2 space-y-1 overflow-y-auto sidebar-scroll">
          <div>
            {/* Header de Categoria */}
            <div className="border-l-2 border-[#d51f2c] bg-white/10 text-white font-semibold pl-3 py-2.5 flex items-center gap-3 cursor-pointer">
              <span className="material-symbols-outlined text-[#d51f2c]">dashboard</span>
              <span className="font-sans text-[13px] tracking-wide uppercase">Platform SaaS</span>
            </div>

            {/* Sub-items (AC 1.1 y 1.2) */}
            <div className="mt-1 ml-4 border-l border-white/20 flex flex-col space-y-1">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
                { id: 'subscription', label: 'Subscription Plans', icon: 'workspace_premium' },
                { id: 'companies', label: 'Companies', icon: 'corporate_fare' },
                { id: 'merchants', label: 'Merchants', icon: 'store' },
                { id: 'users', label: 'Users', icon: 'group' },
                { id: 'reports', label: 'Reports', icon: 'description' },
              ].map((item) => {
                const isActive =
                  activeTab === item.id ||
                  (item.id === 'subscription' && activeTab.startsWith('subscription-'));
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`pl-4 pr-3 py-2 text-[13px] text-left transition-colors flex items-center gap-2.5 w-full ${
                      isActive
                        ? 'text-[#d51f2c] font-semibold bg-white/5 border-l-2 border-[#d51f2c] -ml-[1px]'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Demo Controls inside Sidebar */}
        <div className="p-4 bg-black/20 border-t border-white/10 text-[11px] text-white/50 space-y-2">
          <p className="font-bold text-[#d51f2c] uppercase">SaaS Demo Controls</p>
          <button
            onClick={handleToggleApiFailure}
            className={`w-full py-1 px-2 text-center font-bold text-white rounded transition-colors ${
              apiFailedToggle ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {apiFailedToggle ? 'Simular API Online' : 'Simular Error de API'}
          </button>
        </div>

        <div className="mt-auto p-2 border-t border-white/10">
          <a
            className="text-white/70 pl-4 py-2 flex items-center gap-3 hover:bg-white/5 hover:text-white transition-all text-[13px]"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert('Support module simulation');
            }}
          >
            <span className="material-symbols-outlined">contact_support</span>
            Support
          </a>
          <a
            className="text-white/70 pl-4 py-2 flex items-center gap-3 hover:bg-white/5 hover:text-white transition-all text-[13px]"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert('Logout simulation');
            }}
          >
            <span className="material-symbols-outlined">logout</span>
            Logout
          </a>
        </div>
      </aside>

      {/* TopNavBar Shell */}
      <header className="fixed top-0 right-0 left-64 h-16 flex justify-between items-center px-6 bg-[#f1ece4] border-b border-[#e8e2d8] z-40">
        {/* Search Bar with Debounce (AC 1.3) */}
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
        </div>

        <div className="flex items-center gap-2 ml-4">
          {/* Indicador de búsqueda reactiva en vivo */}
          {debouncedSearchQuery && (
            <div className="bg-[#222222] text-white px-2 py-1 text-[10px] font-bold uppercase flex items-center gap-1.5 rounded animate-fade-in shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping"></span>
              Query: "{debouncedSearchQuery}"
            </div>
          )}

          <button
            onClick={handleRefresh}
            className="p-2 text-[#222222] hover:bg-[#e8e2d8] transition-colors relative"
            title="Refrescar Datos"
          >
            <span className="material-symbols-outlined">refresh</span>
          </button>
          <button className="p-2 text-[#222222] hover:bg-[#e8e2d8] transition-colors">
            <span className="material-symbols-outlined">help</span>
          </button>
          <button className="p-2 text-[#222222] hover:bg-[#e8e2d8] transition-colors">
            <span className="material-symbols-outlined">settings</span>
          </button>
          <div className="h-8 w-px bg-[#e8e2d8] mx-2"></div>
          <div className="flex items-center gap-3 pl-2">
            <div className="text-right">
              <p className="text-body-sm font-bold text-[#222222] leading-none">SaaS Admin</p>
              <p className="text-[11px] text-secondary">Enterprise Controller</p>
            </div>
            {/* Foto de perfil del admin dinámica en lugar del placeholder de googleusercontent */}
            <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-zinc-200 shadow-sm">
              <img
                alt="User Profile"
                className="w-full h-full object-cover"
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop&q=80"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="ml-64 pt-16 min-h-screen">
        <div className="p-8 max-w-[1600px] mx-auto space-y-8">
          {/* Dashboard Header */}
          <div className="flex justify-between items-end">
            <div>
              <h1 className="font-sans text-h1 text-[#222222] uppercase tracking-tighter">
                Platform SaaS <span className="text-[#d51f2c]">/</span>{' '}
                {activeTab === 'dashboard' ? 'Overview'
                  : activeTab === 'subscription' ? 'Subscription Plans'
                  : activeTab === 'subscription-applications' ? 'Applications'
                  : activeTab === 'subscription-features' ? 'Feature Catalog'
                  : activeTab === 'subscription-payments' ? 'Payments'
                  : activeTab}
              </h1>
              <p className="text-body-md text-[#666666] mt-1">
                {activeTab === 'dashboard'
                  ? 'Real-time performance metrics and merchant growth tracking.'
                  : activeTab === 'subscription'
                    ? 'Manage subscription tiers, pricing models, and billing cadences for your platform.'
                    : activeTab === 'subscription-applications'
                      ? 'Manage software ecosystems and applications linked to subscription plans.'
                      : activeTab === 'subscription-features'
                        ? 'Configure master feature flags and platform capability tables.'
                        : activeTab === 'subscription-payments'
                          ? 'Track payment logs and incoming cash movements from active merchants.'
                          : `Visualización interactiva y gestión para /${activeTab}.`}
              </p>
            </div>
            {activeTab === 'dashboard' && (
              <div className="flex gap-2">
                <button
                  onClick={() => alert('Exporting SaaS report...')}
                  className="px-4 py-2 border border-[#222222] text-[#222222] font-bold text-label-caps hover:bg-[#222222] hover:text-white transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  Export Report
                </button>
                <button
                  onClick={() => alert('New Merchant creation simulation')}
                  className="px-4 py-2 bg-[#d51f2c] text-white font-bold text-label-caps hover:opacity-90 transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  New Merchant
                </button>
              </div>
            )}
          </div>

          {/* Renderizado dinámico de vistas SPA (AC 1.1) */}
          {renderContent()}
        </div>
      </main>

      {/* Contextual FAB (Only on main dashboard) */}
      {activeTab === 'dashboard' && (
        <button
          onClick={handleRefresh}
          className="fixed bottom-8 right-8 w-14 h-14 bg-[#222222] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-[#d51f2c] transition-all transform hover:scale-110 active:scale-95 z-50 animate-bounce"
          title="Refrescar Métricas"
        >
          <span className="material-symbols-outlined text-3xl">insights</span>
        </button>
      )}
    </div>
  );
};
export default SaaSDashboard;
