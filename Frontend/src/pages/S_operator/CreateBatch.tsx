import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { UploadType } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { FilePlus2, Layers, BookOpen, UserCheck, MapPin, Database, FolderKanban, Loader2, Hash, FileText } from 'lucide-react';
import { API_BASE_URL } from '@/config';

interface Project {
    project_id: string;
    project_name: string;
}

interface Source {
    source_id: string;
    source_name: string;
}

interface Location {
    location_id: string;
    location_name: string;
}

interface RecordOwner {
    record_owner_id: string;
    record_owner_name: string;
}

interface RecordType {
    record_type_id: string;
    record_type_name: string;
}

const CreateBatch: React.FC = () => {
    const navigate = useNavigate();
    const { toast } = useToast();

    const [isSubmitting, setIsSubmitting] = useState(false);

    // Data Options
    const [projects, setProjects] = useState<Project[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [recordOwners, setRecordOwners] = useState<RecordOwner[]>([]);
    const [recordTypes, setRecordTypes] = useState<RecordType[]>([]);

    const [formData, setFormData] = useState({
        uploadType: 'complete' as UploadType,
        projectId: '',
        sourceId: '',
        locationId: '',
        recordOwnerId: '',
        recordTypeId: '',
        bookName: '',
        totalBookImages: '',
        uploadingCount: '',
    });

    const [existingBooks, setExistingBooks] = useState<Array<{ record_name_id: string, record_name: string }>>([]);
    const [isAddingNewBook, setIsAddingNewBook] = useState(false);
    const [selectedExistingBookId, setSelectedExistingBookId] = useState('');

    const [bookUploadSummary, setBookUploadSummary] = useState<{
        total_count: number;
        already_uploaded: number;
        remaining: number;
    } | null>(null);

    // Check if partial upload is enabled from settings
    const [partialUploadEnabled, setPartialUploadEnabled] = useState(() => {
        const saved = localStorage.getItem('partial_upload_enabled');
        return saved === 'true';
    });

    const token = localStorage.getItem('qc_token');
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    // Fetch Projects on Mount
    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/operator/assigned-projects`, { headers });
                const data = await res.json();
                setProjects(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error(err);
            }
        };
        fetchProjects();
    }, []);

    // Fetch Sources when Project changes
    useEffect(() => {
        if (!formData.projectId) {
            setSources([]);
            return;
        }
        const fetchSources = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/operator/assigned-sources/${formData.projectId}`, { headers });
                const data = await res.json();
                setSources(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error(err);
            }
        };
        fetchSources();
    }, [formData.projectId]);

    // Fetch Locations & Record Types when Source changes
    useEffect(() => {
        if (!formData.sourceId) {
            setLocations([]);
            setRecordTypes([]);
            return;
        }
        const fetchLocationsAndTypes = async () => {
            try {
                const resLoc = await fetch(`${API_BASE_URL}/operator/assigned-locations/${formData.sourceId}`, { headers });
                const dataLoc = await resLoc.json();
                setLocations(Array.isArray(dataLoc) ? dataLoc : []);

                const resType = await fetch(`${API_BASE_URL}/operator/record-types/${formData.sourceId}`, { headers });
                const dataType = await resType.json();
                setRecordTypes(Array.isArray(dataType) ? dataType : []);
            } catch (err) {
                console.error(err);
            }
        };
        fetchLocationsAndTypes();
    }, [formData.sourceId]);

    // Fetch Record Owners when Location changes
    useEffect(() => {
        if (!formData.locationId) {
            setRecordOwners([]);
            return;
        }
        const fetchOwners = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/operator/assigned-owners/${formData.locationId}`, { headers });
                const data = await res.json();
                setRecordOwners(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error(err);
            }
        };
        fetchOwners();
    }, [formData.locationId]);


    // Fetch Existing Books when hierarchy changes (for Partial uploads)
    useEffect(() => {
        if (!formData.projectId || formData.uploadType !== 'partial') {
            setExistingBooks([]);
            setIsAddingNewBook(false);
            setSelectedExistingBookId('');
            return;
        }

        // Only fetch if all hierarchy fields are selected
        if (!formData.sourceId || !formData.locationId || !formData.recordOwnerId || !formData.recordTypeId) {
            setExistingBooks([]);
            return;
        }

        const fetchBooks = async () => {
            try {
                // Build query params with all hierarchy selections
                const params = new URLSearchParams({
                    project_id: formData.projectId,
                    source_id: formData.sourceId,
                    location_id: formData.locationId,
                    record_owner_id: formData.recordOwnerId,
                    record_type_id: formData.recordTypeId
                });

                const res = await fetch(`${API_BASE_URL}/operator/existing-books?${params}`, { headers });
                const data = await res.json();
                setExistingBooks(Array.isArray(data) ? data : []);

                // Default to "Add New Book" mode if no existing books
                if (!data || data.length === 0) {
                    setIsAddingNewBook(true);
                } else {
                    setIsAddingNewBook(false);
                }
            } catch (err) {
                console.error(err);
                setExistingBooks([]);
            }
        };
        fetchBooks();
    }, [formData.projectId, formData.sourceId, formData.locationId, formData.recordOwnerId, formData.recordTypeId, formData.uploadType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate
        if (!formData.projectId || !formData.sourceId || !formData.locationId || !formData.recordOwnerId || !formData.recordTypeId || !formData.bookName) {
            toast({ title: 'Error', description: 'Please fill all required hierarchy and book fields', variant: 'destructive' });
            return;
        }

        if (formData.uploadType === 'complete' && (!formData.totalBookImages || parseInt(formData.totalBookImages) <= 0)) {
            toast({ title: 'Error', description: 'Please enter total number of images in the book', variant: 'destructive' });
            return;
        }

        if (formData.uploadType === 'partial' && (!formData.totalBookImages || !formData.uploadingCount)) {
            toast({ title: 'Error', description: 'Please enter total images and uploading count', variant: 'destructive' });
            return;
        }

        // Validate upload count vs total count
        const totalImages = parseInt(formData.totalBookImages) || 0;
        const uploadingCount = formData.uploadType === 'complete'
            ? totalImages
            : parseInt(formData.uploadingCount) || 0;

        if (formData.uploadType === 'complete') {
            if (uploadingCount !== totalImages) {
                toast({
                    title: 'Validation Error',
                    description: 'For complete upload, uploading count must equal total images.',
                    variant: 'destructive'
                });
                return;
            }
        } else {
            // partial or re-upload
            if (uploadingCount >= totalImages) {
                const message = uploadingCount === totalImages
                    ? `For ${formData.uploadType} upload, uploading count must be less than total images. If you want to upload ${uploadingCount} = ${totalImages}, then use the Complete option.`
                    : `For ${formData.uploadType} upload, uploading count (${uploadingCount}) must be less than total images (${totalImages}).`;

                toast({
                    title: 'Validation Error',
                    description: message,
                    variant: 'destructive'
                });
                return;
            }
            if (uploadingCount <= 0) {
                toast({
                    title: 'Validation Error',
                    description: 'Uploading count must be greater than 0.',
                    variant: 'destructive'
                });
                return;
            }
        }

        try {
            setIsSubmitting(true);

            const payload = {
                project_id: formData.projectId,
                source_id: formData.sourceId,
                location_id: formData.locationId,
                record_owner_id: formData.recordOwnerId,
                record_type_id: formData.recordTypeId,
                book_name: formData.bookName,
                upload_type: formData.uploadType,
                total_images: parseInt(formData.totalBookImages) || 0,
                uploading_count: formData.uploadType === 'complete' ? parseInt(formData.totalBookImages) : parseInt(formData.uploadingCount)
            };

            const res = await fetch(`${API_BASE_URL}/operator/batches`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.detail || 'Failed to create batch');
            }

            const result = await res.json();
            toast({
                title: 'Batch Created Successfully',
                description: `Batch ID: ${result.batch_id}. Proceeding to upload.`,
            });

            // Store batch info for upload page
            localStorage.setItem('current_batch_uid', result.batch_uid);
            localStorage.setItem('current_batch_id', result.batch_id);

            navigate('/upload');
        } catch (err: any) {
            toast({ title: 'Creation Failed', description: err.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center p-4 min-w-full">
            <div className="w-full max-w-2xl animate-fade-in space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">Create New Batch</h1>
                    <p className="text-muted-foreground">Follow the hierarchy to generate your unique Batch ID</p>
                </div>

                <Card className="shadow-lg border-2">
                    <CardHeader className="bg-muted/30 border-b">
                        <CardTitle className="flex items-center gap-2">
                            <FilePlus2 className="h-5 w-5 text-primary" />
                            Batch Configuration
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit} className="space-y-6">

                            {/* 1. Upload Type - Only show if partial upload is enabled */}
                            {partialUploadEnabled && (
                                <div className="space-y-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
                                    <Label className="text-sm font-semibold flex items-center gap-2">
                                        <Layers className="h-4 w-4" /> Upload Type *
                                    </Label>
                                    <RadioGroup
                                        value={formData.uploadType}
                                        onValueChange={(v) => setFormData({ ...formData, uploadType: v as UploadType })}
                                        className="flex flex-wrap gap-4"
                                    >
                                        <label className={cn(
                                            "flex flex-1 items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all",
                                            formData.uploadType === 'complete' ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-transparent"
                                        )}>
                                            <RadioGroupItem value="complete" className="sr-only" />
                                            <span className="font-medium">Complete</span>
                                        </label>
                                        <label className={cn(
                                            "flex flex-1 items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all",
                                            formData.uploadType === 'partial' ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-transparent"
                                        )}>
                                            <RadioGroupItem value="partial" className="sr-only" />
                                            <span className="font-medium">Partial</span>
                                        </label>
                                    </RadioGroup>
                                </div>
                            )}

                            {/* Hierarchy Selection */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        <FolderKanban className="h-3 w-3" /> Project
                                    </Label>
                                    <Select
                                        value={formData.projectId}
                                        onValueChange={(v) => setFormData({ ...formData, projectId: v, sourceId: '', locationId: '', recordOwnerId: '' })}
                                    >
                                        <SelectTrigger className="h-11"><SelectValue placeholder="Select Project" /></SelectTrigger>
                                        <SelectContent>
                                            {projects.map((p) => <SelectItem key={p.project_id} value={p.project_id}>{p.project_name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        <Database className="h-3 w-3" /> Source
                                    </Label>
                                    <Select
                                        value={formData.sourceId}
                                        onValueChange={(v) => setFormData({ ...formData, sourceId: v, locationId: '', recordOwnerId: '' })}
                                        disabled={!formData.projectId}
                                    >
                                        <SelectTrigger className="h-11"><SelectValue placeholder="Select Source" /></SelectTrigger>
                                        <SelectContent>
                                            {sources.map((s) => <SelectItem key={s.source_id} value={s.source_id}>{s.source_name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        <MapPin className="h-3 w-3" /> Location
                                    </Label>
                                    <Select
                                        value={formData.locationId}
                                        onValueChange={(v) => setFormData({ ...formData, locationId: v, recordOwnerId: '' })}
                                        disabled={!formData.sourceId}
                                    >
                                        <SelectTrigger className="h-11"><SelectValue placeholder="Select Location" /></SelectTrigger>
                                        <SelectContent>
                                            {locations.map((l) => <SelectItem key={l.location_id} value={l.location_id}>{l.location_name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        <UserCheck className="h-3 w-3" /> Record Owner
                                    </Label>
                                    <Select
                                        value={formData.recordOwnerId}
                                        onValueChange={(v) => setFormData({ ...formData, recordOwnerId: v })}
                                        disabled={!formData.locationId}
                                    >
                                        <SelectTrigger className="h-11"><SelectValue placeholder="Select Owner" /></SelectTrigger>
                                        <SelectContent>
                                            {recordOwners.map((o) => <SelectItem key={o.record_owner_id} value={o.record_owner_id}>{o.record_owner_name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        <FileText className="h-3 w-3" /> Record Type *
                                    </Label>
                                    <Select
                                        value={formData.recordTypeId}
                                        onValueChange={(v) => setFormData({ ...formData, recordTypeId: v })}
                                        disabled={!formData.sourceId}
                                    >
                                        <SelectTrigger className="h-11"><SelectValue placeholder="Select Type" /></SelectTrigger>
                                        <SelectContent>
                                            {recordTypes.map((type) => <SelectItem key={type.record_type_id} value={type.record_type_id}>{type.record_type_name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Book Name & Counts */}
                            <div className="pt-4 border-t">
                                <div className="space-y-2">
                                    <Label>Book Name / Register Name *</Label>

                                    {formData.uploadType === 'partial' && !isAddingNewBook ? (
                                        // Always show dropdown for Partial uploads (when not adding new)
                                        <div className="flex gap-2">
                                            <Select
                                                value={selectedExistingBookId}
                                                onValueChange={async (v) => {
                                                    setSelectedExistingBookId(v);
                                                    const book = existingBooks.find(b => b.record_name_id === v);
                                                    if (book) {
                                                        setFormData({ ...formData, bookName: book.record_name, uploadingCount: '' });

                                                        // Fetch upload summary for this book
                                                        try {
                                                            const res = await fetch(`${API_BASE_URL}/operator/book-upload-summary/${book.record_name_id}`, { headers });
                                                            const summary = await res.json();
                                                            setBookUploadSummary(summary);

                                                            // Auto-fill total count
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                totalBookImages: summary.total_count.toString()
                                                            }));
                                                        } catch (err) {
                                                            console.error('Failed to fetch book summary:', err);
                                                            setBookUploadSummary(null);
                                                        }
                                                    }
                                                }}
                                                disabled={!formData.projectId || !formData.sourceId || !formData.locationId || !formData.recordOwnerId || !formData.recordTypeId}
                                            >
                                                <SelectTrigger className="h-11 flex-1">
                                                    <SelectValue placeholder={
                                                        !formData.projectId || !formData.sourceId || !formData.locationId || !formData.recordOwnerId || !formData.recordTypeId
                                                            ? "Complete hierarchy selection first"
                                                            : existingBooks.length === 0
                                                                ? "No existing books"
                                                                : "Select Existing Book"
                                                    } />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {existingBooks.map((book) => (
                                                        <SelectItem key={book.record_name_id} value={book.record_name_id}>
                                                            {book.record_name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                onClick={() => {
                                                    setIsAddingNewBook(true);
                                                    setSelectedExistingBookId('');
                                                    setFormData({ ...formData, bookName: '' });
                                                }}
                                                className="h-11 w-11 shrink-0"
                                                title="Add New Book"
                                            >
                                                ➕
                                            </Button>
                                        </div>
                                    ) : (
                                        // Show text input for new book or Complete upload
                                        <>
                                            <div className="relative">
                                                <Input
                                                    className="h-11 uppercase pr-16"
                                                    placeholder="e.g. MARRIAGE REGISTER 1945"
                                                    value={formData.bookName}
                                                    maxLength={100}
                                                    onChange={(e) => {
                                                        const value = e.target.value.toUpperCase();
                                                        const sanitized = value.replace(/[^A-Z0-9\s-]/g, '');
                                                        setFormData({ ...formData, bookName: sanitized });
                                                    }}
                                                />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground bg-muted/50 px-2 py-1 rounded border">
                                                    {formData.bookName.length}/100
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground">Only letters, numbers, spaces, and hyphens (-) allowed</p>
                                            {formData.uploadType === 'partial' && isAddingNewBook && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setIsAddingNewBook(false);
                                                        setFormData({ ...formData, bookName: '' });
                                                    }}
                                                    className="text-xs"
                                                >
                                                    ← Back to Book Selection
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Conditional Image Counters */}
                            <div className="p-4 rounded-xl bg-muted/50 border animate-in fade-in slide-in-from-top-2">
                                {formData.uploadType === 'complete' ? (
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <BookOpen className="h-4 w-4 text-primary" /> Total Number of Images in the Book *
                                        </Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            placeholder="e.g. 250"
                                            className="h-11 text-lg font-bold"
                                            value={formData.totalBookImages}
                                            onChange={(e) => setFormData({ ...formData, totalBookImages: e.target.value })}
                                        />
                                    </div>
                                ) : formData.uploadType === 'partial' ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label>Total Images *</Label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    placeholder="Total"
                                                    className="h-11 font-semibold"
                                                    value={formData.totalBookImages}
                                                    onChange={(e) => setFormData({ ...formData, totalBookImages: e.target.value })}
                                                    disabled={!!selectedExistingBookId}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Uploading Count *</Label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    placeholder="Count"
                                                    className="h-11 font-semibold"
                                                    value={formData.uploadingCount}
                                                    onChange={(e) => setFormData({ ...formData, uploadingCount: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {/* Upload Summary Info */}
                                        {bookUploadSummary && selectedExistingBookId && (
                                            <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-blue-600 dark:text-blue-400 text-lg">ℹ️</span>
                                                    <div className="flex-1 text-sm">
                                                        <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">Upload Progress for this Book:</p>
                                                        <ul className="space-y-1 text-blue-800 dark:text-blue-200">
                                                            <li>• Total Pages: <strong>{bookUploadSummary.total_count}</strong></li>
                                                            <li>• Already Uploaded: <strong>{bookUploadSummary.already_uploaded}</strong></li>
                                                            <li>• Remaining: <strong>{bookUploadSummary.remaining}</strong></li>
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Validation Warning */}
                                        {bookUploadSummary && formData.uploadingCount && parseInt(formData.uploadingCount) > bookUploadSummary.remaining && (
                                            <div className="mt-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-red-600 dark:text-red-400 text-lg">⚠️</span>
                                                    <div className="flex-1 text-sm text-red-800 dark:text-red-200">
                                                        <p className="font-semibold mb-1">Upload count exceeds remaining pages!</p>
                                                        <p>You can only upload up to <strong>{bookUploadSummary.remaining} more pages</strong> for this book. Please reduce the uploading count to {bookUploadSummary.remaining} or less.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="py-4 text-center">
                                        <p className="text-sm font-medium text-muted-foreground italic">
                                            Re-upload configuration will be available soon.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-4 pt-4">
                                <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => navigate(-1)}>Cancel</Button>
                                <Button type="submit" size="lg" disabled={isSubmitting} className="flex-[2] shadow-primary/20 shadow-lg">
                                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Batch & Continue'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default CreateBatch;
