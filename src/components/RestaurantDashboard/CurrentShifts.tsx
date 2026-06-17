import React, { useEffect, useState } from 'react';
import { restaurantService } from '../../services/restaurantService';
import type { ActiveShift } from '../../services/restaurantService';

interface CurrentShiftsProps {
  refreshTrigger: number;
}

export const CurrentShifts: React.FC<CurrentShiftsProps> = ({ refreshTrigger }) => {
  const [shifts, setShifts] = useState<ActiveShift[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShifts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await restaurantService.getActiveShifts();
      setShifts(data);
    } catch (err) {
      setError('Error al obtener turnos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="bg-white border border-[#e8e2d8] flex flex-col h-[400px]">
        <div className="p-4 border-b border-[#e8e2d8] flex justify-between items-center">
          <span className="font-label-caps text-label-caps text-[#222222]">CURRENT SHIFTS</span>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 border border-[#e8e2d8] h-14">
              <div className="flex items-center gap-3 w-full">
                <div className="w-8 h-8 rounded-full bg-zinc-200"></div>
                <div className="flex-grow space-y-1.5">
                  <div className="h-3.5 bg-zinc-200 rounded w-1/3"></div>
                  <div className="h-2.5 bg-zinc-200 rounded w-1/2"></div>
                </div>
              </div>
              <div className="w-14 h-5 bg-zinc-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-[#e8e2d8] flex flex-col h-[400px]">
        <div className="p-4 border-b border-[#e8e2d8] flex justify-between items-center">
          <span className="font-label-caps text-label-caps text-[#222222]">CURRENT SHIFTS</span>
        </div>
        <div className="flex-grow flex flex-col items-center justify-center p-6 gap-3 text-center">
          <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
          <p className="text-body-sm text-red-600 font-bold">{error}</p>
          <button
            onClick={fetchShifts}
            className="px-3 py-1.5 bg-[#d51f2c] text-white font-bold text-[10px] uppercase hover:opacity-90 transition-all"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e8e2d8] flex flex-col h-[400px]">
      <div className="p-4 border-b border-[#e8e2d8] flex justify-between items-center bg-[#f9f7f4]">
        <span className="font-label-caps text-label-caps text-[#222222]">CURRENT SHIFTS</span>
        <button
          onClick={() => alert('Manage all shifts clicked')}
          className="text-[11px] font-bold text-[#d51f2c] uppercase hover:underline"
        >
          Manage All
        </button>
      </div>
      <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
        {shifts.map((shift) => (
          <div
            key={shift.id}
            className={`flex items-center justify-between p-3 border border-[#e8e2d8] ${
              shift.status === 'Late' ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#f1ece4] flex items-center justify-center text-[12px] font-bold text-[#222222] border border-[#e8e2d8]">
                {shift.initials}
              </div>
              <div>
                <p className="text-body-sm font-semibold text-[#222222]">{shift.name}</p>
                <p className="text-[11px] text-secondary">{shift.role} • {shift.timeText}</p>
              </div>
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 font-bold rounded-sm uppercase ${
                shift.status === 'Active'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-[#e2dfde] text-[#474746]'
              }`}
            >
              {shift.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
export default CurrentShifts;
