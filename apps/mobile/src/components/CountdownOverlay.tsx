import React from 'react';

interface Props {
  value: number;
  totalSlots: number;
  currentSlot: number;
}

export const CountdownOverlay: React.FC<Props> = ({ value, totalSlots, currentSlot }) => {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none bg-black/30 backdrop-blur-[2px] animate-fadeIn">
      {/* Current Pose / Shot Indicator */}
      <div className="absolute top-24 px-6 py-2 rounded-full bg-black/60 border border-white/20 text-white font-bold text-sm tracking-widest uppercase shadow-xl">
        Foto {currentSlot + 1} dari {totalSlots}
      </div>

      {/* Countdown Digits */}
      <div className="relative">
        <div className="text-[140px] md:text-[220px] font-black text-white tracking-tighter drop-shadow-[0_10px_30px_rgba(0,0,0,0.8)] animate-pulse-fast select-none">
          {value > 0 ? value : '📸'}
        </div>
        <div className="text-center text-sm md:text-lg font-bold tracking-widest text-brand-400 uppercase -mt-4 drop-shadow-md">
          {value > 0 ? 'Bersiaplah!' : 'Senyum!'}
        </div>
      </div>
    </div>
  );
};
