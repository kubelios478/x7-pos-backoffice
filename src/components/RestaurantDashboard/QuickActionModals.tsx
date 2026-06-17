import React, { useState } from 'react';
import { setAuthenticatedState, setSimulate401 } from '../../services/restaurantService';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Modal 1: Nueva Reserva
export const NewReservationModal: React.FC<ModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-[#e8e2d8] p-6 max-w-md w-full rounded">
        <h3 className="font-bold text-lg text-[#222222] uppercase border-b border-[#e8e2d8] pb-3 mb-4">
          New Reservation
        </h3>
        <form onSubmit={(e) => { e.preventDefault(); alert('Reserva guardada con éxito'); onClose(); }} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-bold text-secondary uppercase mb-1">Guest Name</label>
            <input required type="text" className="w-full bg-white border border-[#e8e2d8] p-2 text-body-sm focus:ring-0 focus:border-[#222222]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-secondary uppercase mb-1">Guests (Pax)</label>
              <input required type="number" min="1" defaultValue="2" className="w-full bg-white border border-[#e8e2d8] p-2 text-body-sm focus:ring-0 focus:border-[#222222]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-secondary uppercase mb-1">Time</label>
              <input required type="time" defaultValue="19:00" className="w-full bg-white border border-[#e8e2d8] p-2 text-body-sm focus:ring-0 focus:border-[#222222]" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-[#e8e2d8] text-secondary font-bold text-xs uppercase hover:bg-[#f9f7f4]">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-[#d51f2c] text-white font-bold text-xs uppercase hover:opacity-90">
              Confirm Reservation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Modal 2: Anular Transacción
export const VoidTransactionModal: React.FC<ModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-[#e8e2d8] p-6 max-w-md w-full rounded">
        <h3 className="font-bold text-lg text-red-600 uppercase border-b border-[#e8e2d8] pb-3 mb-4 flex items-center gap-1.5">
          <span className="material-symbols-outlined">warning</span> Void Transaction
        </h3>
        <form onSubmit={(e) => { e.preventDefault(); alert('Transacción anulada'); onClose(); }} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-bold text-secondary uppercase mb-1">Ticket Number / ID</label>
            <input required placeholder="e.g. TXN-9842" type="text" className="w-full bg-white border border-[#e8e2d8] p-2 text-body-sm focus:ring-0 focus:border-[#222222]" />
          </div>
          <div>
            <label className="block text-xs font-bold text-secondary uppercase mb-1">Reason for Void</label>
            <select className="w-full bg-white border border-[#e8e2d8] p-2 text-body-sm focus:ring-0 focus:border-[#222222]">
              <option>Customer changed mind</option>
              <option>Incorrect item entry</option>
              <option>System error / payment mismatch</option>
              <option>Manager override</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-[#e8e2d8] text-secondary font-bold text-xs uppercase hover:bg-[#f9f7f4]">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-red-600 text-white font-bold text-xs uppercase hover:opacity-90">
              Void Ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Modal 3: Reporte de Fin de Día (EOD)
export const EODReportModal: React.FC<ModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-[#e8e2d8] p-6 max-w-md w-full rounded text-left">
        <h3 className="font-bold text-lg text-[#222222] uppercase border-b border-[#e8e2d8] pb-3 mb-4">
          End of Day (EOD) Report Summary
        </h3>
        <div className="space-y-3 mb-6">
          <div className="flex justify-between border-b border-dashed border-[#e8e2d8] pb-2">
            <span className="text-secondary text-body-sm">Operational Date</span>
            <span className="font-bold text-body-sm">June 15, 2026</span>
          </div>
          <div className="flex justify-between border-b border-dashed border-[#e8e2d8] pb-2">
            <span className="text-secondary text-body-sm">Gross Sales</span>
            <span className="font-bold text-body-sm text-emerald-600">$12,482.50</span>
          </div>
          <div className="flex justify-between border-b border-dashed border-[#e8e2d8] pb-2">
            <span className="text-secondary text-body-sm">Transactions Completed</span>
            <span className="font-bold text-body-sm">242</span>
          </div>
          <div className="flex justify-between border-b border-dashed border-[#e8e2d8] pb-2">
            <span className="text-secondary text-body-sm">Voided Tickets</span>
            <span className="font-bold text-body-sm text-red-600">3 ($184.20)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary text-body-sm">Terminals Settled</span>
            <span className="font-bold text-body-sm text-emerald-600">4 / 4 Online</span>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-[#e8e2d8] text-secondary font-bold text-xs uppercase hover:bg-[#f9f7f4]">
            Close
          </button>
          <button onClick={() => { alert('EOD Batch Close success! Shift reports generated.'); onClose(); }} className="px-4 py-2 bg-[#222222] text-white font-bold text-xs uppercase hover:opacity-90">
            Submit EOD Settlement
          </button>
        </div>
      </div>
    </div>
  );
};

// Modal 4: Soporte de Emergencia
export const EmergencySupportModal: React.FC<ModalProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<{ sender: 'user' | 'support'; text: string }[]>([
    { sender: 'support', text: 'Soporte prioritario X7 POS activo. ¿Cuál es su emergencia operacional?' }
  ]);
  const [input, setInput] = useState('');

  if (!isOpen) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { sender: 'user', text: input }]);
    const currentInput = input;
    setInput('');

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'support',
          text: `Recibido: "${currentInput}". Un agente técnico de nivel 2 se está conectando a su terminal.`
        }
      ]);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#222222] border border-red-500 max-w-md w-full rounded flex flex-col h-[450px]">
        {/* Header */}
        <div className="p-4 bg-red-600 text-white font-bold text-sm uppercase flex justify-between items-center rounded-t">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></span>
            Escalation Support (Level 2)
          </span>
          <button onClick={onClose} className="text-white hover:opacity-80">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-900 custom-scrollbar text-left text-xs">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-2.5 rounded ${msg.sender === 'user' ? 'bg-[#d51f2c] text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Input area */}
        <form onSubmit={handleSend} className="p-3 border-t border-white/10 bg-[#222222] flex gap-2 rounded-b">
          <input
            required
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded p-2 text-white text-xs focus:ring-0 focus:border-red-500"
            placeholder="Escriba su mensaje..."
          />
          <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase">
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

// Modal 5: New Quick Order (FAB)
export const NewQuickOrderModal: React.FC<ModalProps> = ({ isOpen, onClose }) => {
  const [selectedItems, setSelectedItems] = useState<{ id: string; name: string; price: number; qty: number }[]>([]);

  if (!isOpen) return null;

  const menuItems = [
    { id: '1', name: 'Classic Wagyu Burger', price: 18.50 },
    { id: '2', name: 'Truffle Mushroom Pizza', price: 22.00 },
    { id: '3', name: 'Napa Cabernet Glass', price: 14.00 },
    { id: '4', name: 'Warm Lava Cake', price: 8.50 },
  ];

  const handleAddItem = (item: typeof menuItems[0]) => {
    setSelectedItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const handleRemoveItem = (id: string) => {
    setSelectedItems((prev) => prev.filter((i) => i.id !== id));
  };

  const total = selectedItems.reduce((acc, curr) => acc + curr.price * curr.qty, 0);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-[#e8e2d8] p-6 max-w-2xl w-full rounded flex flex-col md:flex-row gap-6">
        {/* Izquierda: Menú */}
        <div className="flex-1 text-left">
          <h3 className="font-bold text-base text-[#222222] uppercase border-b border-[#e8e2d8] pb-3 mb-4">
            Menu Items
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleAddItem(item)}
                className="p-3 border border-[#e8e2d8] hover:border-[#d51f2c] text-left hover:bg-[#f9f7f4] transition-all flex flex-col justify-between h-20"
              >
                <span className="text-body-sm font-semibold text-[#222222]">{item.name}</span>
                <span className="text-xs font-bold text-[#d51f2c]">${item.price.toFixed(2)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Derecha: Ticket / Pedido */}
        <div className="w-full md:w-72 border-t md:border-t-0 md:border-l border-[#e8e2d8] pt-4 md:pt-0 md:pl-6 flex flex-col justify-between text-left min-h-[300px]">
          <div>
            <h3 className="font-bold text-base text-[#222222] uppercase border-b border-[#e8e2d8] pb-3 mb-4">
              Quick Ticket
            </h3>
            <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar pr-1">
              {selectedItems.length === 0 ? (
                <p className="text-xs text-secondary italic">No items selected.</p>
              ) : (
                selectedItems.map((item) => (
                  <div key={item.id} className="flex justify-between items-center text-xs">
                    <div className="flex-1">
                      <span className="font-bold text-[#d51f2c] mr-2">{item.qty}x</span>
                      <span className="text-[#222222]">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">${(item.price * item.qty).toFixed(2)}</span>
                      <button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-[#e8e2d8] pt-4 mt-4">
            <div className="flex justify-between font-bold text-sm mb-4">
              <span>Total:</span>
              <span className="text-[#d51f2c]">${total.toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 border border-[#e8e2d8] text-secondary font-bold text-xs uppercase hover:bg-[#f9f7f4] text-center">
                Close
              </button>
              <button
                disabled={selectedItems.length === 0}
                onClick={() => { alert(`Quick Order created! Total: $${total.toFixed(2)}`); onClose(); }}
                className="flex-1 py-2 bg-[#d51f2c] disabled:bg-zinc-200 text-white font-bold text-xs uppercase hover:opacity-90 text-center"
              >
                Send Order
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Modal 6: LoginGatewayModal (Para el bloqueo ante 401 Unauthorized)
interface LoginGatewayProps {
  isOpen: boolean;
  onLoginSuccess: () => void;
}

export const LoginGatewayModal: React.FC<LoginGatewayProps> = ({ isOpen, onLoginSuccess }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-[#16171d]/95 z-[999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-[#222222] border border-white/10 p-8 max-w-md w-full rounded text-center shadow-2xl space-y-6">
        <div>
          <div className="w-16 h-16 bg-[#d51f2c]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#d51f2c]/20">
            <span className="material-symbols-outlined text-[#d51f2c] text-3xl">lock</span>
          </div>
          <h2 className="text-white text-lg font-black uppercase tracking-wider">Session Invalidation Gateway</h2>
          <p className="text-white/50 text-xs mt-2">
            La sesión activa ha expirado o requiere re-autenticación (Código de respuesta: <strong className="text-red-500">401 Unauthorized</strong>).
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Re-establecer el estado de autenticación
            setAuthenticatedState(true);
            setSimulate401(false);
            onLoginSuccess();
          }}
          className="space-y-4 text-left"
        >
          <div>
            <label className="block text-[10px] font-bold text-white/60 uppercase mb-1">Email / Operator ID</label>
            <input
              required
              type="text"
              defaultValue="m.rossi@x7pos.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded p-2.5 text-white text-body-sm focus:ring-0 focus:border-[#d51f2c]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-white/60 uppercase mb-1">Password</label>
            <input
              required
              type="password"
              defaultValue="••••••••"
              className="w-full bg-zinc-800 border border-zinc-700 rounded p-2.5 text-white text-body-sm focus:ring-0 focus:border-[#d51f2c]"
            />
          </div>
          <button type="submit" className="w-full py-3 bg-[#d51f2c] hover:bg-[#b01a24] text-white font-bold text-xs uppercase tracking-widest transition-colors rounded-sm shadow-md">
            Unlock Session
          </button>
        </form>
      </div>
    </div>
  );
};
