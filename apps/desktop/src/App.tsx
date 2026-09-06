import React, { useEffect } from 'react';

export const App: React.FC = () => {
  useEffect(() => {
    const hubUrl = 'http://localhost:4848';
    const target = typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? `http://localhost:3000/tablet?hub=${encodeURIComponent(hubUrl)}&platform=desktop`
      : `https://minglebooth.id/tablet?hub=${encodeURIComponent(hubUrl)}&platform=desktop`;

    window.location.replace(target);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#07090E] text-white select-none font-sans">
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
        <span className="text-sm font-medium tracking-wide text-neutral-300">
          Memuat MingleBooth Studio...
        </span>
      </div>
    </div>
  );
};
