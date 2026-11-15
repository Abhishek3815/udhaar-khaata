import React from 'react';
import { X, Download, ZoomIn } from 'lucide-react';

interface BillImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  title?: string;
}

export const BillImageModal: React.FC<BillImageModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title = 'बिल / पर्ची का फ़ोटो'
}) => {
  if (!isOpen || !imageUrl) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `bill-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 md:p-6 animate-in fade-in duration-150 overflow-y-auto">
      <div className="relative w-full max-w-lg md:max-w-2xl lg:max-w-4xl bg-slate-900 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92dvh] my-auto border border-slate-800">
        {/* Pinned Top Header */}
        <div className="shrink-0 px-4 sm:px-5 py-3.5 bg-slate-800 text-white flex items-center justify-between border-b border-slate-700/80">
          <div className="flex items-center space-x-2.5 min-w-0">
            <ZoomIn className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-bold text-sm text-slate-100 truncate">{title}</span>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-emerald-300 transition-colors"
              title="डाउनलोड करें"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-700 hover:bg-rose-600 text-white transition-colors"
              title="बंद करें"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable / Zoomable Image View */}
        <div className="flex-1 overflow-auto p-2 sm:p-4 flex items-center justify-center bg-black/60">
          <img
            src={imageUrl}
            alt="बिल / पर्ची"
            className="max-w-full max-h-[78dvh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      </div>
    </div>
  );
};
