"use client";

import { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse'; 
import { searchClient } from '@/lib/meilisearch';
import { 
  Database, UploadCloud, Trash2, Search, 
  FileText, AlertTriangle, Building2, MapPin, Loader2, Download,
  CheckCircle2, XCircle, RefreshCw, Plus, Copy, Check, Filter,
  Layers, ArrowRight, Sparkles, HelpCircle
} from 'lucide-react';

interface MasterStats {
  totalDocuments: number;
  totalCompanies: number;
  totalPincodes: number;
  isIndexing: boolean;
  files: Array<{ fileName: string; count: number; type?: string }>;
  fetchedAt?: string;
}

export default function MasterDataPage() {
  // Tabs: 'explorer' | 'upload' | 'datasets' | 'quick-add'
  const [activeTab, setActiveTab] = useState<'explorer' | 'upload' | 'datasets' | 'quick-add'>('explorer');

  // Stats State
  const [stats, setStats] = useState<MasterStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Search / Explorer State
  const [searchMode, setSearchMode] = useState<'company' | 'pincode'>('company');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);

  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadType, setUploadType] = useState<'company' | 'pincode'>('company');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<{ headers: string[]; rows: any[]; totalRows: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Purge / Dataset Delete State
  const [deleteFileName, setDeleteFileName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [purgeModalTarget, setPurgeModalTarget] = useState<string | null>(null);
  const [purgeConfirmationInput, setPurgeConfirmationInput] = useState('');

  // Quick Single Add State
  const [quickType, setQuickType] = useState<'company' | 'pincode'>('company');
  const [companyName, setCompanyName] = useState('');
  const [companyCategory, setCompanyCategory] = useState('');
  const [pincodeVal, setPincodeVal] = useState('');
  const [pincodeCity, setPincodeCity] = useState('');
  const [pincodeState, setPincodeState] = useState('');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);
  const [quickStatus, setQuickStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Fetch Stats Function
  const fetchStats = async () => {
    setIsLoadingStats(true);
    try {
      const res = await fetch('/api/admin/master-data/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Pre-parse and inspect CSV when file selected
  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      setPreviewError(null);
      return;
    }

    Papa.parse(file, {
      header: true,
      preview: 5,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const rows = results.data as any[];

        // Validate headers based on uploadType
        const normalizedHeaders = headers.map(h => h.toLowerCase().trim().replace(/[\s_-]+/g, ''));
        const hasCompany = normalizedHeaders.some(h => h.includes('company') || h.includes('employer') || h.includes('name'));
        const hasPincode = normalizedHeaders.some(h => h.includes('pin') || h.includes('postal') || h.includes('zip'));

        if (uploadType === 'company' && !hasCompany) {
          setPreviewError('Warning: Could not detect a "company_name" column in this CSV. Please verify column headers.');
        } else if (uploadType === 'pincode' && !hasPincode) {
          setPreviewError('Warning: Could not detect a "pincode" column in this CSV. Please verify column headers.');
        } else {
          setPreviewError(null);
        }

        // Count approximate total rows by parsing quickly
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (fullRes) => {
            setFilePreview({
              headers,
              rows,
              totalRows: fullRes.data.length,
            });
          }
        });
      },
      error: (err) => {
        setPreviewError(`Failed to read CSV: ${err.message}`);
      }
    });
  }, [file, uploadType]);

  // Debounced Verification Search
  useEffect(() => {
    let isMounted = true;

    const performSearch = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const searchOptions: any = {
          limit: 20,
          attributesToSearchOn: searchMode === 'company' ? ['company_name'] : ['pincode'],
        };

        const result = await searchClient.index('companies').search(searchQuery, searchOptions);
        
        if (!isMounted) return;

        let validHits = result.hits;
        if (searchMode === 'pincode') {
          validHits = validHits.filter((item) => String(item.pincode).trim().startsWith(searchQuery.trim()));
        }

        if (selectedCategoryFilter !== 'All') {
          validHits = validHits.filter(item => 
            String(item.category || '').toLowerCase().includes(selectedCategoryFilter.toLowerCase())
          );
        }

        setSearchResults(validHits);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        if (isMounted) setIsSearching(false);
      }
    };

    const debounceFn = setTimeout(() => performSearch(), 300);
    return () => {
      isMounted = false;
      clearTimeout(debounceFn);
    };
  }, [searchQuery, searchMode, selectedCategoryFilter]);

  const handleModeSwitch = (mode: 'company' | 'pincode') => {
    setSearchMode(mode);
    setSearchQuery('');
    setSelectedCategoryFilter('All');
    setSearchResults([]);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteSingleRecord = async (docId: string, label: string) => {
    if (!window.confirm(`Are you sure you want to delete "${label}" from the directory?`)) {
      return;
    }

    setDeletingRecordId(docId);
    try {
      const res = await fetch('/api/admin/master-data/entry', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docId }),
      });

      if (res.ok) {
        setSearchResults(prev => prev.filter(item => item.id !== docId));
        fetchStats();
      } else {
        const err = await res.json();
        alert(`Failed to delete record: ${err.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error deleting record: ${err.message}`);
    } finally {
      setDeletingRecordId(null);
    }
  };

  const downloadSample = () => {
    let csvContent = uploadType === 'company' 
      ? "company_name,category\nHANVA TECHNOLOGIES PVT LTD,Superprime\nTATA CONSULTANCY SERVICES LTD,Cat A\nINFOSYS LTD,Cat A" 
      : "pincode,city,state\n560001,Bengaluru,Karnataka\n110001,New Delhi,Delhi\n400001,Mumbai,Maharashtra";
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sample_${uploadType}_master.csv`;
    link.click();
  };

  const exportSearchResults = () => {
    if (searchResults.length === 0) return;
    const csv = Papa.unparse(searchResults);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${searchMode}_search_export.csv`;
    link.click();
  };

  const handleUploadSubmit = () => {
    if (!file) return;
    
    setIsUploading(true);
    setUploadStatus(null);
    setUploadProgress({ current: 0, total: 0 });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const allRows = results.data;
        const totalRows = allRows.length;
        setUploadProgress({ current: 0, total: totalRows });

        const chunkSize = 2500; 
        
        for (let i = 0; i < totalRows; i += chunkSize) {
          const chunk = allRows.slice(i, i + chunkSize);
          
          try {
            const response = await fetch('/api/admin/upload-companies', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chunk: chunk,
                uploadType: uploadType,
                fileName: file.name
              }),
            });

            if (!response.ok) throw new Error(`Batch failed: ${response.statusText}`);
            
            setUploadProgress(prev => ({ 
              ...prev, 
              current: Math.min(prev.current + chunkSize, totalRows) 
            }));
            
          } catch (error: any) {
            console.error("Upload interrupted:", error);
            setUploadStatus({ type: 'error', msg: `Upload stopped at row ${i}. ${error.message}` });
            setIsUploading(false);
            return;
          }
        }

        setUploadStatus({ type: 'success', msg: `Successfully processed ${totalRows.toLocaleString()} records into the index.` });
        setIsUploading(false);
        setFile(null);
        setFilePreview(null);
        fetchStats();
        setTimeout(() => setUploadStatus(null), 6000);
      },
      error: (error) => {
        setUploadStatus({ type: 'error', msg: `Error parsing CSV: ${error.message}` });
        setIsUploading(false);
      }
    });
  };

  const handleConfirmPurge = async (targetName: string) => {
    if (!targetName.trim()) return;

    setIsDeleting(true);
    setDeleteStatus(null);
    
    try {
      const response = await fetch('/api/admin/delete-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: targetName.trim() }),
      });

      if (response.ok) {
        setDeleteStatus({ type: 'success', msg: `Purge task initiated for "${targetName}". Data is being purged from the index.` });
        setDeleteFileName(''); 
        setPurgeModalTarget(null);
        setPurgeConfirmationInput('');
        fetchStats();
        setTimeout(() => setDeleteStatus(null), 6000);
      } else {
        const errorData = await response.json();
        setDeleteStatus({ type: 'error', msg: `Purge failed: ${errorData.error}` });
      }
    } catch (error) {
      console.error(error);
      setDeleteStatus({ type: 'error', msg: "Network error occurred during purge." });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingQuick(true);
    setQuickStatus(null);

    try {
      const payload: any = { type: quickType };
      if (quickType === 'company') {
        if (!companyName.trim()) {
          setQuickStatus({ type: 'error', msg: 'Company name is required.' });
          setIsSubmittingQuick(false);
          return;
        }
        payload.companyName = companyName.trim();
        payload.category = companyCategory.trim() || 'Uncategorized';
      } else {
        if (!pincodeVal.trim() || pincodeVal.trim().length !== 6) {
          setQuickStatus({ type: 'error', msg: 'A valid 6-digit pincode is required.' });
          setIsSubmittingQuick(false);
          return;
        }
        payload.pincode = pincodeVal.trim();
        payload.city = pincodeCity.trim() || 'Unspecified';
        payload.state = pincodeState.trim();
      }

      const res = await fetch('/api/admin/master-data/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setQuickStatus({ type: 'success', msg: `Successfully added ${quickType === 'company' ? companyName : pincodeVal} to index!` });
        if (quickType === 'company') {
          setCompanyName('');
          setCompanyCategory('');
        } else {
          setPincodeVal('');
          setPincodeCity('');
          setPincodeState('');
        }
        fetchStats();
        setTimeout(() => setQuickStatus(null), 5000);
      } else {
        const data = await res.json();
        setQuickStatus({ type: 'error', msg: data.error || 'Failed to add entry.' });
      }
    } catch (err: any) {
      setQuickStatus({ type: 'error', msg: `Network error: ${err.message}` });
    } finally {
      setIsSubmittingQuick(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-8 bg-slate-50/40 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-tr from-blue-700 to-indigo-600 text-white rounded-2xl shadow-lg shadow-blue-600/25">
            <Database className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Master Data Management</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                stats?.isIndexing ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${stats?.isIndexing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                {stats?.isIndexing ? 'Indexing Data' : 'Search Engine Active'}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              Centralized repository for company categorizations, whitelists, and serviceable pincodes.
            </p>
          </div>
        </div>

        <button 
          onClick={fetchStats}
          disabled={isLoadingStats}
          className="self-start md:self-auto flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm active:scale-95 disabled:opacity-50"
          title="Refresh index statistics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
          <span>Refresh Stats</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Documents */}
        <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Indexed</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
            {stats ? stats.totalDocuments.toLocaleString() : <span className="animate-pulse">---</span>}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Live searchable documents</p>
        </div>

        {/* Total Companies */}
        <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Companies</span>
            <Building2 className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-indigo-900 font-mono">
            {stats ? stats.totalCompanies.toLocaleString() : <span className="animate-pulse">---</span>}
          </div>
          <p className="text-[11px] text-indigo-500/80 mt-1">Categorized employers</p>
        </div>

        {/* Total Pincodes */}
        <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Serviceable Pincodes</span>
            <MapPin className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-900 font-mono">
            {stats ? stats.totalPincodes.toLocaleString() : <span className="animate-pulse">---</span>}
          </div>
          <p className="text-[11px] text-emerald-600/80 mt-1">Validated service areas</p>
        </div>

        {/* Ingested Datasets */}
        <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Batches / Files</span>
            <FileText className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-purple-900 font-mono">
            {stats ? (stats.files?.length || 'Active') : <span className="animate-pulse">---</span>}
          </div>
          <p className="text-[11px] text-purple-600/80 mt-1">Ingested CSV source files</p>
        </div>
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex overflow-x-auto p-1.5 bg-slate-200/60 rounded-2xl max-w-fit gap-1 shadow-inner scrollbar-none">
        <button
          onClick={() => setActiveTab('explorer')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
            activeTab === 'explorer'
              ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
          }`}
        >
          <Search className="w-4 h-4" />
          Directory Explorer
        </button>

        <button
          onClick={() => setActiveTab('upload')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
            activeTab === 'upload'
              ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          Batch CSV Upload
        </button>

        <button
          onClick={() => setActiveTab('datasets')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
            activeTab === 'datasets'
              ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
          }`}
        >
          <Database className="w-4 h-4" />
          Datasets & Purge
        </button>

        <button
          onClick={() => setActiveTab('quick-add')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
            activeTab === 'quick-add'
              ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
          }`}
        >
          <Plus className="w-4 h-4" />
          Quick Add Entry
        </button>
      </div>

      {/* --- TAB 1: DIRECTORY EXPLORER --- */}
      {activeTab === 'explorer' && (
        <div className="p-6 sm:p-8 border border-slate-200 rounded-3xl bg-white shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Directory Explorer & Verification</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time sub-millisecond lookup from Meilisearch index.
              </p>
            </div>

            {/* Type Switcher */}
            <div className="flex p-1 bg-slate-100 rounded-xl w-fit">
              <button
                onClick={() => handleModeSwitch('company')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
                  searchMode === 'company'
                    ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Companies
              </button>
              <button
                onClick={() => handleModeSwitch('pincode')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
                  searchMode === 'pincode'
                    ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                Pincodes
              </button>
            </div>
          </div>

          {/* Search Bar & Filters */}
          <div className="space-y-3">
            <div className="relative group max-w-2xl">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className={`h-5 w-5 transition-colors ${isSearching ? 'text-blue-500' : 'text-slate-400 group-focus-within:text-blue-500'}`} />
              </div>
              <input
                type="text"
                placeholder={searchMode === 'company' ? "Type company name to verify (e.g. Tata, Infosys, HDFC)..." : "Type 6-digit Pincode (e.g. 560001, 110001)..."}
                className="w-full pl-12 pr-12 py-3.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-slate-800 text-sm font-medium placeholder:text-slate-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {isSearching && (
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                </div>
              )}
              {searchQuery && !isSearching && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Quick Category Chips for Companies */}
            {searchMode === 'company' && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mr-1 flex items-center gap-1">
                  <Filter className="w-3 h-3" /> Filter:
                </span>
                {['All', 'Superprime', 'Prime', 'Cat A', 'Cat B', 'Cat C', 'Listed'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      selectedCategoryFilter === cat
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Results Summary & Export */}
          {searchResults.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-bold text-slate-500">
                Found {searchResults.length} matching {searchMode === 'company' ? 'companies' : 'pincodes'}
              </span>
              <button
                onClick={exportSearchResults}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export Results CSV
              </button>
            </div>
          )}

          {/* Results Grid */}
          <div className="space-y-3">
            {searchResults.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {searchResults.map((item) => (
                  <div 
                    key={item.id} 
                    className="p-4 border border-slate-200 hover:border-blue-300 rounded-2xl bg-white flex flex-col justify-between transition-all duration-200 shadow-sm hover:shadow-md group relative"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl mt-0.5 ${
                        searchMode === 'company' 
                          ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-100' 
                          : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100'
                      } transition-colors flex-shrink-0`}>
                        {searchMode === 'company' ? <Building2 className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 
                            className="text-sm font-bold text-slate-900 leading-snug break-words" 
                            title={searchMode === 'company' ? item.company_name : item.pincode}
                          >
                            {searchMode === 'company' ? item.company_name : item.pincode}
                          </h3>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => handleCopy(searchMode === 'company' ? item.company_name : item.pincode, item.id)}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
                              title="Copy to clipboard"
                            >
                              {copiedId === item.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => handleDeleteSingleRecord(item.id, searchMode === 'company' ? item.company_name : item.pincode)}
                              disabled={deletingRecordId === item.id}
                              className="p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Delete this record from index"
                            >
                              {deletingRecordId === item.id ? <Loader2 className="w-4 h-4 animate-spin text-red-500" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Metadata row */}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {searchMode === 'company' ? (
                            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-[11px] font-bold">
                              <span>Cat:</span>
                              <span>{item.category || 'Uncategorized'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md text-[11px] font-bold">
                              <span>City:</span>
                              <span>{item.city || 'Unknown Location'}</span>
                            </span>
                          )}

                          {item.state && (
                            <span className="text-[11px] text-slate-500 font-medium">
                              State: {item.state}
                            </span>
                          )}

                          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]" title={item.file_name}>
                            📁 {item.file_name || 'Manual Entry'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              searchQuery && !isSearching && (
                <div className="text-center py-12 px-4 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                  <Search className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-slate-700">No records found</h3>
                  <p className="text-slate-500 text-xs mt-1">
                    No data matching "{searchQuery}" in {searchMode === 'company' ? 'Company Directory' : 'Pincodes'}.
                  </p>
                  <button
                    onClick={() => setActiveTab('quick-add')}
                    className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add this {searchMode === 'company' ? 'Company' : 'Pincode'} to Index
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* --- TAB 2: BATCH CSV UPLOAD --- */}
      {activeTab === 'upload' && (
        <div className="p-6 sm:p-8 border border-slate-200 rounded-3xl bg-white shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Batch CSV Directory Ingestion</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Bulk upload files with automatic chunking (2,500 records/batch) and instant Meilisearch indexing.
              </p>
            </div>

            <button 
              onClick={downloadSample} 
              className="flex items-center gap-1.5 text-blue-600 font-bold hover:text-blue-800 transition-colors text-xs bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl"
              disabled={isUploading}
            >
              <Download className="w-3.5 h-3.5" /> 
              Download {uploadType === 'company' ? 'Company' : 'Pincode'} Sample CSV
            </button>
          </div>

          {/* Status Alert */}
          {uploadStatus && (
            <div className={`p-4 rounded-2xl flex items-start gap-3 text-sm font-medium ${
              uploadStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {uploadStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
              <p>{uploadStatus.msg}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Step 1: Type Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                1. Select Directory Target
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setUploadType('company'); setFile(null); }}
                  disabled={isUploading}
                  className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    uploadType === 'company'
                      ? 'border-blue-600 bg-blue-50/50 text-blue-900 ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                  }`}
                >
                  <Building2 className={`w-6 h-6 mb-2 ${uploadType === 'company' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <div className="font-bold text-sm">Company Directory</div>
                  <div className="text-[11px] text-slate-500 mt-1">company_name, category</div>
                </button>

                <button
                  type="button"
                  onClick={() => { setUploadType('pincode'); setFile(null); }}
                  disabled={isUploading}
                  className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    uploadType === 'pincode'
                      ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                  }`}
                >
                  <MapPin className={`w-6 h-6 mb-2 ${uploadType === 'pincode' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <div className="font-bold text-sm">Serviceable Pincodes</div>
                  <div className="text-[11px] text-slate-500 mt-1">pincode, city, state</div>
                </button>
              </div>
            </div>

            {/* Step 2: Dropzone */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                2. Select or Drop CSV File
              </label>
              <label 
                className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-2xl transition-all duration-200 ${
                  isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  file 
                    ? 'border-blue-400 bg-blue-50/30 hover:bg-blue-50/50' 
                    : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400'
                }`}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                  {file ? (
                    <>
                      <div className="bg-blue-100 p-2.5 rounded-2xl mb-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                      </div>
                      <p className="text-sm font-bold text-slate-900 truncate max-w-[280px]">{file.name}</p>
                      <p className="text-xs text-blue-600 font-semibold mt-0.5">
                        {(file.size / 1024).toFixed(1)} KB {filePreview ? `• ~${filePreview.totalRows.toLocaleString()} rows` : ''}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="bg-slate-200/80 p-2.5 rounded-2xl mb-2">
                        <UploadCloud className="w-6 h-6 text-slate-500" />
                      </div>
                      <p className="text-sm font-bold text-slate-700">Click or drag CSV file here</p>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">Supports UTF-8 CSV up to 100,000+ rows</p>
                    </>
                  )}
                </div>
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  disabled={isUploading}
                  className="hidden" 
                />
              </label>
            </div>
          </div>

          {/* Pre-upload Header Inspection Preview */}
          {filePreview && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Pre-Upload Inspection
                </span>
                <span className="font-mono text-slate-500">
                  Detected Columns: {filePreview.headers.join(', ')}
                </span>
              </div>

              {previewError && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}

              {/* Sample 3 rows preview */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 font-bold">
                    <tr>
                      {filePreview.headers.slice(0, 5).map((h, idx) => (
                        <th key={idx} className="p-2 border-b border-slate-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filePreview.rows.slice(0, 3).map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                        {filePreview.headers.slice(0, 5).map((h, cIdx) => (
                          <td key={cIdx} className="p-2 truncate max-w-[200px] text-slate-700">{row[h] || '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex justify-between text-xs font-bold text-slate-700 uppercase tracking-wide">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> 
                  Syncing Chunks to Meilisearch...
                </span>
                <span className="text-blue-600 font-mono">
                  {Math.round((uploadProgress.current / uploadProgress.total) * 100) || 0}%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden shadow-inner">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden" 
                  style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
                >
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                </div>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>Chunk Size: 2,500 records</span>
                <span>{uploadProgress.current.toLocaleString()} / {uploadProgress.total.toLocaleString()} processed</span>
              </div>
            </div>
          )}

          {/* Action Button */}
          <button 
            onClick={handleUploadSubmit}
            disabled={!file || isUploading}
            className={`w-full py-4 rounded-2xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-2 shadow-lg ${
              !file || isUploading 
                ? 'bg-slate-300 cursor-not-allowed text-slate-500 shadow-none' 
                : 'bg-slate-900 hover:bg-slate-800 hover:-translate-y-0.5 active:translate-y-0'
            }`}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> 
                Processing & Ingesting Dataset...
              </>
            ) : (
              <>
                <UploadCloud className="w-5 h-5" /> 
                Start Ingestion ({filePreview?.totalRows ? `${filePreview.totalRows.toLocaleString()} rows` : 'Upload'})
              </>
            )}
          </button>
        </div>
      )}

      {/* --- TAB 3: DATASETS & PURGE --- */}
      {activeTab === 'datasets' && (
        <div className="space-y-6">
          {/* Status Alert */}
          {deleteStatus && (
            <div className={`p-4 rounded-2xl flex items-start gap-3 text-sm font-medium ${
              deleteStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {deleteStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
              <p>{deleteStatus.msg}</p>
            </div>
          )}

          {/* Ingested Datasets Table */}
          <div className="p-6 sm:p-8 border border-slate-200 rounded-3xl bg-white shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Ingested File Batches</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Overview of all uploaded CSV files and their indexed document counts.
                </p>
              </div>
              <button
                onClick={fetchStats}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reload List
              </button>
            </div>

            {stats?.files && stats.files.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5">Filename</th>
                      <th className="p-3.5">Inferred Type</th>
                      <th className="p-3.5">Record Count</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {stats.files.map((f, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 font-mono text-slate-900 font-bold">
                          📁 {f.fileName}
                        </td>
                        <td className="p-3.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            f.type === 'pincode' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {f.type === 'pincode' ? <MapPin className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                            {f.type === 'pincode' ? 'Pincodes' : 'Companies'}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-700">
                          {f.count.toLocaleString()} docs
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => {
                              setPurgeModalTarget(f.fileName);
                              setPurgeConfirmationInput('');
                            }}
                            className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                          >
                            Purge File
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 bg-slate-50/50 rounded-2xl border border-slate-200">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">
                  {stats?.isIndexing ? 'Indexing in progress...' : 'Batch file facets not available'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  You can use the manual purge box below to purge any specific file name.
                </p>
              </div>
            )}
          </div>

          {/* Danger Zone: Manual Purge by Exact Filename */}
          <div className="p-6 sm:p-8 border border-red-200/80 rounded-3xl bg-gradient-to-b from-white to-red-50/20 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 text-red-600">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-bold text-slate-900">Danger Zone: Purge Specific Filename</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
              Permanently delete all documents associated with a specific file upload name. Meilisearch will purge all documents where <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-mono">file_name</code> equals your target.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
              <input
                type="text"
                placeholder="Enter exact filename (e.g. batch_01.csv)"
                value={deleteFileName}
                onChange={(e) => setDeleteFileName(e.target.value)}
                disabled={isDeleting}
                className="flex-1 p-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-xs font-mono"
              />
              <button
                onClick={() => handleConfirmPurge(deleteFileName)}
                disabled={!deleteFileName.trim() || isDeleting}
                className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-red-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Purge Dataset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 4: QUICK SINGLE ADD --- */}
      {activeTab === 'quick-add' && (
        <div className="p-6 sm:p-8 border border-slate-200 rounded-3xl bg-white shadow-sm space-y-6 max-w-2xl mx-auto">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Quick Single Add</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Instantly insert an individual company or serviceable pincode without uploading a CSV.
            </p>
          </div>

          {quickStatus && (
            <div className={`p-4 rounded-2xl flex items-start gap-3 text-sm font-medium ${
              quickStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {quickStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
              <p>{quickStatus.msg}</p>
            </div>
          )}

          {/* Toggle Type */}
          <div className="flex p-1 bg-slate-100 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setQuickType('company')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
                quickType === 'company'
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Company
            </button>
            <button
              type="button"
              onClick={() => setQuickType('pincode')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
                quickType === 'pincode'
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Pincode
            </button>
          </div>

          <form onSubmit={handleQuickAddSubmit} className="space-y-4">
            {quickType === 'company' ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tata Consultancy Services PVT LTD"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Category / Tier
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Superprime, Cat A, Prime"
                    value={companyCategory}
                    onChange={(e) => setCompanyCategory(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-semibold text-slate-800 mb-2"
                  />
                  {/* Quick Category Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {['Superprime', 'Cat A', 'Cat B', 'Cat C', 'Listed', 'Open Market'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setCompanyCategory(chip)}
                        className="text-[11px] font-semibold px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-lg text-slate-600 transition-colors"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    6-Digit Pincode *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="e.g. 560001"
                    value={pincodeVal}
                    onChange={(e) => setPincodeVal(e.target.value.replace(/\D/g, ''))}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-mono font-bold text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                      City / Location
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Bengaluru"
                      value={pincodeCity}
                      onChange={(e) => setPincodeCity(e.target.value)}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-semibold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                      State
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Karnataka"
                      value={pincodeState}
                      onChange={(e) => setPincodeState(e.target.value)}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-semibold text-slate-800"
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={isSubmittingQuick}
              className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmittingQuick ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Save & Index Immediately
            </button>
          </form>
        </div>
      )}

      {/* Purge Confirmation Modal */}
      {purgeModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-red-100 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-2xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Confirm Dataset Purge</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-2xl text-xs text-red-900 space-y-1">
              <p>You are about to purge all records indexed under:</p>
              <p className="font-mono font-bold text-sm text-red-700 break-all">{purgeModalTarget}</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                To confirm, type <span className="font-mono text-red-600 font-bold">{purgeModalTarget}</span> below:
              </label>
              <input
                type="text"
                placeholder={purgeModalTarget}
                value={purgeConfirmationInput}
                onChange={(e) => setPurgeConfirmationInput(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPurgeModalTarget(null);
                  setPurgeConfirmationInput('');
                }}
                disabled={isDeleting}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmPurge(purgeModalTarget)}
                disabled={purgeConfirmationInput !== purgeModalTarget || isDeleting}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Confirm Purge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
