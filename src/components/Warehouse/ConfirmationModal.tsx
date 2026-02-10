import React from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
  isLoading?: boolean; // Tambahan prop loading
  children?: React.ReactNode;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Ya, Hapus',
  cancelLabel = 'Batal',
  isDangerous = true,
  isLoading = false,
  children
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
        {/* Header */}
        <div className="p-6 flex items-start gap-4">
          <div className={`p-3 rounded-full shrink-0 ${isDangerous ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
            <AlertTriangle size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              {title}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-4">
              {message}
            </p>
            
            {/* Render Input Tambahan (Jika Ada) */}
            {children}
          </div>
          <button 
            onClick={!isLoading ? onClose : undefined}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 dark:bg-dark-700 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-600 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              if (!isLoading) onConfirm();
            }}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg text-white font-medium text-sm shadow-sm transition-colors flex items-center gap-2 ${
              isDangerous 
                ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400' 
                : 'bg-erp-blue-600 hover:bg-erp-blue-700 disabled:bg-erp-blue-400'
            } disabled:cursor-not-allowed`}
          >
            {isLoading && <Loader2 className="animate-spin" size={16} />}
            {isLoading ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
