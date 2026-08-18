import React from 'react';

export type QuickLaunchAction = {
  id?: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  active?: boolean;
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
        <h3 className="!text-white font-bold text-lg">{title}</h3>
        <p className="text-white/60 text-body-sm mt-1 max-w-md">{description}</p>
      </div>

      <div className="flex flex-wrap justify-center md:justify-end gap-3">
        {actions.map((action) => {
          if (action.active) {
            return (
              <span
                key={action.id ?? action.label}
                aria-current="page"
                className="px-6 py-3 bg-[#ae001a] text-white font-bold text-label-caps border-b-4 border-white cursor-default"
              >
                {action.label}
              </span>
            );
          }

          const isDanger = action.variant === 'danger';

          return (
            <button
              key={action.id ?? action.label}
              type="button"
              onClick={action.onClick}
              className={
                isDanger
                  ? 'px-6 py-3 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#930015] hover:-translate-y-0.5 transition-all rounded'
                  : 'quick-launch-btn px-6 py-3 bg-white text-[#1d1c17] font-bold text-label-caps border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-all'
              }
            >
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
