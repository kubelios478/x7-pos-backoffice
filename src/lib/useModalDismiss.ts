import { useEffect, useRef } from 'react';

// Comportamiento estándar de accesibilidad para drawers/modales:
// - Cierra con la tecla Escape.
// - Bloquea el scroll del body mientras está abierto.
// El componente que use el hook debe montarse sólo cuando el modal está abierto
// (renderizado condicional), de modo que mount/unmount coincida con open/close.
export function useModalDismiss(onDismiss: () => void): void {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissRef.current();
    };
    document.addEventListener('keydown', handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);
}
