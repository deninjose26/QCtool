import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import { Project, Source, Location, RecordOwner, User, UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Trash2, Loader2, GitBranch, Search, Filter, X, Briefcase, Building2, MapPin, Database, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatError, cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { API_BASE_URL } from '@/config';

interface Allocation {
    id: string;
    vendor_allocation_id: string;
    project_id: string;
    project_name: string;
    source_id: string;
    source_name: string;
    location_id: string;
    location_name: string;
    record_owner_id: string;
    record_owner_name: string;
    allocated_to_vendor: string;
    vendor_name: string;
    allocated_by_supervisor: string;
    is_active: boolean;
    created_date: string;
}

const VendorAllocationPage: React.FC = () => {
    const { user: currentUser, apiFetch } = useAuth();
    const { toast } = useToast();

    const [allocations, setAllocations] = useState<Allocation[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [recordOwners, setRecordOwners] = useState<RecordOwner[]>([]);
    const [vendors, setVendors] = useState<User[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingAllocation, setEditingAllocation] = useState<Allocation | null>(null);
    const [formData, setFormData] = useState({
        project_id: '',
        source_id: '',
        location_id: '',
        record_owner_id: '',
        allocated_to_vendor: '',
    });

    // Filter States
    const [filteredAllocations, setFilteredAllocations] = useState<Allocation[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [projectFilter, setProjectFilter] = useState('all');
    const [vendorFilter, setVendorFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [locationFilter, setLocationFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');

    // Derived Filter Options
    const projectOptions = Array.from(new Set(allocations.map(a => a.project_name))).sort();
    const vendorOptions = Array.from(new Set(allocations.map(a => a.vendor_name))).sort();
    const sourceOptions = Array.from(new Set(allocations.map(a => a.source_name))).sort();
    const locationOptions = Array.from(new Set(allocations.map(a => a.location_name))).sort();

    const fetchData = async () => {
        try {
            setIsLoading(true);

            const [allUsers, allProjects, allSources, allLocations, allROs, allAllocations] = await Promise.all([
                apiFetch(`${API_BASE_URL}/admin/users`).then(r => r.json()),
                apiFetch(`${API_BASE_URL}/admin/projects`).then(r => r.json()),
                apiFetch(`${API_BASE_URL}/admin/sources`).then(r => r.json()),
                apiFetch(`${API_BASE_URL}/admin/locations`).then(r => r.json()),
                apiFetch(`${API_BASE_URL}/admin/record-owners`).then(r => r.json()),
                apiFetch(`${API_BASE_URL}/upload-sup/allocations`).then(r => r.json()),
            ]);

            setVendors(allUsers.filter((u: any) => u.user_role === 'Vendor').map((u: any) => ({
                id: u.user_id,
                name: u.name,
                username: u.username,
                email: u.email,
                role: u.user_role as UserRole,
                createdAt: u.created_date
            })));

            setProjects(allProjects.map((p: any) => ({
                id: p.project_id,
                name: p.project_name,
                code: p.project_code,
                status: 'active',
                createdAt: p.created_date
            })));

            setSources(allSources.map((s: any) => ({
                id: s.source_id,
                name: s.source_name,
                code: s.source_code,
                projectId: s.project_id,
                status: 'active'
            })));

            setLocations(allLocations.map((l: any) => ({
                id: l.location_id,
                name: l.location_name,
                code: l.location_code,
                sourceId: l.source_id,
                projectId: l.project_id,
                status: 'active'
            })));

            setRecordOwners(allROs.map((ro: any) => ({
                id: ro.record_owner_id,
                name: ro.record_owner_name,
                code: ro.record_owner_code,
                locationId: ro.location_id,
                sourceId: ro.source_id,
                projectId: ro.project_id
            })));

            // Map vendor_allocation_id to id AND add names for global searching
            const richAllocations = allAllocations.map((a: any) => {
                const project = allProjects.find((p: any) => p.project_id === a.project_id);
                const source = allSources.find((s: any) => s.source_id === a.source_id);
                const location = allLocations.find((l: any) => l.location_id === a.location_id);
                const ro = allROs.find((r: any) => r.record_owner_id === a.record_owner_id);
                const vendor = allUsers.find((u: any) => u.user_id === a.allocated_to_vendor);

                return {
                    ...a,
                    id: a.vendor_allocation_id,
                    project_name: project?.project_name || 'Unknown',
                    source_name: source?.source_name || 'Unknown',
                    location_name: location?.location_name || 'Unknown',
                    record_owner_name: ro?.record_owner_name || 'Unknown',
                    vendor_name: vendor?.name || 'Unknown'
                };
            });

            setAllocations(richAllocations);
        } catch (error) {
            console.error('Fetch error:', error);
            toast({ title: 'Error', description: 'Failed to load allocation data', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Apply filters
    useEffect(() => {
        let result = [...allocations];

        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            result = result.filter(a =>
                a.project_name.toLowerCase().includes(lowSearch) ||
                a.source_name.toLowerCase().includes(lowSearch) ||
                a.location_name.toLowerCase().includes(lowSearch) ||
                a.record_owner_name.toLowerCase().includes(lowSearch) ||
                a.vendor_name.toLowerCase().includes(lowSearch)
            );
        }

        if (projectFilter !== 'all') {
            result = result.filter(a => a.project_name === projectFilter);
        }

        if (vendorFilter !== 'all') {
            result = result.filter(a => a.vendor_name === vendorFilter);
        }

        if (sourceFilter !== 'all') {
            result = result.filter(a => a.source_name === sourceFilter);
        }

        if (locationFilter !== 'all') {
            result = result.filter(a => a.location_name === locationFilter);
        }

        if (statusFilter !== 'all') {
            const isActive = statusFilter === 'enabled';
            result = result.filter(a => a.is_active === isActive);
        }

        setFilteredAllocations(result);
    }, [allocations, searchTerm, projectFilter, vendorFilter, statusFilter, sourceFilter, locationFilter]);

    const resetFilters = () => {
        setSearchTerm('');
        setProjectFilter('all');
        setVendorFilter('all');
        setStatusFilter('all');
        setSourceFilter('all');
        setLocationFilter('all');
    };

    const handleCreate = () => {
        setEditingAllocation(null);
        setFormData({
            project_id: '',
            source_id: '',
            location_id: '',
            record_owner_id: '',
            allocated_to_vendor: '',
        });
        setIsDialogOpen(true);
    };

    const handleEdit = (alloc: Allocation) => {
        setEditingAllocation(alloc);
        setFormData({
            project_id: alloc.project_id,
            source_id: alloc.source_id,
            location_id: alloc.location_id,
            record_owner_id: alloc.record_owner_id,
            allocated_to_vendor: alloc.allocated_to_vendor,
        });
        setIsDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.project_id || !formData.source_id || !formData.location_id || !formData.record_owner_id || !formData.allocated_to_vendor) {
            toast({ title: 'Error', description: 'Please select all fields', variant: 'destructive' });
            return;
        }

        try {
            const url = editingAllocation
                ? `${API_BASE_URL}/upload-sup/allocations/${editingAllocation.vendor_allocation_id}`
                : `${API_BASE_URL}/upload-sup/allocations`;

            const response = await apiFetch(url, {
                method: editingAllocation ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    allocated_by_supervisor: currentUser?.id
                })
            });

            if (response.ok) {
                toast({ title: 'Success', description: `Combination ${editingAllocation ? 'updated' : 'allocated'} successfully` });
                fetchData();
                setIsDialogOpen(false);
            } else {
                const error = await response.json();
                toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Communication failed', variant: 'destructive' });
        }
    };

    const handleToggleStatus = async (alloc: Allocation) => {
        const newValue = !alloc.is_active;
        try {
            const response = await apiFetch(`${API_BASE_URL}/upload-sup/allocations/${alloc.vendor_allocation_id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ is_active: newValue })
            });
            if (response.ok) {
                const updatedAlloc = await response.json();
                toast({
                    title: 'Success',
                    description: `Allocation ${updatedAlloc.is_active ? 'enabled' : 'disabled'} successfully`
                });

                // Update local state with the exact value from server
                setAllocations(prev => prev.map(a =>
                    a.vendor_allocation_id === alloc.vendor_allocation_id
                        ? { ...a, is_active: !!updatedAlloc.is_active }
                        : a
                ));
            } else {
                toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: string) => {
        if (currentUser?.role !== 'SuperAdmin') {
            toast({
                title: 'Permission Denied',
                description: 'Only Admins are permitted to delete records. Please contact Administrator.',
                variant: 'destructive'
            });
            return;
        }

        if (!confirm('Are you sure you want to delete this allocation?')) return;

        try {
            const response = await apiFetch(`${API_BASE_URL}/upload-sup/allocations/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                toast({ title: 'Success', description: 'Allocation deleted successfully' });
                fetchData();
            } else {
                const error = await response.json();
                toast({ title: 'Error', description: error.detail || 'Failed to delete allocation', variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Communication failed', variant: 'destructive' });
        }
    };

    const columns = [
        {
            key: 'project_name',
            header: 'Project',
            sortable: true
        },
        {
            key: 'source_name',
            header: 'Source',
            sortable: true
        },
        {
            key: 'location_name',
            header: 'Location',
            sortable: true
        },
        {
            key: 'record_owner_name',
            header: 'Record Owner',
            sortable: true
        },
        {
            key: 'vendor_name',
            header: 'Vendor',
            sortable: true,
            render: (val: string) => (
                <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-200">
                    {val}
                </Badge>
            )
        },
        {
            key: 'is_active',
            header: 'Status',
            render: (val: any, item: Allocation) => {
                const isActive = Boolean(val);
                return (
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={isActive}
                            onCheckedChange={() => handleToggleStatus(item)}
                        />
                        <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800"}>
                            {isActive ? 'Enabled' : 'Disabled'}
                        </Badge>
                    </div>
                );
            }
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (_: any, item: Allocation) => (
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(item)}
                        className="h-8 text-[10px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white"
                    >
                        EDIT
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.vendor_allocation_id)}
                    >
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Vendor Allocation"
                description="Assign record combinations to scanning vendors"
                action={{ label: 'New Allocation', onClick: handleCreate }}
            />

            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground animate-pulse">Loading allocations...</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="p-4 bg-background border rounded-xl shadow-sm space-y-4">
                        <div className="flex flex-wrap items-end gap-3 pb-2 border-b">
                            <div className="space-y-1.5 flex-[2] min-w-[300px]">
                                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><Search className="h-3 w-3" /> Search</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by project, vendor, source, location..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9 bg-muted/30 border-none h-10 shadow-inner"
                                    />
                                </div>
                            </div>

                            {(searchTerm !== '' || projectFilter !== 'all' || vendorFilter !== 'all' || statusFilter !== 'all' || sourceFilter !== 'all' || locationFilter !== 'all') && (
                                <Button variant="ghost" onClick={resetFilters} className="h-10 text-muted-foreground flex gap-2">
                                    <X className="h-4 w-4" /> RESET
                                </Button>
                            )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><Filter className="h-3 w-3" /> Project</label>
                                <Select value={projectFilter} onValueChange={setProjectFilter}>
                                    <SelectTrigger className="h-10 border-none bg-muted/50 transition-colors"><SelectValue placeholder="All" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Projects</SelectItem>
                                        {projectOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><Database className="h-3 w-3" /> Source</label>
                                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                    <SelectTrigger className="h-10 border-none bg-muted/50 transition-colors"><SelectValue placeholder="All" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Sources</SelectItem>
                                        {sourceOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><MapPin className="h-3 w-3" /> Location</label>
                                <Select value={locationFilter} onValueChange={setLocationFilter}>
                                    <SelectTrigger className="h-10 border-none bg-muted/50 transition-colors"><SelectValue placeholder="All" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Locations</SelectItem>
                                        {locationOptions.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><Briefcase className="h-3 w-3" /> Vendor</label>
                                <Select value={vendorFilter} onValueChange={setVendorFilter}>
                                    <SelectTrigger className="h-10 border-none bg-muted/50 transition-colors"><SelectValue placeholder="All" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Vendors</SelectItem>
                                        {vendorOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><ShieldCheck className="h-3 w-3" /> Status</label>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="h-10 border-none bg-muted/50 transition-colors"><SelectValue placeholder="All" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="enabled">Enabled</SelectItem>
                                        <SelectItem value="disabled">Disabled</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <DataTable
                        data={filteredAllocations}
                        columns={columns}
                        searchable={false}
                        emptyMessage={allocations.length === 0 ? "No allocations found." : "No allocations match your filters."}
                    />
                </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <GitBranch className="h-5 w-5 text-primary" />
                            {editingAllocation ? 'Update Vendor Allocation' : 'New Vendor Allocation'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingAllocation ? 'Modify the record combination for this vendor.' : 'Select a combination of records to assign to a specific vendor.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-6 py-4">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Project</Label>
                                <Select value={formData.project_id} onValueChange={(v) => setFormData({ ...formData, project_id: v })}>
                                    <SelectTrigger><SelectValue placeholder="Select Project" /></SelectTrigger>
                                    <SelectContent>
                                        {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Source</Label>
                                <Select
                                    value={formData.source_id}
                                    onValueChange={(v) => setFormData({ ...formData, source_id: v, location_id: '', record_owner_id: '' })}
                                    disabled={!formData.project_id}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select Source" /></SelectTrigger>
                                    <SelectContent>
                                        {sources.filter(s => s.projectId === formData.project_id).map(s => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Location</Label>
                                <Select
                                    value={formData.location_id}
                                    onValueChange={(v) => setFormData({ ...formData, location_id: v, record_owner_id: '' })}
                                    disabled={!formData.source_id}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select Location" /></SelectTrigger>
                                    <SelectContent>
                                        {locations.filter(l => l.sourceId === formData.source_id).map(l => (
                                            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Record Owner</Label>
                                <Select
                                    value={formData.record_owner_id}
                                    onValueChange={(v) => setFormData({ ...formData, record_owner_id: v })}
                                    disabled={!formData.location_id}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select Record Owner" /></SelectTrigger>
                                    <SelectContent>
                                        {recordOwners.filter(ro => ro.locationId === formData.location_id).map(ro => (
                                            <SelectItem key={ro.id} value={ro.id}>{ro.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="border-t pt-4 mt-6">
                                <div className="space-y-2">
                                    <Label className="text-primary font-bold">Assign to Vendor</Label>
                                    <Select value={formData.allocated_to_vendor} onValueChange={(v) => setFormData({ ...formData, allocated_to_vendor: v })}>
                                        <SelectTrigger className="border-primary/50 ring-primary">
                                            <SelectValue placeholder="Choose Vendor Account" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} className="gap-2">
                            <GitBranch className="h-4 w-4" />
                            {editingAllocation ? 'Update Allocation' : 'Complete Allocation'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default VendorAllocationPage;
