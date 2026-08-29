import React, { useState, useRef, useEffect } from 'react';

export interface ColumnOption {
  key: string;
  label: string;
}

export interface CustomActionOption {
  icon: string;
  label: string;
  onClick: () => void;
  colorClass?: string;
}

export interface TableOptionsMenuProps {
  // Pestaña Acciones
  onExportCSV?: () => void;
  onPrint?: () => void;
  onCopySummary?: () => void;
  onReload?: () => void;
  customActions?: CustomActionOption[];

  // Pestaña Columnas
  columns?: ColumnOption[];
  visibleColumns?: Record<string, boolean>;
  onToggleColumn?: (columnKey: string) => void;

  // Pestaña Vista & Densidad
  rowDensity?: 'compact' | 'comfortable' | 'spacious';
  onChangeDensity?: (density: 'compact' | 'comfortable' | 'spacious') => void;

  // Paginación y Límites
  totalItems?: number;
  pageSize?: number;
  onChangePageSize?: (size: number) => void;
  pageSizeOptions?: number[];
}

export const TableOptionsMenu: React.FC<TableOptionsMenuProps> = ({
  onExportCSV,
  onPrint,
  onCopySummary,
  onReload,
  customActions = [],
  columns = [],
  visibleColumns = {},
  onToggleColumn,
  rowDensity,
  onChangeDensity,
  totalItems = 0,
  pageSize,
  onChangePageSize,
  pageSizeOptions = [5, 10, 25, 50],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Determinar pestañas disponibles
  const hasActionsTab = !!(onExportCSV || onPrint || onCopySummary || onReload || customActions.length > 0);
  const hasColumnsTab = columns.length > 0 && !!onToggleColumn;
  const hasDensityTab = !!(onChangeDensity || (onChangePageSize && totalItems > 5));

  const [activeTab, setActiveTab] = useState<'tools' | 'columns' | 'density'>(
    hasActionsTab ? 'tools' : hasColumnsTab ? 'columns' : 'density'
  );

  // Cerrar el menú al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredLimits = pageSizeOptions.filter((t) => t <= totalItems || t === 5);

  return (
    <div className="relative inline-block text-left font-sans" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer outline-none"
        title="Table Directory Options"
      >
        <span className="material-symbols-outlined text-base">more_vert</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-[#e8e2d8] rounded-lg shadow-2xl z-50 text-left font-sans text-xs animate-fade-in overflow-hidden">
          {/* Tabs de Selección Superior */}
          <div className="flex border-b border-[#e8e2d8] bg-[#f8f3eb]">
            {hasActionsTab && (
              <button
                type="button"
                onClick={() => setActiveTab('tools')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                  activeTab === 'tools'
                    ? 'bg-white text-[#ae001a] border-b-2 border-[#ae001a]'
                    : 'text-[#5f5e5e] hover:text-[#1c1b16]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">build</span>
                Actions
              </button>
            )}
            {hasColumnsTab && (
              <button
                type="button"
                onClick={() => setActiveTab('columns')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                  activeTab === 'columns'
                    ? 'bg-white text-[#ae001a] border-b-2 border-[#ae001a]'
                    : 'text-[#5f5e5e] hover:text-[#1c1b16]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">view_column</span>
                Columns
              </button>
            )}
            {hasDensityTab && (
              <button
                type="button"
                onClick={() => setActiveTab('density')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                  activeTab === 'density'
                    ? 'bg-white text-[#ae001a] border-b-2 border-[#ae001a]'
                    : 'text-[#5f5e5e] hover:text-[#1c1b16]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">tune</span>
                View & Density
              </button>
            )}
          </div>

          {/* Tab 1: Acciones & Herramientas */}
          {activeTab === 'tools' && hasActionsTab && (
            <div className="py-2">
              {onExportCSV && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onExportCSV();
                  }}
                  className="w-full px-4 py-2.5 hover:bg-[#fef9f1] text-[#1c1b16] font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base text-[#ae001a]">download</span>
                  <span>Export Directory to CSV</span>
                </button>
              )}

              {onPrint && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onPrint();
                  }}
                  className="w-full px-4 py-2.5 hover:bg-[#fef9f1] text-[#1c1b16] font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base text-zinc-600">print</span>
                  <span>Print Product Directory</span>
                </button>
              )}

              {onCopySummary && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onCopySummary();
                  }}
                  className="w-full px-4 py-2.5 hover:bg-[#fef9f1] text-[#1c1b16] font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base text-amber-700">content_copy</span>
                  <span>Copy Summary to Clipboard</span>
                </button>
              )}

              {customActions.map((action, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    action.onClick();
                  }}
                  className="w-full px-4 py-2.5 hover:bg-[#fef9f1] text-[#1c1b16] font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-base ${action.colorClass || 'text-zinc-600'}`}>
                    {action.icon}
                  </span>
                  <span>{action.label}</span>
                </button>
              ))}

              {onReload && (
                <>
                  <div className="border-t border-[#e8e2d8] my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onReload();
                    }}
                    className="w-full px-4 py-2.5 hover:bg-[#fef9f1] text-[#1c1b16] font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base text-emerald-700">refresh</span>
                    <span>Reload Catalog Data</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* Tab 2: Personalizar Columnas */}
          {activeTab === 'columns' && hasColumnsTab && (
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">
                <span>Show / Hide Columns</span>
                <span className="text-[9px] text-zinc-400 font-normal">Min 1 visible</span>
              </div>
              {columns.map((col) => {
                const isChecked = visibleColumns[col.key] !== false;
                const activeCount = columns.filter((c) => visibleColumns[c.key] !== false).length;
                const isOnlyOneActive = isChecked && activeCount <= 1;

                return (
                  <label
                    key={col.key}
                    className={`flex items-center justify-between p-1.5 rounded text-[#1c1b16] font-bold select-none ${
                      isOnlyOneActive
                        ? 'opacity-50 cursor-not-allowed bg-zinc-50'
                        : 'hover:bg-[#fef9f1] cursor-pointer'
                    }`}
                    title={isOnlyOneActive ? 'At least 1 column must remain visible' : undefined}
                  >
                    <span>{col.label}</span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isOnlyOneActive}
                      onChange={() => !isOnlyOneActive && onToggleColumn && onToggleColumn(col.key)}
                      className="accent-[#ae001a] cursor-pointer disabled:cursor-not-allowed"
                    />
                  </label>
                );
              })}
            </div>
          )}

          {/* Tab 3: Densidad & Filas por Página */}
          {activeTab === 'density' && hasDensityTab && (
            <div className="p-3 space-y-4">
              {/* Densidad de Fila */}
              {onChangeDensity && (
                <div>
                  <div className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">
                    Row Density (Padding)
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-[#f2ede5] p-1 rounded">
                    {[
                      { key: 'compact', label: 'Compact' },
                      { key: 'comfortable', label: 'Comfortable' },
                      { key: 'spacious', label: 'Spacious' },
                    ].map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => onChangeDensity(d.key as any)}
                        className={`py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                          rowDensity === d.key
                            ? 'bg-white text-[#ae001a] shadow-xs'
                            : 'text-[#5f5e5e] hover:text-[#1c1b16]'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cantidad de Registros por Página */}
              {onChangePageSize && totalItems > 5 && (
                <div>
                  <div className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">
                    Visible Rows per Page
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {filteredLimits.map((limit) => (
                      <button
                        key={limit}
                        type="button"
                        onClick={() => onChangePageSize(limit)}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                          pageSize === limit && pageSize < totalItems
                            ? 'bg-[#ae001a] text-white border-[#ae001a]'
                            : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:bg-[#fef9f1]'
                        }`}
                      >
                        {limit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => onChangePageSize(9999)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                        (pageSize && pageSize >= totalItems) || pageSize === 9999
                          ? 'bg-[#ae001a] text-white border-[#ae001a]'
                          : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:bg-[#fef9f1]'
                      }`}
                    >
                      All
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const NoColumnsEmptyState: React.FC = () => (
  <div className="p-12 text-center bg-[#fef9f1] border-t border-[#e8e2d8] flex flex-col items-center justify-center gap-2 font-sans select-none">
    <span className="material-symbols-outlined text-4xl text-[#5f5e5e]">
      view_column
    </span>
    <p className="text-body-md font-bold text-[#1d1c17]">No Columns Selected</p>
    <p className="text-body-sm text-[#5f5e5e] max-w-sm">
      All table columns are currently hidden. Open the 3-dots menu (⋮) to toggle visible columns.
    </p>
  </div>
);
