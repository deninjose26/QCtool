import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ChevronLeft,
    ChevronRight,
    ArrowLeft,
    ZoomIn,
    ZoomOut,
    RotateCw,
    ImageIcon,
    AlertCircle,
    Database,
    MapPin,
    LayoutGrid,
    Search,
    Loader2,
    Building2,
    FileText,
    Book,
    Maximize,
    Minimize
} from 'lucide-react';
import logo from '@/assets/logo.png';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config';
import { cn } from '@/lib/utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface OperatorBatch {
    id: string;
    batch_uid: string;
    batch_id: string;
    project_name: string;
    source_name: string;
    location_name: string;
    record_owner_name: string;
    record_type_name: string;
    book_name: string;
    upload_type: string;
}

interface PreviewImage {
    image_id: string;
    image_name: string;
    url: string;
    is_converted: boolean;
    status: string;
}

const ITEMS_PER_PAGE = 24;

const OperatorImagePreview: React.FC = () => {
    const { batchUid: paramBatchUid } = useParams<{ batchUid: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();

    // Data State
    const [allBatches, setAllBatches] = useState<OperatorBatch[]>([]);
    const [images, setImages] = useState<PreviewImage[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoadingBatches, setIsLoadingBatches] = useState(true);
    const [isLoadingImages, setIsLoadingImages] = useState(false);
    const [imageLoadError, setImageLoadError] = useState(false);

    // UI State
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [isFitMode, setIsFitMode] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [isBlurred, setIsBlurred] = useState(false);

    // Filter Options States
    const [projects, setProjects] = useState<string[]>([]);
    const [sources, setSources] = useState<string[]>([]);
    const [locations, setLocations] = useState<string[]>([]);
    const [owners, setOwners] = useState<string[]>([]);
    const [types, setTypes] = useState<string[]>([]);
    const [uploadTypes, setUploadTypes] = useState<string[]>([]);
    const [availableBooks, setAvailableBooks] = useState<OperatorBatch[]>([]);

    // Filter selections
    const [projectFilter, setProjectFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [locationFilter, setLocationFilter] = useState('all');
    const [ownerFilter, setOwnerFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [uploadTypeFilter, setUploadTypeFilter] = useState('all');
    const [bookFilter, setBookFilter] = useState(paramBatchUid || 'all');

    const token = localStorage.getItem('qc_token');

    // Fetch all batches on mount
    useEffect(() => {
        const fetchBatches = async () => {
            try {
                setIsLoadingBatches(true);
                const res = await fetch(`${API_BASE_URL}/operator/batches`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Failed to fetch batches');
                const data = await res.json();
                setAllBatches(data);

                if (paramBatchUid) {
                    const batch = data.find((b: any) => b.batch_uid === paramBatchUid);
                    if (batch) {
                        setProjectFilter(batch.project_name);
                        setSourceFilter(batch.source_name);
                        setLocationFilter(batch.location_name);
                        setOwnerFilter(batch.record_owner_name);
                        setTypeFilter(batch.record_type_name);
                        setUploadTypeFilter(batch.upload_type);
                        setBookFilter(batch.batch_uid);
                    }
                }
            } catch (err: any) {
                toast({ title: 'Error', description: 'Failed to load batch list', variant: 'destructive' });
            } finally {
                setIsLoadingBatches(false);
            }
        };
        fetchBatches();
    }, [token, paramBatchUid, toast]);

    // Update filter options whenever allBatches or filter selections change
    useEffect(() => {
        // Always derive unique projects from the full set
        const uniqueProjects = Array.from(new Set(allBatches.map(b => b.project_name))).sort();
        setProjects(uniqueProjects);

        // 1. Filter by Project
        const filteredByProj = projectFilter === 'all' ? [] : allBatches.filter(b => b.project_name === projectFilter);
        setSources(Array.from(new Set(filteredByProj.map(b => b.source_name))).sort());

        // 2. Filter by Source
        const filteredBySrc = sourceFilter === 'all' ? filteredByProj : filteredByProj.filter(b => b.source_name === sourceFilter);
        setLocations(Array.from(new Set(filteredBySrc.map(b => b.location_name))).sort());

        // 3. Filter by Location
        const filteredByLoc = locationFilter === 'all' ? filteredBySrc : filteredBySrc.filter(b => b.location_name === locationFilter);
        setOwners(Array.from(new Set(filteredByLoc.map(b => b.record_owner_name))).sort());

        // 4. Filter by Owner
        const filteredByOwner = ownerFilter === 'all' ? filteredByLoc : filteredByLoc.filter(b => b.record_owner_name === ownerFilter);
        setTypes(Array.from(new Set(filteredByOwner.map(b => b.record_type_name))).sort());

        // 5. Filter by Type
        const filteredByType = typeFilter === 'all' ? filteredByOwner : filteredByOwner.filter(b => b.record_type_name === typeFilter);
        setUploadTypes(Array.from(new Set(filteredByType.map(b => b.upload_type))).sort());

        // 6. Filter by Upload Type
        const finalBatches = uploadTypeFilter === 'all' ? filteredByType : filteredByType.filter(b => b.upload_type === uploadTypeFilter);

        // Relaxed drill-down: Show books if at least one filter is active
        const anyFilterSelected =
            projectFilter !== 'all' ||
            sourceFilter !== 'all' ||
            locationFilter !== 'all' ||
            ownerFilter !== 'all' ||
            typeFilter !== 'all' ||
            uploadTypeFilter !== 'all';

        setAvailableBooks(anyFilterSelected ? finalBatches.sort((a, b) => a.book_name.localeCompare(b.book_name)) : []);
    }, [allBatches, projectFilter, sourceFilter, locationFilter, ownerFilter, typeFilter, uploadTypeFilter]);


    // Fetch images when bookFilter (Batch UID) changes
    useEffect(() => {
        setImageLoadError(false);
        const fetchImages = async () => {
            if (bookFilter === 'all') {
                setImages([]);
                return;
            }

            try {
                setIsLoadingImages(true);
                const res = await fetch(`${API_BASE_URL}/operator/batches/${bookFilter}/images`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!res.ok) throw new Error('Failed to fetch images');
                const data = await res.json();
                setImages(data);
                setCurrentIndex(0);
                setRotation(0);
                setZoom(1);
                setCurrentPage(1);
            } catch (err: any) {
                toast({ title: 'Error', description: err.message, variant: 'destructive' });
            } finally {
                setIsLoadingImages(false);
            }
        };

        fetchImages();
    }, [bookFilter, token, toast]);

    // Navigation Handlers
    const handleNext = () => {
        if (currentIndex < images.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setRotation(0);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            setRotation(0);
        }
    };

    // Reset image load error when current image or book changes
    useEffect(() => {
        setImageLoadError(false);
    }, [bookFilter, currentIndex]);

    // Search and Filter Logic
    const filteredImages = images.filter(img =>
        img.image_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Security & Anti-Screenshot logic
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Block PrintScreen (44), F12, Ctrl+Shift+I, etc.
            if (e.key === 'PrintScreen') {
                e.preventDefault();
                toast({ title: 'Security Alert', description: 'Screenshots are disabled for security reasons.', variant: 'destructive' });
            }
            if ((e.ctrlKey && e.shiftKey && e.key === 'I') || e.key === 'F12') {
                e.preventDefault();
            }

            // Navigation Shortcuts (only if not typing in search box)
            if (!(e.target instanceof HTMLInputElement)) {
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    handleNext();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    handlePrev();
                } else if (e.key.toLowerCase() === 'f') {
                    e.preventDefault();
                    setIsFitMode(prev => !prev);
                }
            }
        };

        const handleFocusLost = () => setIsBlurred(true);
        const handleFocusGained = () => setIsBlurred(false);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') setIsBlurred(true);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('blur', handleFocusLost);
        window.addEventListener('focus', handleFocusGained);
        window.addEventListener('mouseleave', handleFocusLost);
        window.addEventListener('mouseenter', handleFocusGained);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('blur', handleFocusLost);
            window.removeEventListener('focus', handleFocusGained);
            window.removeEventListener('mouseleave', handleFocusLost);
            window.removeEventListener('mouseenter', handleFocusGained);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [toast, currentIndex, images.length]); // Added dependencies for navigation logic

    // Pagination based on search results
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedImages = filteredImages.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    const totalPages = Math.ceil(filteredImages.length / ITEMS_PER_PAGE);

    const currentImage = images[currentIndex];

    if (isLoadingBatches) {
        return (
            <div className="h-[80vh] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground animate-pulse font-medium">Initializing preview system...</p>
            </div>
        );
    }

    return (
        <div className={cn(
            "flex flex-col h-screen overflow-hidden animate-fade-in bg-background w-full px-6 pb-4 text-left security-lockdown",
            isBlurred && "focus-blur"
        )}>
            {/* Header & Filters: Fixed Height Section */}
            <div className="flex-none space-y-4 pt-4 pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight">Audit Console</h2>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium opacity-70">Grid-based Verification System</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2 text-xs font-bold hover:bg-primary/5">
                        <ArrowLeft className="h-3.5 w-3.5" /> Return
                    </Button>
                </div>

                {/* Optimized Navigation Bar */}
                <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm min-w-[140px]">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        <Select value={projectFilter} onValueChange={(v) => {
                            setProjectFilter(v); setSourceFilter('all'); setLocationFilter('all'); setOwnerFilter('all'); setTypeFilter('all'); setUploadTypeFilter('all'); setBookFilter('all');
                        }}>
                            <SelectTrigger className="h-6 border-none shadow-none text-[11px] font-bold p-0 focus:ring-0">
                                <SelectValue placeholder="Project" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Every Project</SelectItem>
                                {projects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm min-w-[120px]">
                        <Database className="h-3.5 w-3.5 text-slate-400" />
                        <Select value={sourceFilter} onValueChange={(v) => {
                            setSourceFilter(v); setLocationFilter('all'); setOwnerFilter('all'); setTypeFilter('all'); setUploadTypeFilter('all'); setBookFilter('all');
                        }} disabled={projectFilter === 'all'}>
                            <SelectTrigger className="h-6 border-none shadow-none text-[11px] font-bold p-0 focus:ring-0">
                                <SelectValue placeholder="Source" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Source</SelectItem>
                                {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm min-w-[120px]">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        <Select value={locationFilter} onValueChange={(v) => {
                            setLocationFilter(v); setOwnerFilter('all'); setTypeFilter('all'); setUploadTypeFilter('all'); setBookFilter('all');
                        }} disabled={sourceFilter === 'all'}>
                            <SelectTrigger className="h-6 border-none shadow-none text-[11px] font-bold p-0 focus:ring-0">
                                <SelectValue placeholder="Location" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Location</SelectItem>
                                {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm min-w-[120px]">
                        <LayoutGrid className="h-3.5 w-3.5 text-slate-400" />
                        <Select value={ownerFilter} onValueChange={(v) => {
                            setOwnerFilter(v); setTypeFilter('all'); setUploadTypeFilter('all'); setBookFilter('all');
                        }} disabled={locationFilter === 'all'}>
                            <SelectTrigger className="h-6 border-none shadow-none text-[11px] font-bold p-0 focus:ring-0">
                                <SelectValue placeholder="Owner" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Owner</SelectItem>
                                {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm min-w-[100px]">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        <Select value={typeFilter} onValueChange={(v) => {
                            setTypeFilter(v); setUploadTypeFilter('all'); setBookFilter('all');
                        }} disabled={ownerFilter === 'all'}>
                            <SelectTrigger className="h-6 border-none shadow-none text-[11px] font-bold p-0 focus:ring-0">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Type</SelectItem>
                                {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex-1 min-w-[240px]">
                        <Select value={bookFilter} onValueChange={setBookFilter} disabled={uploadTypeFilter === 'all' && availableBooks.length === 0}>
                            <SelectTrigger className="h-10 border-indigo-500 bg-indigo-50 text-indigo-700 font-bold shadow-sm rounded-xl px-4 hover:bg-indigo-100 transition-colors">
                                <div className="flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4" />
                                    <SelectValue placeholder="SELECT BATCH TO PREVIEW" />
                                </div>
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px] p-1.5 rounded-2xl border-slate-200/60 shadow-2xl">
                                <SelectItem value="all" className="p-2.5 mb-1 last:mb-0 rounded-xl transition-all focus:bg-slate-50 border border-transparent focus:border-slate-100 font-bold text-xs uppercase text-slate-400 italic">Select Batch...</SelectItem>
                                {availableBooks.map(b => (
                                    <SelectItem key={b.batch_uid} value={b.batch_uid} className="p-2.5 mb-1 last:mb-0 rounded-xl transition-all focus:bg-indigo-50 group border border-transparent focus:border-indigo-100">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 flex items-center justify-center text-indigo-600 group-focus:scale-110 transition-transform">
                                                <Book className="h-4 w-4" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black uppercase tracking-tight text-slate-700 group-focus:text-indigo-700">{b.book_name}</span>
                                                <span className="text-[9px] font-bold font-mono text-slate-400 uppercase tracking-tighter group-focus:text-indigo-400/80">ID: {b.batch_id.slice(-12)}</span>
                                            </div>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search by image name..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full h-9 pl-9 pr-4 bg-white border border-slate-200 rounded-xl text-[11px] font-medium outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* Main Workspace Canvas Split: 70/30 */}
            <div className="flex-1 flex gap-4 overflow-hidden min-h-0 w-full mb-4">
                {/* LEFT: Viewer Panel (70%) */}
                <div className="flex-[7] flex flex-col min-h-0 overflow-hidden border rounded-xl shadow-sm bg-slate-50">
                    <div className="flex-none h-11 border-b border-slate-200 bg-white flex items-center justify-between px-4 z-10">
                        <div className="flex items-center gap-4">
                            {currentImage && (
                                <>
                                    <div className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-mono font-bold text-slate-500 border border-slate-200">
                                        {currentIndex + 1} / {images.length}
                                    </div>
                                    <span className="text-[11px] font-bold truncate text-slate-700 tracking-wide font-mono">
                                        {currentImage.image_name}
                                    </span>
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                onClick={() => setIsFitMode(!isFitMode)}
                                className={cn(
                                    "h-8 gap-2 text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm",
                                    isFitMode
                                        ? "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700 hover:text-white"
                                        : "bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50 hover:text-indigo-700"
                                )}
                            >
                                {isFitMode ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
                                {isFitMode ? "Fitted" : "Fit to Screen"}
                            </Button>

                            <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                                <button onClick={() => { setZoom(Math.max(0.1, zoom - 0.2)); setIsFitMode(false); }} className="hover:bg-slate-200 text-slate-500 rounded p-1 transition-colors"><ZoomOut className="h-3 w-3" /></button>
                                <span className="text-[10px] text-slate-700 font-mono font-bold w-12 text-center select-none">{isFitMode ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
                                <button onClick={() => { setZoom(Math.min(5, zoom + 0.2)); setIsFitMode(false); }} className="hover:bg-slate-200 text-slate-500 rounded p-1 transition-colors"><ZoomIn className="h-3 w-3" /></button>
                            </div>
                            <button onClick={() => setRotation((r) => (r + 90) % 360)} className="h-8 w-8 border border-slate-200 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors"><RotateCw className="h-3.5 w-3.5" /></button>
                        </div>
                    </div>

                    <div
                        className="flex-1 relative overflow-auto bg-slate-50/50 group/viewer custom-scrollbar"
                        onWheel={(e) => {
                            if (e.ctrlKey) {
                                e.preventDefault();
                                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                                setZoom(prev => {
                                    const newZoom = Math.min(Math.max(0.1, prev + delta), 5);
                                    if (newZoom !== prev) setIsFitMode(false);
                                    return newZoom;
                                });
                            }
                        }}
                    >
                        {isLoadingImages ? (
                            <div className="flex flex-col items-center justify-center gap-4 w-full h-full">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 animate-pulse">Scanning...</p>
                            </div>
                        ) : currentImage?.url && !imageLoadError ? (
                            <div className={cn(
                                "flex items-center justify-center p-6",
                                isFitMode ? "w-full h-full" : "min-w-full min-h-full"
                            )}>
                                <img
                                    src={currentImage.url}
                                    alt={currentImage.image_name}
                                    onContextMenu={(e) => e.preventDefault()}
                                    className={cn(
                                        "transition-transform duration-300 shadow-sm relative z-0",
                                        isFitMode ? "max-w-full max-h-full object-contain" : ""
                                    )}
                                    style={{
                                        transform: isFitMode ? `rotate(${rotation}deg)` : `scale(${zoom}) rotate(${rotation}deg)`,
                                        transformOrigin: 'center center'
                                    }}
                                    onError={() => setImageLoadError(true)}
                                />

                                {/* Universal Brand Watermark */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden px-10">
                                    <div className="text-[0.5rem] md:text-[2.5rem] font-black text-slate-900/[0.25] transform -rotate-12 select-none pointer-events-none uppercase tracking-tight whitespace-nowrap drop-shadow-sm text-center">
                                        FamilyaConnect
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4 text-slate-300">
                                <ImageIcon className="h-20 w-20" />
                                <p className="text-[12px] font-black uppercase tracking-widest">Panel Ready</p>
                            </div>
                        )}
                    </div>

                    <div className="flex-none h-12 border-t border-slate-200 bg-white flex items-center justify-between px-6">
                        <Button variant="ghost" size="sm" onClick={handlePrev} disabled={currentIndex === 0 || images.length === 0} className="h-8 text-[11px] gap-2 px-4 text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                            <ChevronLeft className="h-3.5 w-3.5" /> Previous
                        </Button>
                        <div className="h-1 w-32 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${images.length > 0 ? ((currentIndex + 1) / images.length) * 100 : 0}%` }} />
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleNext} disabled={currentIndex === images.length - 1 || images.length === 0} className="h-8 text-[11px] gap-2 px-4 text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                            Next <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {/* RIGHT: Catalog Panel (30%) */}
                <div className="flex-[3] flex flex-col min-h-0 overflow-hidden">
                    <Card className="flex-1 flex flex-col min-h-0 overflow-hidden border shadow-lg bg-background">
                        <div className="flex-none p-4 border-b bg-muted/20 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <LayoutGrid className="h-4 w-4 text-primary" />
                                    <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground">
                                        Batch Catalog
                                    </h3>
                                </div>
                                <Badge variant="secondary" className="text-[10px] font-mono font-bold bg-primary/10 text-primary border-none">
                                    {filteredImages.length} FOUND
                                </Badge>
                            </div>

                            {/* Catalog Search Bar */}
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search image name..."
                                    value={searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                    className="w-full bg-background border rounded-lg h-9 pl-9 pr-4 text-[11px] font-medium outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            {paginatedImages.length > 0 ? (
                                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                    {paginatedImages.map((img) => {
                                        const originalIndex = images.findIndex(item => item.image_id === img.image_id);
                                        const isActive = originalIndex === currentIndex;
                                        return (
                                            <button
                                                key={img.image_id}
                                                onClick={() => { setCurrentIndex(originalIndex); setRotation(0); }}
                                                className={cn(
                                                    "min-h-[85px] rounded-xl border-2 transition-all flex flex-col items-center justify-center p-2 relative group/item",
                                                    isActive
                                                        ? "bg-primary text-white border-primary shadow-xl scale-105 z-10 ring-4 ring-primary/10"
                                                        : "bg-background border-muted hover:border-primary/40 hover:bg-primary/5 hover:scale-105"
                                                )}
                                            >
                                                <span className={cn(
                                                    "text-[14px] font-black font-mono leading-none",
                                                    isActive ? "text-white" : "text-muted-foreground group-hover/item:text-primary"
                                                )}>
                                                    #{originalIndex + 1}
                                                </span>
                                                <span className={cn(
                                                    "text-[8px] font-bold break-all w-full text-center mt-1.5 leading-tight opacity-70",
                                                    isActive ? "text-white/90" : "text-muted-foreground/80"
                                                )}>
                                                    {img.image_name}
                                                </span>

                                                <div className={cn(
                                                    "absolute bottom-0 left-0 right-0 h-1.5 rounded-b-[10px]",
                                                    isActive ? "bg-white/40" : "bg-green-500/20"
                                                )} />
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full opacity-20">
                                    <Search className="h-10 w-10 mb-2" />
                                    <p className="text-[10px] font-black uppercase">No Results</p>
                                </div>
                            )}
                        </div>

                        {/* Pagination Footer */}
                        {totalPages > 1 && (
                            <div className="flex-none p-4 border-t bg-muted/10 flex items-center justify-between">
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                                <div className="text-[10px] font-black font-mono">{currentPage} / {totalPages}</div>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 20px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
                
                /* High-Security Style: Prevent screenshots & data extraction */
                .security-lockdown {
                    user-select: none !important;
                    -webkit-user-drag: none !important;
                    -webkit-touch-callout: none !important;
                }
                .security-lockdown img {
                    pointer-events: none !important;
                }
                @media print {
                    body { display: none !important; }
                }
                
                .focus-blur {
                    filter: blur(20px) !important;
                    transition: filter 0.2s ease;
                }
            ` }} />
        </div>
    );
};

export default OperatorImagePreview;
