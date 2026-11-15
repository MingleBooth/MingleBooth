import React, { useState, useEffect } from 'react';
import { useMobileBoothStore, MobileEvent } from '../store/mobile-booth-store';
import { safeApiFetch } from '../lib/networkGuard';
import { Calendar, Plus, Check, X, Sparkles, FolderKanban } from 'lucide-react';

export const EventSelectorModal: React.FC = () => {
  const {
    isEventSelectOpen,
    setIsEventSelectOpen,
    currentEvent,
    setCurrentEvent,
    eventsList,
    setEventsList,
    user,
    backendUrl,
    isDemoMode,
  } = useMobileBoothStore();

  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventHashtag, setNewEventHashtag] = useState('');

  // Fetch events from backend if user is authenticated
  useEffect(() => {
    if (!isEventSelectOpen || !user?.token || isDemoMode) return;

    const fetchEvents = async () => {
      try {
        setIsLoading(true);
        const baseUrl = backendUrl.replace(/\/$/, '');
        const res = await safeApiFetch(`${baseUrl}/api/vendor/events`, {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.events)) {
            const mapped: MobileEvent[] = data.events.map((e: any) => ({
              id: e.id,
              name: e.name || 'Event Tanpa Judul',
              code: e.code || 'EVT',
              date: e.event_date || new Date().toISOString().split('T')[0],
              hashtag: e.hashtag || '#MingleBooth',
              templateId: e.template_id,
            }));
            setEventsList(mapped);
          }
        }
      } catch (err) {
        console.warn('[EventSelector] Fetch events offline fallback:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, [isEventSelectOpen, user, backendUrl, isDemoMode, setEventsList]);

  if (!isEventSelectOpen) return null;

  const handleSelect = (event: MobileEvent) => {
    setCurrentEvent(event);
    setIsEventSelectOpen(false);
  };

  const handleCreateQuickEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim()) return;

    const newEvt: MobileEvent = {
      id: `evt_local_${Date.now()}`,
      name: newEventName.trim(),
      code: `EVT${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      hashtag: newEventHashtag.trim() || `#${newEventName.replace(/\s+/g, '')}`,
    };

    const updated = [newEvt, ...eventsList];
    setEventsList(updated);
    setCurrentEvent(newEvt);
    setNewEventName('');
    setNewEventHashtag('');
    setShowCreateForm(false);
    setIsEventSelectOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="w-full max-w-lg bg-dark-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Pilih Event Photobooth</h2>
              <p className="text-xs text-slate-400">Pilih event aktif untuk mengelompokkan foto tamu</p>
            </div>
          </div>
          <button
            onClick={() => setIsEventSelectOpen(false)}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto py-4 space-y-2.5">
          {eventsList.map((evt) => {
            const isSelected = evt.id === currentEvent.id;
            return (
              <div
                key={evt.id}
                onClick={() => handleSelect(evt)}
                className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                  isSelected
                    ? 'bg-brand-500/10 border-brand-500 text-white'
                    : 'bg-dark-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">{evt.name}</h3>
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded-full bg-brand-500 text-[10px] font-bold text-white">
                        Aktif
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {evt.date}
                    </span>
                    {evt.hashtag && <span className="text-brand-400 font-mono text-[11px]">{evt.hashtag}</span>}
                  </div>
                </div>
                {isSelected && <Check className="w-5 h-5 text-brand-400" />}
              </div>
            );
          })}
        </div>

        {/* Quick Add Form or Trigger */}
        {showCreateForm ? (
          <form onSubmit={handleCreateQuickEvent} className="pt-3 border-t border-slate-800 space-y-3">
            <input
              type="text"
              placeholder="Nama Event Baru (cth: Wedding Sarah & Kevin)"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl bg-dark-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
            <input
              type="text"
              placeholder="Hashtag (cth: #SarahKevin2026)"
              value={newEventHashtag}
              onChange={(e) => setNewEventHashtag(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-dark-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-semibold text-xs transition"
              >
                Simpan & Gunakan Event
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:text-white"
              >
                Batal
              </button>
            </div>
          </form>
        ) : (
          <div className="pt-3 border-t border-slate-800">
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full py-3 rounded-2xl bg-dark-950 hover:bg-slate-800 border border-dashed border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4 text-brand-400" />
              <span>Tambah Event Baru (Offline / Instan)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
