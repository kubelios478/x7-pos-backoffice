import React, { useState } from 'react';

interface KitchenMonitorViewProps {
  onBackToDashboard: () => void;
}

interface TicketItem {
  name: string;
  qty: number;
  notes?: string;
}

interface KitchenTicket {
  id: string;
  table: string;
  timeElapsed: number; // en minutos
  server: string;
  items: TicketItem[];
  priority: 'high' | 'medium' | 'normal';
}

export const KitchenMonitorView: React.FC<KitchenMonitorViewProps> = ({ onBackToDashboard }) => {
  const [tickets, setTickets] = useState<KitchenTicket[]>([
    {
      id: 'T105',
      table: 'Table 14',
      timeElapsed: 12,
      server: 'Sarah T.',
      priority: 'high',
      items: [
        { name: 'Classic Wagyu Burger', qty: 2, notes: 'Medium Rare, No Onions' },
        { name: 'Truffle Mushroom Pizza', qty: 1 },
        { name: 'French Fries', qty: 2 },
      ],
    },
    {
      id: 'T106',
      table: 'Table 8',
      timeElapsed: 8,
      server: 'Sarah T.',
      priority: 'medium',
      items: [
        { name: 'Warm Lava Cake', qty: 2, notes: 'Add Vanilla Ice Cream' },
        { name: 'Espresso', qty: 2 },
      ],
    },
    {
      id: 'T107',
      table: 'Table 21',
      timeElapsed: 3,
      server: 'David L.',
      priority: 'normal',
      items: [
        { name: 'Truffle Mushroom Pizza', qty: 2 },
        { name: 'Napa Cabernet 2018', qty: 1 },
      ],
    },
    {
      id: 'T108',
      table: 'Bar 3',
      timeElapsed: 1,
      server: 'Robert K.',
      priority: 'normal',
      items: [
        { name: 'Classic Wagyu Burger', qty: 1, notes: 'Well Done' },
        { name: 'Local IPA Beer', qty: 1 },
      ],
    },
  ]);

  const handleCompleteTicket = (id: string) => {
    setTickets((prev) => prev.filter((ticket) => ticket.id !== id));
  };

  const getPriorityColors = (priority: KitchenTicket['priority']) => {
    switch (priority) {
      case 'high':
        return {
          border: 'border-red-500',
          badge: 'bg-red-100 text-red-700',
          text: 'text-red-700',
        };
      case 'medium':
        return {
          border: 'border-yellow-500',
          badge: 'bg-yellow-100 text-yellow-700',
          text: 'text-yellow-700',
        };
      case 'normal':
      default:
        return {
          border: 'border-[#e8e2d8]',
          badge: 'bg-[#f1ece4] text-[#222222]',
          text: 'text-secondary',
        };
    }
  };

  return (
    <div className="fixed inset-0 bg-[#16171d] z-50 flex flex-col font-sans text-white">
      {/* KDS Header */}
      <header className="h-16 bg-[#222222] border-b border-white/10 px-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
          <h1 className="font-sans text-lg font-black tracking-wider text-white flex items-center gap-2">
            KITCHEN DISPLAY STATION <span className="text-[#d51f2c]">/</span> LIVE KDS
          </h1>
        </div>
        <button
          onClick={onBackToDashboard}
          className="px-4 py-2 bg-[#d51f2c] text-white font-bold text-label-caps hover:bg-[#b01a24] transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Back to Dashboard
        </button>
      </header>

      {/* KDS Main Grid */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-6 items-start custom-scrollbar">
        {tickets.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center">
            <span className="material-symbols-outlined text-emerald-500 text-6xl">check_circle</span>
            <div>
              <h2 className="text-xl font-bold">All Orders Cleared!</h2>
              <p className="text-white/50 text-sm mt-1">Excellent performance. Kitchen is at 100% preparation rate.</p>
            </div>
            <button
              onClick={onBackToDashboard}
              className="mt-2 px-4 py-2 bg-white/10 text-white font-bold text-label-caps hover:bg-white/20 transition-all"
            >
              Regresar al Backoffice
            </button>
          </div>
        ) : (
          tickets.map((ticket) => {
            const pColors = getPriorityColors(ticket.priority);
            return (
              <div
                key={ticket.id}
                className={`w-80 bg-[#222222] border-t-4 ${pColors.border} rounded-sm flex flex-col max-h-[90%] shadow-2xl flex-shrink-0`}
              >
                {/* Ticket Header */}
                <div className="p-4 border-b border-white/10 flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-base text-white">{ticket.table}</h2>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${pColors.badge}`}>
                        {ticket.priority}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/50 mt-1">
                      ID: {ticket.id} • Server: {ticket.server}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-sm ${ticket.timeElapsed >= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                      {ticket.timeElapsed}m
                    </p>
                    <p className="text-[9px] text-white/40 uppercase font-bold tracking-wider">Elapsed</p>
                  </div>
                </div>

                {/* Ticket Items List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  {ticket.items.map((item, idx) => (
                    <div key={idx} className="flex gap-3 items-start">
                      <span className="w-6 h-6 bg-white/10 rounded flex items-center justify-center font-bold text-sm text-[#d51f2c] flex-shrink-0">
                        {item.qty}
                      </span>
                      <div className="flex-1">
                        <p className="text-body-sm font-semibold text-white leading-tight">
                          {item.name}
                        </p>
                        {item.notes && (
                          <p className="text-[11px] text-yellow-400/90 font-medium mt-1 italic">
                            * {item.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action button */}
                <button
                  onClick={() => handleCompleteTicket(ticket.id)}
                  className="w-full py-3 bg-[#333333] hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-widest transition-colors border-t border-white/10 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">done</span>
                  Done &amp; Serve
                </button>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
};
export default KitchenMonitorView;
