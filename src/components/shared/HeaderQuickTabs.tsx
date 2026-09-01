import React from 'react';

export interface HeaderQuickTabItem {
  id: string;
  label: string;
  icon?: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string | number;
}

export interface HeaderQuickTabsProps {
  title?: string;
  badgeCount?: string | number;
  tabs: HeaderQuickTabItem[];
  rightElement?: React.ReactNode;
  className?: string;
}

export const HeaderQuickTabs: React.FC<HeaderQuickTabsProps> = ({
  title,
  badgeCount,
  tabs = [],
  rightElement,
  className = '',
}) => {
  const hasTabs = tabs && tabs.length > 0;

  return (
    <div
      className={`bg-[#222222] px-4 py-3 text-white flex flex-row items-center justify-between gap-4 rounded-t shadow-sm ${className}`}
    >
      {/* Sección Izquierda: Título y Contador Badge */}
      <div className="flex items-center gap-3 min-w-0">
        {title && (
          <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans text-xs sm:text-sm truncate">
            {title}
          </span>
        )}
        {badgeCount !== undefined && badgeCount !== null && (
          <span className="text-[10px] font-mono font-bold bg-[#333333] text-zinc-300 px-2.5 py-0.5 rounded border border-[#444444] shrink-0">
            {badgeCount}
          </span>
        )}
      </div>

      {/* Sección Derecha: Pestañas de Navegación Rápida y/o Menú de Opciones */}
      <div className="flex items-center gap-3 shrink-0">
        {hasTabs && (
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={tab.onClick}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-colors duration-200 flex items-center gap-1.5 cursor-pointer font-sans select-none whitespace-nowrap ${
                  tab.active
                    ? 'bg-[#ae001a] text-white shadow-xs'
                    : 'text-zinc-300 hover:text-[#ae001a] hover:bg-zinc-800'
                }`}
              >
                {tab.icon && (
                  <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                )}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                      tab.active ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Elemento Opcional a la Derecha (ej: Menú de tres puntos TableOptionsMenu) */}
        {rightElement && (
          <div className="flex items-center shrink-0">
            {rightElement}
          </div>
        )}
      </div>
    </div>
  );
};
