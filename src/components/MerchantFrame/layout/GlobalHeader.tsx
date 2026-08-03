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
  onLogoClick
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tier, setTier] = useState<string>('');

  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

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

  // Buscar coincidencia en navCategories (aplica a todos los roles)
  if (navCategories.length > 0) {
    for (const cat of navCategories) {
      for (const app of cat.applications) {
        const feat = app.features.find(f => f.id === activeTab);
        if (feat) {
          parentAppName = app.name;
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

  // Forzar mapeo limpio para vistas especiales
  if (activeTab === 'products') {
    parentAppName = 'Product/Inventory System';
    activeFeatureName = 'Products';
  } else if (activeTab === 'categories') {
    parentAppName = 'Product/Inventory System';
    activeFeatureName = 'Categories';
  } else if (activeTab === 'stock-movements') {
    parentAppName = 'Product/Inventory System';
    activeFeatureName = 'Stock and Stock Movements Management';
  } else if (activeTab === 'locations') {
    parentAppName = 'Product/Inventory System';
    activeFeatureName = 'Inventory Locations';
  } else if (activeTab === 'purchase-orders') {
    parentAppName = 'Product/Inventory System';
    activeFeatureName = 'Purchase Orders';
  } else if (activeTab === 'merchant-directory') {
    parentAppName = 'Platform SaaS';
    activeFeatureName = 'Merchants';
  } else if (activeTab === 'user-management') {
    parentAppName = 'Platform SaaS';
    activeFeatureName = 'User Management';
  } else if (activeTab === 'company-profile') {
    parentAppName = 'Platform SaaS';
    activeFeatureName = 'Company Profile';
  } else if (activeTab === 'company-configurations') {
    parentAppName = 'Platform SaaS';
    activeFeatureName = 'Company Configurations';
  } else if (activeTab === 'saas-dashboard') {
    parentAppName = 'Platform SaaS';
    activeFeatureName = 'Overview';
  } else if (activeTab === 'dashboard') {
    parentAppName = 'CORE';
    activeFeatureName = 'Restaurant Overview';
  } else if (!parentAppName || !activeFeatureName) {
    parentAppName = activeCategory ? activeCategory.toUpperCase() : 'SYSTEM';
    activeFeatureName = activeTab ? activeTab.replace(/-/g, ' ').toUpperCase() : 'VIEW';
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
      {/* Apartado del Logo con su nombre, con su background de color negro */}
      <div className="w-64 h-full bg-[#222222] flex items-center gap-2 px-4 shrink-0 border-r border-white/10">
        {/* Botón de Hamburguesa */}
        <button 
          onClick={onToggleSidebar}
          className="p-1 hover:bg-white/10 active:scale-95 transition-all text-white rounded flex items-center justify-center cursor-pointer shrink-0"
          title={isSidebarCollapsed ? "Mostrar menú" : "Ocultar menú"}
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </button>

        {/* Logo / Branding del Backoffice */}
        <div 
          onClick={onLogoClick}
          className="flex items-center gap-2 cursor-pointer hover:opacity-90 active:scale-98 transition-all select-none min-w-0"
        >
          <img 
            alt="X7 Point of Sale" 
            className="w-auto object-contain h-[32px] shrink-0" 
            src={logoX7} 
          />
          <div className="text-left flex flex-col justify-center min-w-0">
            <span 
              style={{ color: '#ffffff', display: 'block', fontSize: '12px', fontWeight: 'bold', lineHeight: '1.2', letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
              POINT OF SALE
            </span>
            <span 
              style={{ color: '#d51f2c', display: 'block', fontSize: '9px', fontWeight: 'bold', lineHeight: '1.2', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}
            >
              Backoffice
            </span>
          </div>
        </div>
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
