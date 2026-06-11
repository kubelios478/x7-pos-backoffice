import React, { useEffect, useState, useRef } from 'react';
import 'chart.js/auto';
import { Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { saasService } from '../../services/saasService';
import type { RevenueData } from '../../services/saasService';


export const ARRChart: React.FC = () => {
  const [period, setPeriod] = useState<'1M' | '6M' | '1Y'>('6M');
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<any>(null);

  const fetchRevenue = async (selectedPeriod: '1M' | '6M' | '1Y') => {
    setLoading(true);
    setError(null);
    try {
      const data = await saasService.getRevenue(selectedPeriod);
      setRevenueData(data);
    } catch (err) {
      setError('Error al cargar datos de ingresos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRevenue(period);
  }, [period]);

  const getChartData = (): ChartData<'line'> => {
    if (!revenueData) {
      return { labels: [], datasets: [] };
    }

    return {
      labels: revenueData.labels,
      datasets: [
        {
          label: 'Revenue (ARR)',
          data: revenueData.values,
          borderColor: '#222222',
          borderWidth: 3,
          backgroundColor: (context: any) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) {
              return 'rgba(213, 31, 44, 0.1)';
            }
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(213, 31, 44, 0.4)');
            gradient.addColorStop(1, 'rgba(213, 31, 44, 0.01)');
            return gradient;
          },
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#d51f2c',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#222222',
        titleFont: { family: 'Poppins', size: 12 },
        bodyFont: { family: 'Poppins', size: 13, weight: 'bold' },
        padding: 10,
        displayColors: false,
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0,
              }).format(context.parsed.y);
            }
            return label;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            family: 'Poppins',
            size: 11,
          },
          color: '#666666',
        },
      },
      y: {
        grid: {
          color: '#e8e2d8',
        },
        ticks: {
          font: {
            family: 'Poppins',
            size: 11,
          },
          color: '#666666',
          callback: function (value: any) {
            if (value >= 1e6) {
              return '$' + (value / 1e6).toFixed(1) + 'M';
            }
            if (value >= 1e3) {
              return '$' + (value / 1e3).toFixed(0) + 'k';
            }
            return '$' + value;
          },
        },
      },
    },
  };

  return (
    <div className="lg:col-span-2 bg-white border border-[#e8e2d8]">
      <div className="px-lg py-md border-b border-[#e8e2d8] flex justify-between items-center bg-[#f9f7f4]">
        <h3 className="font-sans text-label-caps text-[#222222]">Revenue Growth (ARR)</h3>
        <div className="flex gap-2">
          {(['1M', '6M', '1Y'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-label-caps px-3 py-1 font-bold border transition-colors ${
                period === p
                  ? 'text-white bg-[#222222] border-[#222222]'
                  : 'text-[#222222] bg-white border-[#e8e2d8] hover:bg-[#f9f7f4]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="p-lg">
        {loading ? (
          <div className="animate-pulse">
            <div className="flex items-baseline gap-2 mb-6">
              <div className="h-10 bg-zinc-200 rounded w-28"></div>
              <div className="h-5 bg-zinc-200 rounded w-36"></div>
            </div>
            <div className="relative w-full h-[300px] bg-[#f9f7f4] border border-dashed border-[#e8e2d8] rounded flex items-center justify-center">
              <div className="text-label-caps text-[#666666]">Cargando gráfico de ingresos...</div>
            </div>
          </div>
        ) : error || !revenueData ? (
          <div>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-h1 font-black text-red-600">$0.00</span>
              <span className="text-body-sm text-red-500 font-bold">{error || 'Error'}</span>
            </div>
            <div className="relative w-full h-[300px] bg-red-50/20 border border-dashed border-red-200 rounded flex flex-col items-center justify-center gap-3">
              <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
              <span className="text-label-caps text-red-500">Error al cargar la visualización del ARR</span>
              <button
                onClick={() => fetchRevenue(period)}
                className="px-3 py-1 bg-[#d51f2c] text-white font-bold text-[10px] uppercase hover:opacity-90 transition-all"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-h1 font-black text-[#222222]">{revenueData.amount}</span>
              <span className="text-body-md text-[#d51f2c] font-bold">
                {revenueData.growthVsPrevYear}
              </span>
            </div>
            <div className="relative w-full h-[300px] bg-[#f9f7f4] border border-[#e8e2d8] p-4 rounded">
              <Line ref={chartRef} data={getChartData()} options={chartOptions} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
