import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex flex-col items-center text-center">
          <div className="p-3 bg-red-100 text-red-600 rounded-full mb-4">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-lg font-bold text-red-800 mb-2">
            Terjadi Kesalahan pada {this.props.title || 'Modul Ini'}
          </h2>
          <p className="text-red-600 text-sm mb-4 max-w-md">
            {this.state.error?.message || 'Terjadi kesalahan yang tidak terduga.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-50 font-medium flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={16} /> Muat Ulang Halaman
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
