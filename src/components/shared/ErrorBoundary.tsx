import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React render tree:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    try {
      // Clear storage keys that might hold corrupt state
      localStorage.removeItem('x7_journal_entries_v3');
      localStorage.removeItem('x7_merchant_tax_rules_v1');
      localStorage.removeItem('x7_ledger_accounts_v1');
    } catch (e) {
      // ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#fef9f1] flex flex-col justify-center items-center p-6 text-center text-[#1d1c17]">
          <div className="bg-white border border-[#e8e2d8] rounded-xl shadow-2xl p-8 max-w-lg w-full flex flex-col items-center gap-4 animate-fade-in">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-[#ae001a]">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <h2 className="text-xl font-bold text-[#1d1c17]">Se ha producido un error inesperado</h2>
            <p className="text-sm text-[#5f5e5e] max-w-md">
              La vista no pudo cargarse debido a un conflicto de datos en la sesión actual.
            </p>
            {this.state.error && (
              <div className="w-full bg-[#f8f3eb] p-3 rounded text-left font-mono text-xs text-red-700 overflow-x-auto border border-[#e8e2d8]">
                {this.state.error.toString()}
              </div>
            )}
            <div className="flex gap-3 mt-4 w-full">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 px-5 py-3 bg-[#ae001a] hover:bg-[#930015] text-white font-bold text-xs uppercase tracking-widest rounded transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">refresh</span>
                Limpiar Caché y Recargar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
