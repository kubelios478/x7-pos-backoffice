import React, { useEffect, useState } from 'react';

export interface NavHubItem {
  id: string;
  label: string;
  icon?: string;
  active?: boolean;
  onClick: () => void;
}

export interface NavHubBarProps {
  title?: string;
  titleIcon?: string;
  items: NavHubItem[];
  className?: string;
  isSidebarCollapsed?: boolean;
}

export const NavHubBar: React.FC<NavHubBarProps> = ({
  title,
  titleIcon,
  items = [],
  className = '',
  isSidebarCollapsed: propIsSidebarCollapsed,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  useEffect(() => {
    if (propIsSidebarCollapsed !== undefined) {
      setCollapsed(propIsSidebarCollapsed);
      return;
    }

    const checkSidebar = () => {
      const aside = document.querySelector('aside');
      if (aside) {
        setCollapsed(aside.classList.contains('-translate-x-full'));
      }
    };

    checkSidebar();
    const aside = document.querySelector('aside');
    if (!aside) return;

    const observer = new MutationObserver(checkSidebar);
    observer.observe(aside, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, [propIsSidebarCollapsed]);

  const leftOffsetClass = collapsed ? 'left-0' : 'left-0 md:left-64';

  return (
    <div
      className={`fixed bottom-0 ${leftOffsetClass} right-0 z-40 bg-[#222222] border-t-2 border-[#ae001a] text-white py-2 px-4 shadow-2xl font-sans transition-all duration-300 ease-in-out ${className}`}
    >
      <div className="w-full flex items-center justify-center relative">
        {/* Título de la barra (Si existe, alineado a la izquierda) */}
        {title && (
          <div className="hidden lg:flex items-center gap-2 text-xs font-bold tracking-wider text-[#e8e2d8] uppercase absolute left-4">
            {titleIcon && (
              <span className="material-symbols-outlined text-[#ae001a] text-lg">
                {titleIcon}
              </span>
            )}
            <span>{title}</span>
          </div>
        )}

        {/* Arreglo de Botones de Navegación PERFECTAMENTE CENTRADOS */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-colors duration-200 flex items-center gap-1.5 cursor-pointer font-sans select-none whitespace-nowrap ${
                item.active
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-zinc-300 hover:text-[#ae001a] hover:bg-zinc-800'
              }`}
            >
              {item.icon && (
                <span className="material-symbols-outlined text-sm">{item.icon}</span>
              )}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
