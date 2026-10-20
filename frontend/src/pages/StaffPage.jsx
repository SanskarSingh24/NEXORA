import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  HeartPulse,
  Crown,
  Wrench,
  Truck,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  Trash2,
  X,
  Copy,
  Check,
  ShieldAlert,
  ArrowLeft,
  ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://localhost:8000';
const API_FALLBACK = 'http://127.0.0.1:8000';

const ROLE_PRESETS = ['Security', 'Medical', 'Supervisor', 'Technical', 'Logistics'];
const ZONE_PRESETS = [
  'Zone A - Concourse',
  'Zone B - Medical Station',
  'Central Command',
  'Zone A - Camera Grid',
  'West Gate Entrance',
  'Zone C - Field Post',
  'North Perimeter',
  'VIP Lounge'
];

export default function StaffPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem('nexora_token');
  
  // Extract role from token or localStorage
  const userRole = useMemo(() => {
    let r = localStorage.getItem('nexora_role');
    if (!r && token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        r = payload.role;
      } catch (e) {
        // ignore decode errors
      }
    }
    return r || 'operator';
  }, [token]);

  const isAdmin = userRole.toUpperCase() === 'ADMIN';

  // Data states
  const [staffList, setStaffList] = useState([]);
  const [summary, setSummary] = useState({ total: 0, available: 0, busy: 0, off_duty: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedZone, setSelectedZone] = useState('ALL');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Form inputs
  const [formData, setFormData] = useState({
    name: '',
    role: 'Security',
    customRole: '',
    contact_number: '',
    assigned_zone: 'Zone A - Concourse',
    customZone: '',
    availability_status: 'Available'
  });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const apiFetch = async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    };

    let res;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    } catch {
      res = await fetch(`${API_FALLBACK}${endpoint}`, { ...options, headers });
    }
    return res;
  };

  // Fetch staff records & summary
  const fetchStaffData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, sumRes] = await Promise.all([
        apiFetch('/staff'),
        apiFetch('/staff/summary')
      ]);

      if (!listRes.ok) {
        throw new Error(`Failed to load staff records (HTTP ${listRes.status})`);
      }

      const listData = await listRes.json();
      setStaffList(Array.isArray(listData) ? listData : []);

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }
    } catch (err) {
      console.error('[StaffPage] Fetch error:', err);
      setError(err.message || 'Error connecting to NEXORA Staff Gateway');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchStaffData();
    }
  }, [isAdmin]);

  // Handle opening modal for Add vs Edit
  const openAddModal = () => {
    setEditingStaff(null);
    setFormData({
      name: '',
      role: 'Security',
      customRole: '',
      contact_number: '',
      assigned_zone: 'Zone A - Concourse',
      customZone: '',
      availability_status: 'Available'
    });
    setIsFormOpen(true);
  };

  const openEditModal = (staff) => {
    setEditingStaff(staff);
    const isPresetRole = ROLE_PRESETS.includes(staff.role);
    const isPresetZone = ZONE_PRESETS.includes(staff.assigned_zone);

    setFormData({
      name: staff.name,
      role: isPresetRole ? staff.role : 'Other',
      customRole: isPresetRole ? '' : staff.role,
      contact_number: staff.contact_number,
      assigned_zone: isPresetZone ? staff.assigned_zone : 'Other',
      customZone: isPresetZone ? '' : staff.assigned_zone,
      availability_status: staff.availability_status
    });
    setIsFormOpen(true);
  };

  // Submit Add / Edit Form
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);

    const finalRole = formData.role === 'Other' ? formData.customRole.trim() : formData.role;
    const finalZone = formData.assigned_zone === 'Other' ? formData.customZone.trim() : formData.assigned_zone;

    if (!formData.name.trim()) {
      showToast('Please specify the staff member name.', 'error');
      setFormSubmitting(false);
      return;
    }

    if (!finalRole) {
      showToast('Please specify a valid operational role.', 'error');
      setFormSubmitting(false);
      return;
    }

    if (!formData.contact_number.trim()) {
      showToast('Please provide a contact number or radio channel.', 'error');
      setFormSubmitting(false);
      return;
    }

    if (!finalZone) {
      showToast('Please assign an operational zone.', 'error');
      setFormSubmitting(false);
      return;
    }

    const payload = {
      name: formData.name.trim(),
      role: finalRole,
      contact_number: formData.contact_number.trim(),
      assigned_zone: finalZone,
      availability_status: formData.availability_status
    };

    try {
      let res;
      if (editingStaff) {
        res = await apiFetch(`/staff/${editingStaff.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiFetch('/staff', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save staff record');
      }

      const saved = await res.json();
      showToast(
        editingStaff ? `Updated "${saved.name}" successfully` : `Enrolled "${saved.name}" into roster`,
        'success'
      );
      setIsFormOpen(false);
      fetchStaffData();
    } catch (err) {
      console.error('[StaffPage] Save error:', err);
      showToast(err.message, 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Quick Inline Status Update
  const handleStatusChange = async (staffId, newStatus) => {
    try {
      const res = await apiFetch(`/staff/${staffId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ availability_status: newStatus })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Status update failed');
      }

      // Optimistic update
      setStaffList(prev =>
        prev.map(s => (s.id === staffId ? { ...s, availability_status: newStatus } : s))
      );

      // Refresh summary
      const sumRes = await apiFetch('/staff/summary');
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }

      showToast(`Status updated to ${newStatus}`, 'success');
    } catch (err) {
      console.error('[StaffPage] Quick status error:', err);
      showToast(err.message, 'error');
    }
  };

  // Delete Staff
  const confirmDelete = async () => {
    if (!staffToDelete) return;
    setFormSubmitting(true);
    try {
      const res = await apiFetch(`/staff/${staffToDelete.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Deletion failed');
      }

      showToast(`Removed "${staffToDelete.name}" from active roster`, 'success');
      setIsDeleteOpen(false);
      setStaffToDelete(null);
      fetchStaffData();
    } catch (err) {
      console.error('[StaffPage] Delete error:', err);
      showToast(err.message, 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Copy contact number helper
  const copyContact = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered List
  const filteredStaff = useMemo(() => {
    return staffList.filter(item => {
      const matchesSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.contact_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.assigned_zone.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.role.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole =
        selectedRole === 'ALL' || item.role.toLowerCase() === selectedRole.toLowerCase();

      const matchesStatus =
        selectedStatus === 'ALL' || item.availability_status === selectedStatus;

      const matchesZone =
        selectedZone === 'ALL' || item.assigned_zone === selectedZone;

      return matchesSearch && matchesRole && matchesStatus && matchesZone;
    });
  }, [staffList, searchQuery, selectedRole, selectedStatus, selectedZone]);

  // Distinct Zones in data for filter dropdown
  const uniqueZones = useMemo(() => {
    const set = new Set(staffList.map(s => s.assigned_zone));
    return Array.from(set);
  }, [staffList]);

  // Role Badge Styling
  const getRoleBadge = (role) => {
    const r = role.toLowerCase();
    if (r.includes('security')) {
      return {
        icon: Shield,
        color: 'bg-blue-500/15 border-blue-500/30 text-blue-400'
      };
    }
    if (r.includes('medical')) {
      return {
        icon: HeartPulse,
        color: 'bg-rose-500/15 border-rose-500/30 text-rose-400'
      };
    }
    if (r.includes('supervisor')) {
      return {
        icon: Crown,
        color: 'bg-purple-500/15 border-purple-500/30 text-purple-400'
      };
    }
    if (r.includes('technical')) {
      return {
        icon: Wrench,
        color: 'bg-amber-500/15 border-amber-500/30 text-amber-400'
      };
    }
    if (r.includes('logistics')) {
      return {
        icon: Truck,
        color: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
      };
    }
    return {
      icon: Users,
      color: 'bg-slate-500/15 border-slate-500/30 text-slate-300'
    };
  };

  // Availability Status Badge Styling
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Available':
        return {
          pill: 'bg-statusGreen/15 border-statusGreen/40 text-statusGreen shadow-[0_0_8px_rgba(16,185,129,0.2)]',
          dot: 'bg-statusGreen animate-pulse',
          label: 'Available'
        };
      case 'Busy':
        return {
          pill: 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)]',
          dot: 'bg-amber-400 animate-pulse',
          label: 'Busy'
        };
      case 'Off-duty':
      default:
        return {
          pill: 'bg-slate-700/30 border-slate-600/40 text-slate-400',
          dot: 'bg-slate-500',
          label: 'Off-duty'
        };
    }
  };

  // ACCESS RESTRICTED SCREEN (for non-admin users)
  if (!isAdmin) {
    return (
      <div className="h-full w-full p-8 flex flex-col items-center justify-center text-center">
        <div className="max-w-md bg-bgSecondary border border-panelBorder rounded-2xl p-8 shadow-[0_0_40px_rgba(30,41,75,0.4)] relative">
          <div className="w-14 h-14 rounded-2xl bg-statusRed/10 border border-statusRed/30 flex items-center justify-center text-statusRed mx-auto mb-5 shadow-[0_0_20px_rgba(239,68,68,0.25)]">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="font-outfit text-xl font-bold text-white mb-2">
            Administrator Clearance Required
          </h2>
          <p className="text-xs text-textMuted leading-relaxed mb-6">
            The NEXORA Personnel & Staff Management Console is restricted to administrative clearance.
            Your current operational role (<span className="text-accentCyan font-mono uppercase font-bold">{userRole}</span>)
            does not have permission to view or manage staff rosters.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-slate-900 hover:bg-slate-800 border border-panelBorder text-white font-bold py-3 rounded-lg text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-6 lg:p-8 flex flex-col gap-5 overflow-hidden font-inter text-slate-200">
      {/* Toast Banner */}
      {toast && (
        <div className="fixed top-6 right-8 z-50 transition-all transform animate-in fade-in slide-in-from-top-4">
          <div
            className={`px-4 py-3 rounded-xl border shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center gap-3 text-xs font-semibold backdrop-blur-md ${
              toast.type === 'error'
                ? 'bg-statusRed/20 border-statusRed text-white'
                : 'bg-statusGreen/20 border-statusGreen text-white'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-statusRed flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-statusGreen flex-shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* TOP HEADER & ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1e294b] pb-5 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="font-outfit font-extrabold text-2xl text-white tracking-wide">
              STAFF MANAGEMENT
            </h1>
            <span className="bg-accentCyan/15 border border-accentCyan/40 text-accentCyan text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              ADMIN CONSOLE
            </span>
          </div>
          <p className="text-xs text-textMuted">
            Manage venue personnel, assign deployment zones, and monitor real-time availability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStaffData}
            disabled={loading}
            className="bg-bgSecondary hover:bg-slate-900 border border-panelBorder text-textMuted hover:text-white px-3.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2"
            title="Refresh staff registry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accentCyan' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={openAddModal}
            className="bg-accentCyan hover:bg-cyan-400 text-bgPrimary font-extrabold px-4 py-2.5 rounded-lg text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(0,229,255,0.25)] active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>Enroll Staff</span>
          </button>
        </div>
      </div>

      {/* STATS / KPI OVERVIEW CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-shrink-0">
        {/* Total Staff */}
        <div className="bg-bgSecondary border border-panelBorder rounded-xl p-4 relative overflow-hidden shadow-[0_0_15px_rgba(30,41,75,0.2)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-textMuted uppercase tracking-widest">
              Total Roster
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-accentCyan">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-outfit text-2xl font-black text-white">{summary.total}</p>
          <p className="text-[10px] text-textMuted mt-1">Enrolled personnel</p>
        </div>

        {/* Available */}
        <div className="bg-bgSecondary border border-panelBorder rounded-xl p-4 relative overflow-hidden shadow-[0_0_15px_rgba(30,41,75,0.2)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-statusGreen uppercase tracking-widest">
              Available
            </span>
            <div className="w-7 h-7 rounded-lg bg-statusGreen/10 border border-statusGreen/30 flex items-center justify-center text-statusGreen">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-outfit text-2xl font-black text-statusGreen">{summary.available}</p>
          <p className="text-[10px] text-textMuted mt-1">Ready for dispatch</p>
        </div>

        {/* Busy */}
        <div className="bg-bgSecondary border border-panelBorder rounded-xl p-4 relative overflow-hidden shadow-[0_0_15px_rgba(30,41,75,0.2)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
              Busy
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-outfit text-2xl font-black text-amber-400">{summary.busy}</p>
          <p className="text-[10px] text-textMuted mt-1">Active on incident</p>
        </div>

        {/* Off-duty */}
        <div className="bg-bgSecondary border border-panelBorder rounded-xl p-4 relative overflow-hidden shadow-[0_0_15px_rgba(30,41,75,0.2)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Off-duty
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-700/20 border border-slate-600/30 flex items-center justify-center text-slate-400">
              <Shield className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-outfit text-2xl font-black text-slate-300">{summary.off_duty}</p>
          <p className="text-[10px] text-textMuted mt-1">Standby / inactive</p>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="bg-bgSecondary border border-panelBorder rounded-xl p-3.5 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between flex-shrink-0">
        {/* Search input */}
        <div className="relative flex-grow max-w-md">
          <Search className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, role, zone, or contact..."
            className="w-full bg-bgPrimary border border-panelBorder rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder:text-textMuted/60 outline-none focus:border-accentCyan transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Role Filter */}
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="bg-bgPrimary border border-panelBorder rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accentCyan transition-all"
          >
            <option value="ALL">All Roles</option>
            {ROLE_PRESETS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-bgPrimary border border-panelBorder rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accentCyan transition-all"
          >
            <option value="ALL">All Statuses</option>
            <option value="Available">Available</option>
            <option value="Busy">Busy</option>
            <option value="Off-duty">Off-duty</option>
          </select>

          {/* Zone Filter */}
          {uniqueZones.length > 0 && (
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="bg-bgPrimary border border-panelBorder rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accentCyan transition-all max-w-[160px] truncate"
            >
              <option value="ALL">All Zones</option>
              {uniqueZones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          )}

          {/* Reset Filters */}
          {(searchQuery || selectedRole !== 'ALL' || selectedStatus !== 'ALL' || selectedZone !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedRole('ALL');
                setSelectedStatus('ALL');
                setSelectedZone('ALL');
              }}
              className="text-[11px] text-accentCyan hover:underline font-semibold px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* STAFF TABLE / DIRECTORY */}
      <div className="flex-grow min-h-0 bg-bgSecondary border border-panelBorder rounded-xl flex flex-col overflow-hidden shadow-[0_0_20px_rgba(30,41,75,0.2)]">
        <div className="px-6 py-3.5 border-b border-[#1e294b] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white">Personnel Directory</span>
            <span className="bg-slate-800 text-textMuted text-[10px] font-mono px-2 py-0.5 rounded-full">
              {filteredStaff.length} of {staffList.length}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-accentCyan animate-spin" />
            <p className="text-xs text-textMuted font-semibold">Synchronizing personnel roster...</p>
          </div>
        ) : error ? (
          <div className="py-12 px-6 flex flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-statusRed" />
            <p className="text-xs text-statusRed font-semibold">{error}</p>
            <button
              onClick={fetchStaffData}
              className="bg-slate-900 border border-panelBorder text-white text-xs px-4 py-2 rounded-lg mt-2 hover:bg-slate-800 transition-all"
            >
              Try Again
            </button>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="py-16 px-6 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-800 border border-panelBorder flex items-center justify-center text-textMuted">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-white">No staff records found</p>
            <p className="text-xs text-textMuted max-w-sm">
              {searchQuery || selectedRole !== 'ALL' || selectedStatus !== 'ALL' || selectedZone !== 'ALL'
                ? 'No personnel matched your active filter criteria. Try clearing search terms.'
                : 'Your roster is currently empty. Click "Enroll Staff" to add operational team members.'}
            </p>
            {(searchQuery || selectedRole !== 'ALL' || selectedStatus !== 'ALL' || selectedZone !== 'ALL') ? (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedRole('ALL');
                  setSelectedStatus('ALL');
                  setSelectedZone('ALL');
                }}
                className="text-xs text-accentCyan font-bold uppercase tracking-wider hover:underline mt-1"
              >
                Clear all filters
              </button>
            ) : (
              <button
                onClick={openAddModal}
                className="bg-accentCyan text-bgPrimary font-bold text-xs uppercase px-4 py-2 rounded-lg mt-2 hover:bg-cyan-400 transition-all"
              >
                Enroll First Staff Member
              </button>
            )}
          </div>
        ) : (
          <div className="flex-grow min-h-0 overflow-y-auto overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-bgSecondary/95 backdrop-blur-sm border-b border-[#1e294b] shadow-sm">
                <tr className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                  <th className="py-3 px-6">Personnel</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Contact / Comms</th>
                  <th className="py-3 px-4">Deployment Zone</th>
                  <th className="py-3 px-4">Status & Dispatch</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e294b]">
                {filteredStaff.map((staff) => {
                  const roleStyle = getRoleBadge(staff.role);
                  const statusStyle = getStatusBadge(staff.availability_status);
                  const RoleIcon = roleStyle.icon;

                  return (
                    <tr
                      key={staff.id}
                      className="hover:bg-slate-900/40 transition-colors group"
                    >
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-panelBorder flex items-center justify-center font-outfit font-extrabold text-xs text-accentCyan flex-shrink-0 shadow-inner">
                            {staff.name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white text-xs tracking-wide">
                              {staff.name}
                            </p>
                            <p className="text-[10px] font-mono text-textMuted tracking-wider">
                              ID: {staff.id.substring(0, 8)}...
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${roleStyle.color}`}
                        >
                          <RoleIcon className="w-3 h-3" />
                          <span>{staff.role}</span>
                        </span>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300 text-xs">{staff.contact_number}</span>
                          <button
                            onClick={() => copyContact(staff.id, staff.contact_number)}
                            className="text-textMuted hover:text-white transition-colors p-1 rounded hover:bg-slate-800"
                            title="Copy contact number"
                          >
                            {copiedId === staff.id ? (
                              <Check className="w-3.5 h-3.5 text-statusGreen" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Assigned Zone */}
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-bgPrimary border border-panelBorder text-slate-300 text-[11px]">
                          <MapPin className="w-3 h-3 text-accentCyan flex-shrink-0" />
                          <span className="font-medium">{staff.assigned_zone}</span>
                        </div>
                      </td>

                      {/* Availability Status & Quick Switcher */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${statusStyle.pill}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`}></span>
                            <span>{statusStyle.label}</span>
                          </span>

                          {/* Quick inline status dropdown */}
                          <select
                            value={staff.availability_status}
                            onChange={(e) => handleStatusChange(staff.id, e.target.value)}
                            className="bg-bgPrimary border border-panelBorder text-[10px] text-textMuted hover:text-white rounded px-1.5 py-1 outline-none cursor-pointer focus:border-accentCyan transition-all"
                            title="Quickly change operational status"
                          >
                            <option value="Available">Set: Available</option>
                            <option value="Busy">Set: Busy</option>
                            <option value="Off-duty">Set: Off-duty</option>
                          </select>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(staff)}
                            className="p-1.5 rounded-lg text-textMuted hover:text-accentCyan hover:bg-slate-800 transition-colors"
                            title="Edit staff details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setStaffToDelete(staff);
                              setIsDeleteOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-textMuted hover:text-statusRed hover:bg-statusRed/10 transition-colors"
                            title="Remove staff member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =====================================================================
          ADD / EDIT MODAL
      ===================================================================== */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full bg-bgSecondary border border-panelBorder rounded-2xl p-6 relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] z-10">
            <div className="flex items-center justify-between pb-4 border-b border-[#1e294b] mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-accentCyan/15 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  {editingStaff ? <Edit2 className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                </div>
                <h3 className="font-outfit text-base font-bold text-white tracking-wide">
                  {editingStaff ? 'Edit Personnel Record' : 'Enroll New Personnel'}
                </h3>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-textMuted hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="flex flex-col gap-4 text-xs">
              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Officer Marcus Vance"
                  className="bg-bgPrimary border border-panelBorder rounded-lg px-3.5 py-2.5 text-white outline-none focus:border-accentCyan transition-all"
                  required
                />
              </div>

              {/* Role */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                  Operational Role *
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ROLE_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      onClick={() => setFormData({ ...formData, role: preset, customRole: '' })}
                      className={`py-2 px-2 rounded-lg border text-center font-medium transition-all ${
                        formData.role === preset
                          ? 'bg-accentCyan/15 border-accentCyan text-accentCyan shadow-[0_0_10px_rgba(0,229,255,0.15)] font-bold'
                          : 'bg-bgPrimary border-panelBorder text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'Other' })}
                    className={`py-2 px-2 rounded-lg border text-center font-medium transition-all ${
                      formData.role === 'Other'
                        ? 'bg-accentCyan/15 border-accentCyan text-accentCyan shadow-[0_0_10px_rgba(0,229,255,0.15)] font-bold'
                        : 'bg-bgPrimary border-panelBorder text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    Custom...
                  </button>
                </div>

                {formData.role === 'Other' && (
                  <input
                    type="text"
                    value={formData.customRole}
                    onChange={(e) => setFormData({ ...formData, customRole: e.target.value })}
                    placeholder="Enter custom role title (e.g. Crowd Controller)"
                    className="bg-bgPrimary border border-panelBorder rounded-lg px-3.5 py-2 text-white outline-none focus:border-accentCyan transition-all mt-1"
                    required
                  />
                )}
              </div>

              {/* Contact Number */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                  Contact Number / Radio Channel *
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    placeholder="+1 (555) 123-4567 or TAC-1"
                    className="w-full bg-bgPrimary border border-panelBorder rounded-lg pl-9 pr-3.5 py-2.5 text-white font-mono outline-none focus:border-accentCyan transition-all"
                    required
                  />
                </div>
              </div>

              {/* Assigned Zone */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                  Assigned Venue Zone *
                </label>
                <select
                  value={formData.assigned_zone}
                  onChange={(e) => setFormData({ ...formData, assigned_zone: e.target.value })}
                  className="bg-bgPrimary border border-panelBorder rounded-lg px-3.5 py-2.5 text-white outline-none focus:border-accentCyan transition-all"
                >
                  {ZONE_PRESETS.map((zone) => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                  <option value="Other">Custom Zone...</option>
                </select>

                {formData.assigned_zone === 'Other' && (
                  <input
                    type="text"
                    value={formData.customZone}
                    onChange={(e) => setFormData({ ...formData, customZone: e.target.value })}
                    placeholder="Enter custom zone name (e.g. Gate 4 South)"
                    className="bg-bgPrimary border border-panelBorder rounded-lg px-3.5 py-2 text-white outline-none focus:border-accentCyan transition-all mt-1"
                    required
                  />
                )}
              </div>

              {/* Availability Status */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                  Initial Availability Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['Available', 'Busy', 'Off-duty'].map((st) => (
                    <button
                      type="button"
                      key={st}
                      onClick={() => setFormData({ ...formData, availability_status: st })}
                      className={`py-2 px-2 rounded-lg border text-center font-bold text-[11px] transition-all ${
                        formData.availability_status === st
                          ? st === 'Available'
                            ? 'bg-statusGreen/20 border-statusGreen text-statusGreen shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                            : st === 'Busy'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                            : 'bg-slate-700/40 border-slate-500 text-slate-300'
                          : 'bg-bgPrimary border-panelBorder text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1e294b] mt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="bg-bgPrimary hover:bg-slate-800 border border-panelBorder text-textMuted hover:text-white px-4 py-2.5 rounded-lg font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="bg-accentCyan hover:bg-cyan-400 text-bgPrimary font-extrabold px-5 py-2.5 rounded-lg uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,229,255,0.25)] disabled:opacity-50 flex items-center gap-2"
                >
                  {formSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingStaff ? 'Update Staff Record' : 'Enroll Personnel'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          DELETE CONFIRMATION MODAL
      ===================================================================== */}
      {isDeleteOpen && staffToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-sm w-full bg-bgSecondary border border-panelBorder rounded-2xl p-6 relative shadow-[0_0_50px_rgba(0,0,0,0.8)] z-10 text-center">
            <div className="w-12 h-12 rounded-full bg-statusRed/15 border border-statusRed/40 flex items-center justify-center text-statusRed mx-auto mb-4 shadow-[0_0_20px_rgba(239,68,68,0.25)]">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="font-outfit text-lg font-bold text-white mb-2">
              Remove Personnel Record?
            </h3>

            <p className="text-xs text-textMuted leading-relaxed mb-4">
              Are you sure you want to remove <span className="text-white font-bold">{staffToDelete.name}</span> ({staffToDelete.role}) from the active roster? This action cannot be undone.
            </p>

            <div className="bg-bgPrimary border border-panelBorder rounded-lg p-2.5 mb-5 text-left font-mono text-[11px]">
              <p className="text-textMuted">Zone: <span className="text-slate-300">{staffToDelete.assigned_zone}</span></p>
              <p className="text-textMuted">Comms: <span className="text-slate-300">{staffToDelete.contact_number}</span></p>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setStaffToDelete(null);
                }}
                className="w-1/2 bg-bgPrimary hover:bg-slate-800 border border-panelBorder text-textMuted hover:text-white py-2.5 rounded-lg text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={formSubmitting}
                className="w-1/2 bg-statusRed hover:bg-red-600 text-white font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {formSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Confirm Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
