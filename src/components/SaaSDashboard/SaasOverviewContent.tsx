import React from 'react';
import { MetricsGrid } from './MetricsGrid';
import { ARRChart } from './ARRChart';
import { RecentMerchants } from './RecentMerchants';
import { PlatformHealth } from './PlatformHealth';

interface SaasOverviewContentProps {
  refreshTrigger: number;
  onNavigateToView: (view: string) => void;
}

export const SaasOverviewContent: React.FC<SaasOverviewContentProps> = ({
  refreshTrigger,
  onNavigateToView,
}) => {
  return (
    <div className="space-y-6">
      {/* Bento Grid Metrics */}
      <MetricsGrid refreshTrigger={refreshTrigger} />

      {/* Revenue and Recently Joined Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Growth (ARR) */}
        <ARRChart />

        {/* Recently Joined Merchants */}
        <RecentMerchants
          onNavigateToView={onNavigateToView}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {/* Platform Health Section */}
      <PlatformHealth refreshTrigger={refreshTrigger} />
    </div>
  );
};

export default SaasOverviewContent;
