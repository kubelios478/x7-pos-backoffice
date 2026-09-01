import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCompanyConfigurations } from '../../../../api/companies';
import {
  getConfigurationStatusClass,
} from '../../../../lib/company-configurations';
import { navigateToDashboardFeature } from '../../../../lib/merchant-directory-navigation';
import type { CompanyConfigurationsData } from '../../../../types/company';

const CONFIGURATION_MODULES = [
  {
    label: 'Payroll Rules',
    description: 'Corporate payroll calculation policies across branches.',
    icon: 'payments',
    target: { activeTab: 'merchant-payroll-rules', activeCategory: 'financehr' },
  },
  {
    label: 'Overtime Rules',
    description: 'Shared overtime thresholds and branch compliance settings.',
    icon: 'schedule',
    target: { activeTab: 'merchant-overtime-rules', activeCategory: 'financehr' },
  },
  {
    label: 'Tips Configuration',
    description: 'Tip pooling and settlement policies for corporate stores.',
    icon: 'savings',
    target: { activeTab: 'tips', activeCategory: 'restaurantoperations' },
  },
] as const;

export const CompanyConfigurationsView: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<CompanyConfigurationsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfigurations = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getCompanyConfigurations();
      setData(response);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to load company configurations. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadConfigurations();
  }, []);

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => navigate('/dashboard/company-profile')}
          className="px-5 py-2.5 border border-[#e8e2d8] rounded font-semibold text-[#1d1c17] bg-white hover:bg-[#f8f3eb] transition-colors text-label-caps"
        >
          Back to Company Profile
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm">
          <span className="material-symbols-outlined animate-spin text-primary text-4xl">
            sync
          </span>
          <p className="text-secondary text-body-md mt-2 font-sans">
            Loading corporate configurations...
          </p>
        </div>
      ) : error ? (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm">
          <span className="material-symbols-outlined text-[#ba1a1a] text-4xl">
            error
          </span>
          <p className="text-[#ba1a1a] font-bold mt-2 font-sans">{error}</p>
          <button
            type="button"
            onClick={() => void loadConfigurations()}
            className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans"
          >
            Retry Connection
          </button>
        </div>
      ) : data ? (
        <>
          <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
            <div className="bg-[#222222] p-4">
              <span className="text-label-caps font-bold text-white uppercase tracking-wider">
                CORPORATE SYSTEM CONFIGURATIONS
              </span>
              <p className="text-white/80 text-body-sm mt-2 max-w-3xl">
                Global system variables and branch-level configuration records
                linked to your parent company.
              </p>
            </div>

            <div className="p-8 space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryTile
                  label="Total Configuration Records"
                  value={data.summary.totalConfigurations}
                  icon="tune"
                />
                <SummaryTile
                  label="Active Configurations"
                  value={data.summary.activeConfigurations}
                  icon="check_circle"
                />
                <SummaryTile
                  label="Configuration Types"
                  value={data.summary.configurationTypes}
                  icon="category"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {CONFIGURATION_MODULES.map((module) => (
                  <button
                    key={module.label}
                    type="button"
                    onClick={() =>
                      navigateToDashboardFeature(navigate, module.target)
                    }
                    className="text-left border border-[#e8e2d8] rounded p-5 bg-[#f9f7f4] hover:bg-[#f8f3eb] hover:border-[#ae001a]/40 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[#ae001a] text-2xl">
                      {module.icon}
                    </span>
                    <p className="font-bold text-[#1d1c17] mt-3">{module.label}</p>
                    <p className="text-body-sm text-secondary mt-1">
                      {module.description}
                    </p>
                  </button>
                ))}
              </div>

              <div className="border border-[#e8e2d8] rounded overflow-hidden">
                <div className="bg-[#ece8e0] px-6 py-3 border-b border-[#e8e2d8]">
                  <span className="text-label-caps font-bold text-[#5f5e5e]">
                    Configuration Registry
                  </span>
                </div>

                {data.items.length === 0 ? (
                  <div className="px-6 py-14">
                    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 text-center">
                      <span className="material-symbols-outlined text-[#5f5e5e] text-5xl">
                        settings
                      </span>
                      <p className="text-[#1d1c17] font-bold font-sans">
                        No configuration records found for this company yet.
                      </p>
                      <p className="text-body-sm text-secondary font-sans leading-relaxed">
                        Use the module shortcuts above to create payroll, overtime,
                        or tips policies for your corporate branches.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead className="bg-white border-b border-[#e8e2d8]">
                        <tr>
                          <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                            Configuration Type
                          </th>
                          <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                            Branch
                          </th>
                          <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                            Last Updated
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-[#e8e2d8] hover:bg-[#f8f3eb] transition-colors"
                          >
                            <td className="px-6 py-4 font-bold text-[#1d1c17]">
                              {item.configurationLabel}
                            </td>
                            <td className="px-6 py-4 text-body-md text-[#1d1c17]">
                              <p>{item.merchantName}</p>
                              <p className="text-body-sm text-secondary">
                                Branch ID: {item.merchantId}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex px-3 py-1 rounded-full text-label-caps font-bold ${getConfigurationStatusClass(item.status)}`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-body-md text-[#1d1c17]">
                              {item.updatedAt}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

function SummaryTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="border border-[#e8e2d8] rounded p-4 text-center bg-[#f9f7f4]">
      <span className="material-symbols-outlined text-[#ae001a] text-2xl">
        {icon}
      </span>
      <p className="text-2xl font-black text-[#1d1c17] mt-2">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mt-1">
        {label}
      </p>
    </div>
  );
}
