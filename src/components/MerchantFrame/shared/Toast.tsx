import { createPortal } from 'react-dom';

export interface ToastState {
  message: string;
  type: 'success' | 'error';
}

interface ToastProps {
  toast: ToastState | null;
  onClose: () => void;
}

/**
 * Success/error toast for the Accounts Payable workspaces.
 *
 * Rendered via a portal into `document.body` so it escapes the MerchantFrame `<main>`
 * stacking context (main is `position: fixed`, so it forms its own stacking context with
 * z-index auto, which sits BELOW the fixed top header at z-50 — an in-tree toast, no matter
 * how high its z-index, would be painted behind the header). Portaled to body it becomes a
 * top-level stacking context, and `z-[9999]` + `top-20` (below the 4rem header) keep it fully
 * visible in the top-right corner.
 */
export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  if (!toast) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-20 right-6 z-[9999] flex items-center gap-3 px-5 py-3.5 shadow-lg text-white text-sm font-medium ${
        toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
    >
      <span className="material-symbols-outlined text-lg">
        {toast.type === 'success' ? 'check_circle' : 'error'}
      </span>
      {toast.message}
      <button
        type="button"
        onClick={onClose}
        className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>,
    document.body,
  );
};

export default Toast;
