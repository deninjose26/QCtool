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
import { Trash2, Loader2, GitBranch } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatError } from '@/lib/utils';

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
    created_date: string;
}

const VendorAllocationPage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const { toast } = useToast();

    const [allocations, setAllocations] = useState<Allocation[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [recordOwners, setRecordOwners] = useState<RecordOwner[]>([]);
    const [vendors, setVendors] = useState<User[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const [formData, setFormData] = useState({
        project_id: '',
        source_id: '',
        location_id: '',
        record_owner_id: '',
        allocated_to_vendor: '',
    });

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const headers = { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` };

            const [allUsers, allProjects, allSources, allLocations, allROs, allAllocations] = await Promise.all([
                fetch('http://localhost:8000/admin/users', { headers }).then(r => r.json()),
                fetch('http://localhost:8000/admin/projects', { headers }).then(r => r.json()),
                fetch('http://localhost:8000/admin/sources', { headers }).then(r => r.json()),
                fetch('http://localhost:8000/admin/locations', { headers }).then(r => r.json()),
                fetch('http://localhost:8000/admin/record-owners', { headers }).then(r => r.json()),
                fetch('http://localhost:8000/upload-sup/allocations', { headers }).then(r => r.json()),
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

    const handleCreate = () => {
        setFormData({
            project_id: '',
            source_id: '',
            location_id: '',
            record_owner_id: '',
            allocated_to_vendor: '',
        });
        setIsDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.project_id || !formData.source_id || !formData.location_id || !formData.record_owner_id || !formData.allocated_to_vendor) {
            toast({ title: 'Error', description: 'Please select all fields', variant: 'destructive' });
            return;
        }

        try {
            const response = await fetch('http://localhost:8000/upload-sup/allocations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
                },
                body: JSON.stringify({
                    ...formData,
                    allocated_by_supervisor: currentUser?.id
                })
            });

            if (response.ok) {
                toast({ title: 'Success', description: 'Combination allocated to vendor successfully' });
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

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to remove this allocation?')) return;
        try {
            const response = await fetch(`http://localhost:8000/upload-sup/allocations/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
            });
            if (response.ok) {
                toast({ title: 'Success', description: 'Allocation removed' });
                fetchData();
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to remove', variant: 'destructive' });
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
            key: 'actions',
            header: 'Actions',
            render: (_: any, item: Allocation) => (
                <Button variant="ghost" size="icon" onClick={() => handleDelete(item.vendor_allocation_id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
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
                <DataTable
                    data={allocations}
                    columns={columns}
                    searchPlaceholder="Search allocations..."
                />
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <GitBranch className="h-5 w-5 text-primary" />
                            New Vendor Allocation
                        </DialogTitle>
                        <DialogDescription>
                            Select a combination of records to assign to a specific vendor.
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
                            Complete Allocation
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default VendorAllocationPage;
