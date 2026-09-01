import React from 'react';

export type QuickLaunchAction = {
  id?: string;
  label: string;
  icon?: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  active?: boolean;
  icon?: string;
};

type QuickLaunchPanelProps = {
  title?: string;
  description: string;
  actions: QuickLaunchAction[];
  className?: string;
};

export const QuickLaunchPanel: React.FC<QuickLaunchPanelProps> = ({
  title = 'Quick Launch',
  description,
  actions,
  className = '',
}) => {
  return (
    <div
      className={`bg-[#2a2a2a] rounded-xl p-8 flex flex-col md:flex-row justify-between items-center gap-6 ${className}`.trim()}
    >
      <div className="text-center md:text-left">
        <h3 className="!text-white font-bold text-lg font-sans tracking-wide">{title}</h3>
        <p className="text-white/60 text-body-sm mt-1 max-w-md font-sans">{description}</p>
      </div>

      <div className="flex flex-wrap justify-center md:justify-end gap-3 items-center">
        {actions.map((action) => {
          if (action.active) {
            return (
              <span
                key={action.id ?? action.label}
                aria-current="page"
                className="px-5 py-2.5 bg-[#ae001a] text-white font-black text-label-caps border-b-4 border-white cursor-default font-poppins flex items-center gap-2 rounded shadow-md"
              >
                {action.icon && (
                  <span className="material-symbols-outlined text-[18px] no-underline">{action.icon}</span>
                )}
                <span className="underline underline-offset-4 decoration-2">{action.label}</span>
              </span>
            );
          }

          const isDanger = action.variant === 'danger';

          return (
            <button
              key={action.id ?? action.label}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                action.onClick();
              }}
              className={
                isDanger
                  ? 'px-5 py-2.5 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#930015] hover:-translate-y-0.5 transition-all duration-200 rounded flex items-center gap-2 cursor-pointer font-poppins'
                  : 'quick-launch-btn px-5 py-2.5 bg-white text-[#1d1c17] font-bold text-label-caps border-b-4 border-[#ae001a] hover:text-[#ae001a] hover:border-[#ae001a] hover:-translate-y-0.5 transition-colors duration-200 rounded flex items-center gap-2 cursor-pointer font-poppins'
              }
            >
              {action.icon && (
                <span className="material-symbols-outlined text-[18px] transition-colors duration-200">{action.icon}</span>
              )}
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );

};

