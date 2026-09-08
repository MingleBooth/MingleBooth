import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Calendar,
  Plus,
  Edit3,
  Trash2,
  Check,
  Search,
  Sparkles,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { API_BASE_URL } from '../config';

export interface EventItem {
  id: string;
  name: string;
  hostNames?: string;
  date?: string;
  outputType?: string;
}

interface EventManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: EventItem[];
  selectedEventId: string;
  onSelectEvent: (id: string) => void;
  onEventsUpdated: (updatedEvents: EventItem[], newSelectedId?: string) => void;
  initialTab?: 'list' | 'create';
}

export const EventManagerModal: React.FC<EventManagerModalProps> = ({
  isOpen,
  onClose,
  events,
  selectedEventId,
  onSelectEvent,
  onEventsUpdated,
  initialTab = 'list',
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State for Create
  const todayStr = new Date().toISOString().split('T')[0];
  const [createName, setCreateName] = useState('');
  const [createDate, setCreateDate] = useState(todayStr);
  const [createHost, setCreateHost] = useState('');
  const [createOutputType, setCreateOutputType] = useState<'photo' | 'gif'>('photo');

  // State for Edit Mode
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editHost, setEditHost] = useState('');

  // State for Delete Confirm
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  // Reset tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setErrorMessage(null);
      setSuccessMessage(null);
      setEditingEventId(null);
      setDeletingEventId(null);
    }
  }, [isOpen, initialTab]);

  // Helper to get auth headers
  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('mb_license_token') || '';
    let orgId = '';
    let vendorEmail = '';
    try {
      const orgData = JSON.parse(localStorage.getItem('mb_vendor_org') || '{}');
      orgId = orgData.id || '';
    } catch {}
    try {
      const devData = JSON.parse(localStorage.getItem('mb_device_info') || '{}');
      vendorEmail = devData.vendorEmail || '';
    } catch {}

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (orgId) headers['x-org-id'] = orgId;
    if (vendorEmail) headers['x-vendor-email'] = vendorEmail;
    return headers;
  };

  // Filtered events
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(
      (ev) =>
        ev.name.toLowerCase().includes(q) ||
        (ev.hostNames && ev.hostNames.toLowerCase().includes(q)) ||
        (ev.date && ev.date.toLowerCase().includes(q))
    );
  }, [events, searchQuery]);

  if (!isOpen) return null;

  // ── 1. CREATE EVENT (C) ──
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) {
      setErrorMessage('Nama acara wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const tempId = `evt_${Date.now()}`;
    const newEvent: EventItem = {
      id: tempId,
      name: createName.trim(),
      date: createDate || todayStr,
      hostNames: createHost.trim() || undefined,
      outputType: createOutputType,
    };

    try {
      // 1. Send to Supabase API
      const res = await fetch(`${API_BASE_URL}/api/vendor/events`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: newEvent.name,
          date: newEvent.date,
          outputType: createOutputType,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.event?.id) {
          newEvent.id = data.event.id;
        }
      }
    } catch (err) {
      console.warn('Offline or failed to sync event to cloud, saving locally:', err);
    }

    // Update parent state & select the new event
    const updated = [newEvent, ...events.filter((e) => e.id !== newEvent.id)];
    onEventsUpdated(updated, newEvent.id);
    onSelectEvent(newEvent.id);

    setIsSubmitting(false);
    setSuccessMessage(`Acara "${newEvent.name}" berhasil dibuat & langsung aktif!`);
    setCreateName('');
    setCreateHost('');
    setCreateDate(todayStr);

    setTimeout(() => {
      onClose();
    }, 900);
  };

  // ── 2. START EDIT EVENT (U) ──
  const startEdit = (ev: EventItem) => {
    setEditingEventId(ev.id);
    setEditName(ev.name);
    setEditDate(ev.date || todayStr);
    setEditHost(ev.hostNames || '');
    setErrorMessage(null);
  };

  const cancelEdit = () => {
    setEditingEventId(null);
    setEditName('');
    setEditDate('');
    setEditHost('');
  };

  // ── 3. SAVE EDIT EVENT (U) ──
  const handleSaveEdit = async (eventId: string) => {
    if (!editName.trim()) {
      setErrorMessage('Nama acara tidak boleh kosong.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await fetch(`${API_BASE_URL}/api/vendor/events`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: eventId,
          name: editName.trim(),
          date: editDate,
          hostNames: editHost.trim() || undefined,
        }),
      });
    } catch (err) {
      console.warn('Failed to update event on cloud, updating locally:', err);
    }

    const updated = events.map((ev) => {
      if (ev.id === eventId) {
        return {
          ...ev,
          name: editName.trim(),
          date: editDate,
          hostNames: editHost.trim() || undefined,
        };
      }
      return ev;
    });

    onEventsUpdated(updated);
    setEditingEventId(null);
    setIsSubmitting(false);
    setSuccessMessage('Perubahan acara berhasil disimpan!');
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  // ── 4. DELETE EVENT (D) ──
  const handleDeleteEvent = async (eventId: string) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await fetch(`${API_BASE_URL}/api/vendor/events?id=${eventId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    } catch (err) {
      console.warn('Failed to delete on cloud, deleting locally:', err);
    }

    const updated = events.filter((ev) => ev.id !== eventId);
    let newSelectedId = selectedEventId;

    if (selectedEventId === eventId) {
      newSelectedId = updated[0]?.id || '';
      onSelectEvent(newSelectedId);
    }

    onEventsUpdated(updated, newSelectedId);
    setDeletingEventId(null);
    setIsSubmitting(false);
    setSuccessMessage('Acara berhasil dihapus.');
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 select-none animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-2xl w-full bg-[#111216] border border-white/[0.12] rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.08] border border-white/15 flex items-center justify-center text-white">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                Manajemen Acara Photobooth
              </h3>
              <p className="text-xs text-neutral-400">
                Buat acara baru atau kelola daftar acara untuk sesi foto di studio
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.15] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 p-1 bg-[#171920] border border-white/[0.06] rounded-2xl flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('list');
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'list'
                ? 'bg-white text-black shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Daftar Acara</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                activeTab === 'list' ? 'bg-black/15 text-black' : 'bg-white/10 text-neutral-300'
              }`}
            >
              {events.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'create'
                ? 'bg-white text-black shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Buat Acara Baru</span>
          </button>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2 flex-shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* TAB CONTENT: 1. LIST & MANAGE (READ, UPDATE, DELETE) */}
        {activeTab === 'list' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3.5">
            {/* Search Box */}
            <div className="relative flex-shrink-0">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari acara berdasarkan nama atau tanggal..."
                className="w-full h-10 pl-9.5 pr-3.5 rounded-xl bg-[#171920] border border-white/[0.08] text-xs text-white placeholder:text-neutral-500 outline-none focus:border-white/30 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Events List Scrollable Container */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 min-h-[220px] max-h-[380px]">
              {events.length === 0 ? (
                <div className="py-14 text-center text-neutral-400 text-xs space-y-3 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-neutral-400">
                    <Calendar className="w-6 h-6 opacity-40" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Belum Ada Acara di Database</h4>
                    <p className="text-neutral-400 text-xs max-w-xs mx-auto mt-1 leading-relaxed">
                      Database akun ini belum memiliki acara aktif. Klik tombol di bawah untuk membuat acara pertamamu.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('create');
                      setErrorMessage(null);
                    }}
                    className="mt-2 px-4 py-2.5 rounded-xl bg-white text-black font-semibold text-xs transition-all hover:bg-neutral-200 cursor-pointer shadow-md inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Buat Acara Baru</span>
                  </button>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="py-12 text-center text-neutral-500 text-xs space-y-2">
                  <Calendar className="w-8 h-8 mx-auto opacity-30" />
                  <p>Tidak ada acara yang cocok dengan pencarian &quot;{searchQuery}&quot;.</p>
                </div>
              ) : (
                filteredEvents.map((ev) => {
                  const isSelected = ev.id === selectedEventId;
                  const isEditing = ev.id === editingEventId;

                  if (isEditing) {
                    return (
                      <div
                        key={ev.id}
                        className="p-4 rounded-2xl bg-[#181A22] border border-white/20 space-y-3 animate-fadeIn"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">Edit Acara</span>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="text-[11px] text-neutral-400 hover:text-white cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <label className="text-[10px] text-neutral-400 font-medium">
                              Nama Acara
                            </label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full h-9 px-3 rounded-lg bg-[#111216] border border-white/15 text-xs text-white outline-none focus:border-white/40"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-neutral-400 font-medium">
                              Tanggal
                            </label>
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="w-full h-9 px-3 rounded-lg bg-[#111216] border border-white/15 text-xs text-white outline-none focus:border-white/40"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-3 py-1.5 rounded-lg text-xs text-neutral-300 hover:text-white bg-white/[0.05] cursor-pointer"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleSaveEdit(ev.id)}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-black bg-white hover:bg-neutral-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            {isSubmitting ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            <span>Simpan Perubahan</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={ev.id}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-[#181C26] border-white/25 shadow-sm'
                          : 'bg-[#14161C] border-white/[0.06] hover:border-white/15'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-semibold text-white truncate">
                            {ev.name}
                          </h4>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-black flex items-center gap-1 flex-shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Sedang Aktif
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                          {ev.date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-neutral-500" />
                              {ev.date}
                            </span>
                          )}
                          {ev.hostNames && ev.hostNames !== ev.name && (
                            <span className="flex items-center gap-1 truncate">
                              <Users className="w-3 h-3 text-neutral-500" />
                              {ev.hostNames}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {!isSelected ? (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectEvent(ev.id);
                              setSuccessMessage(`Acara dialihkan ke "${ev.name}"`);
                              setTimeout(() => setSuccessMessage(null), 2000);
                            }}
                            className="h-8 px-3 rounded-xl bg-white/[0.08] hover:bg-white text-neutral-200 hover:text-black text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                            title="Gunakan acara ini di studio"
                          >
                            <Check className="w-3 h-3" />
                            <span className="hidden sm:inline">Pilih</span>
                          </button>
                        ) : (
                          <div className="h-8 px-2.5 rounded-xl bg-white/10 text-neutral-300 text-[11px] font-medium flex items-center gap-1 select-none">
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="hidden sm:inline">Aktif</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => startEdit(ev)}
                          className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.12] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                          title="Edit nama atau tanggal acara"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingEventId(ev.id)}
                          className="w-8 h-8 rounded-xl bg-red-500/[0.08] hover:bg-red-500/20 text-red-400 hover:text-red-300 flex items-center justify-center transition-colors cursor-pointer"
                          title="Hapus acara ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Delete Confirmation Dialog */}
            {deletingEventId && (
              <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 space-y-3 animate-fadeIn flex-shrink-0">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 flex-shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold text-white">Konfirmasi Hapus Acara</h5>
                    <p className="text-[11px] text-neutral-300">
                      Yakin ingin menghapus acara{' '}
                      <span className="font-semibold text-white">
                        &quot;{events.find((e) => e.id === deletingEventId)?.name}&quot;
                      </span>
                      ? Foto yang terkait di galeri cloud juga akan terhapus.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setDeletingEventId(null)}
                    className="px-3.5 py-1.5 rounded-xl text-xs text-neutral-300 hover:text-white bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleDeleteEvent(deletingEventId)}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    <span>Ya, Hapus Acara</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: 2. CREATE NEW EVENT (CREATE) */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateEvent} className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 block">
                  Nama Acara <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Contoh: Wedding Bayu & Irma / Sweet 17th Jessica"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#171920] border border-white/[0.1] text-xs font-medium text-white placeholder:text-neutral-500 outline-none focus:border-white/40 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 block">
                    Tanggal Acara <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={createDate}
                    onChange={(e) => setCreateDate(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#171920] border border-white/[0.1] text-xs font-medium text-white outline-none focus:border-white/40 transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 block">
                    Tuan Rumah / Pasangan <span className="text-[10px] text-neutral-500">(Opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={createHost}
                    onChange={(e) => setCreateHost(e.target.value)}
                    placeholder="Contoh: Bayu & Irma"
                    className="w-full h-11 px-3.5 rounded-xl bg-[#171920] border border-white/[0.1] text-xs font-medium text-white placeholder:text-neutral-500 outline-none focus:border-white/40 transition-colors"
                  />
                </div>
              </div>

              {/* Output Type Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 block">
                  Mode Photobooth Utama
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateOutputType('photo')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      createOutputType === 'photo'
                        ? 'bg-white/[0.08] border-white/30 text-white'
                        : 'bg-[#171920] border-white/[0.06] text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center justify-between">
                      <span>Foto Strip & Frame</span>
                      {createOutputType === 'photo' && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      Standar photobooth dengan cetak & barcode galeri
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateOutputType('gif')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      createOutputType === 'gif'
                        ? 'bg-white/[0.08] border-white/30 text-white'
                        : 'bg-[#171920] border-white/[0.06] text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center justify-between">
                      <span>Foto + Boomerang GIF</span>
                      {createOutputType === 'gif' && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      Menghasilkan foto dan animasi loop GIF interaktif
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-4 border-t border-white/[0.08] flex items-center justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-300 hover:text-white bg-white/[0.06] transition-colors cursor-pointer"
              >
                Kembali ke Daftar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-black bg-white hover:bg-neutral-200 transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Simpan & Gunakan Acara</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
