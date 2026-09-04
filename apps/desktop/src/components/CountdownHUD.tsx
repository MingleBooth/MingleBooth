import React from 'react';

interface CountdownHUDProps {
  remaining: number;
  shotIndex?: number;
  totalShots?: number;
}

export const CountdownHUD: React.FC<CountdownHUDProps> = ({
  remaining,
  shotIndex = 0,
  totalShots = 2,
}) => {
  const isSecondOrLater = shotIndex > 0;

  return (
    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-20 pointer-events-none select-none animate-fadeIn">
      {/* Top Pose Guidance Banner */}
      <div className="mb-6 px-6 py-2 rounded-full bg-black/70 border border-white/20 text-white font-bold text-base sm:text-lg tracking-wider uppercase shadow-2xl flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>
          {isSecondOrLater
            ? `✌️ GANTI POSE ${shotIndex + 1} DARI ${totalShots}!`
            : `📸 SIAP POSE ${shotIndex + 1} DARI ${totalShots}`}
        </span>
      </div>

      {/* Huge Countdown Number */}
      <div className="flex items-center justify-center">
        <span
          key={remaining}
          className="text-[120px] sm:text-[150px] font-black text-white font-sans tracking-tight drop-shadow-2xl animate-scaleIn leading-none"
        >
          {remaining}
        </span>
      </div>

      <span className="text-xs text-neutral-300 font-medium tracking-wide mt-4 uppercase font-mono">
        Tersenyumlah ke kamera!
      </span>
    </div>
  );
};
