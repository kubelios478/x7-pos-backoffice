import React from 'react';

export type QuickLaunchAction = {
  id?: string;
  label: string;
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
        <h3 className="!text-white font-bold font-poppins text-lg">{title}</h3>
        <p className="text-white/60 font-poppins text-body-sm mt-1 max-w-md">{description}</p>
      </div>

      <div className="flex flex-wrap justify-center md:justify-end gap-3">
        {actions.map((action) => {
          if (action.active) {
            return (
              <span
                key={action.id ?? action.label}
                aria-current="page"
                className="px-6 py-3 bg-[#ae001a] text-white font-black font-poppins text-label-caps cursor-default border-b-2 border-white underline underline-offset-4 flex items-center gap-2"
              >
                {action.icon && <span className="material-symbols-outlined text-sm">{action.icon}</span>}
                {action.label}
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
                  ? 'px-6 py-3 bg-[#ae001a] text-white font-bold font-poppins text-label-caps hover:bg-[#930015] hover:text-[#ae001a] hover:-translate-y-0.5 transition-colors duration-200 rounded flex items-center gap-2'
                  : 'quick-launch-btn px-6 py-3 bg-white text-[#1d1c17] font-bold font-poppins text-label-caps border-b-4 border-[#ae001a] hover:text-[#ae001a] hover:-translate-y-0.5 transition-colors duration-200 flex items-center gap-2'
              }
            >
              {action.icon && <span className="material-symbols-outlined text-sm">{action.icon}</span>}
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
