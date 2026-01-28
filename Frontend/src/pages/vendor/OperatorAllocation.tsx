import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { formatError, cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config';
import {
    GitBranch,
    UserCheck,
    Database,
    MapPin,
    Building2,
    FolderKanban,
    Plus,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Loader2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { User } from '@/types';

interface ResourceAllocation {
    vendor_allocation_id: string;
    project_id: string;
    project_name: string;
    source_id: string;
    source_name: string;
    location_id: string;
    location_name: string;
    record_owner_id: string;
    record_owner_name: string;
}

interface OperatorAllocationHistory {
    id: string;
    operator_id: string;
    operator_name: string;
    project_id: string;
    project_name: string;
    source_id: string;
    source_name: string;
    location_id: string;
    location_name: string;
    record_owner_id: string;
    record_owner_name: string;
    is_active: boolean;
}

const OperatorAllocation: React.FC = () => {
    const { user: currentUser, apiFetch } = useAuth();
    const { toast } = useToast();

    const [availableAllocations, setAvailableAllocations] = useState<ResourceAllocation[]>([]);
    const [operatorAllocations, setOperatorAllocations] = useState<OperatorAllocationHistory[]>([]);
    const [operators, setOperators] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [editingAllocation, setEditingAllocation] = useState<OperatorAllocationHistory | null>(null);

    // Form State
    const [selectedSource, setSelectedSource] = useState<string>('');
    const [selectedLocation, setSelectedLocation] = useState<string>('');
    const [selectedOwner, setSelectedOwner] = useState<string>('');
    const [selectedOperator, setSelectedOperator] = useState<string>('');

    const fetchData = async () => {
        try {
            setIsLoading(true);

            // 1. Fetch resources available to this vendor
            const available = await apiFetch(`${API_BASE_URL}/vendor/my-allocations`).then(r => r.json());
            setAvailableAllocations(Array.isArray(available) ? available : []);

            // 2. Fetch history of operator allocations
            const history = await apiFetch(`${API_BASE_URL}/vendor/operator-allocations`).then(r => r.json());
            setOperatorAllocations(Array.isArray(history) ? history.map((h: any) => ({ ...h, id: h.id || h.scanning_operator_allocation_id })) : []);

            // 3. Fetch vendor's operators
            const allUsers = await apiFetch(`${API_BASE_URL}/admin/users`).then(r => r.json());
            setOperators(allUsers.filter((u: any) => u.user_role === 'Scanning_Operator' && u.created_by === currentUser?.id));

        } catch (error) {
            toast({ title: 'Error', description: 'Failed to synchronize data', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filter Logic for Cascading Dropdowns
    const uniqueSources = Array.from(new Set(availableAllocations.map(a => a.source_id)))
        .map(id => availableAllocations.find(a => a.source_id === id));

    const filteredLocations = availableAllocations.filter(a => a.source_id === selectedSource);
    const uniqueLocations = Array.from(new Set(filteredLocations.map(a => a.location_id)))
        .map(id => filteredLocations.find(a => a.location_id === id));

    const filteredOwners = filteredLocations.filter(a => a.location_id === selectedLocation);

    const currentAllocation = availableAllocations.find(a =>
        a.source_id === selectedSource &&
        a.location_id === selectedLocation &&
        a.record_owner_id === selectedOwner
    );

    const handleAllocate = async () => {
        if (!currentAllocation || !selectedOperator) {
            toast({ title: 'Validation Warning', description: 'Please complete the resource selection and pick an operator', variant: 'destructive' });
            return;
        }

        try {
            setIsSubmitting(true);
            const url = editingAllocation
                ? `${API_BASE_URL}/vendor/operator-allocations/${editingAllocation.id}`
                : `${API_BASE_URL}/vendor/operator-allocations`;

            const response = await apiFetch(url, {
                method: editingAllocation ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    vendor_allocation_id: currentAllocation.vendor_allocation_id,
                    operator_id: selectedOperator
                })
            });

            if (response.ok) {
                toast({ title: 'Success', description: `Resource ${editingAllocation ? 'updated' : 'allocated'} to operator successfully` });
                setIsDialogOpen(false);
                fetchData();
                // Clear form
                setSelectedSource('');
                setSelectedLocation('');
                setSelectedOwner('');
                setSelectedOperator('');
                setEditingAllocation(null);
            } else {
                const error = await response.json();
                toast({ title: 'Allocation Failed', description: error.detail || 'Internal server error', variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Communication failed', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (alloc: OperatorAllocationHistory) => {
        setEditingAllocation(alloc);
        setSelectedSource(alloc.source_id);
        setSelectedLocation(alloc.location_id);
        setSelectedOwner(alloc.record_owner_id);
        setSelectedOperator(alloc.operator_id);
        setIsDialogOpen(true);
    };

    const handleToggleStatus = async (alloc: OperatorAllocationHistory) => {
        try {
            const response = await apiFetch(`${API_BASE_URL}/vendor/operator-allocations/${alloc.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ is_active: !alloc.is_active })
            });
            if (response.ok) {
                const updated = await response.json();
                toast({ title: 'Success', description: `Allocation ${updated.is_active ? 'enabled' : 'disabled'}` });

                // Optimistic update
                setOperatorAllocations(prev => prev.map(a =>
                    a.id === alloc.id ? { ...a, is_active: updated.is_active } : a
                ));
            } else {
                toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Toggle failed', variant: 'destructive' });
        }
    };


    const columns = [
        {
            key: 'operator_name',
            header: 'Operator',
            render: (val: string) => <div className="font-semibold text-primary">{val}</div>
        },
        { key: 'project_name', header: 'Project' },
        { key: 'source_name', header: 'Source' },
        { key: 'location_name', header: 'Location' },
        { key: 'record_owner_name', header: 'Record Owner' },
        {
            key: 'is_active',
            header: 'Status',
            render: (val: boolean, item: OperatorAllocationHistory) => (
                <div className="flex items-center gap-2">
                    <Switch
                        checked={val}
                        onCheckedChange={() => handleToggleStatus(item)}
                    />
                    <Badge variant={val ? "default" : "secondary"} className={val ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800"}>
                        {val ? 'Enabled' : 'Disabled'}
                    </Badge>
                </div>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (_: any, item: OperatorAllocationHistory) => (
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(item)}
                        className="h-8 text-[10px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white"
                    >
                        EDIT
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Operator Allocation"
                description="Assign projects and sources to your scanning team"
                action={{ label: 'New Allocation', onClick: () => setIsDialogOpen(true), icon: <Plus className="h-4 w-4" /> }}
            />

            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground animate-pulse">Synchronizing allocations...</p>
                </div>
            ) : (
                <DataTable
                    data={operatorAllocations}
                    columns={columns}
                    searchPlaceholder="Search operator or project..."
                />
            )}

            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingAllocation(null); }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingAllocation ? 'Update Allocation' : 'Create New Allocation'}</DialogTitle>
                        <DialogDescription>
                            {editingAllocation ? 'Modify the operator assignment or resource stack.' : 'Select a resource stack from your available pool and assign it to an operator.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                        {/* Resource Selection */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Database className="h-4 w-4" /> Source</Label>
                                <Select value={selectedSource} onValueChange={(v) => { setSelectedSource(v); setSelectedLocation(''); setSelectedOwner(''); }}>
                                    <SelectTrigger><SelectValue placeholder="Select Source" /></SelectTrigger>
                                    <SelectContent>
                                        {uniqueSources.map(s => <SelectItem key={s?.source_id} value={s?.source_id || ''}>{s?.source_name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Location</Label>
                                <Select value={selectedLocation} onValueChange={(v) => { setSelectedLocation(v); setSelectedOwner(''); }} disabled={!selectedSource}>
                                    <SelectTrigger><SelectValue placeholder="Select Location" /></SelectTrigger>
                                    <SelectContent>
                                        {uniqueLocations.map(l => <SelectItem key={l?.location_id} value={l?.location_id || ''}>{l?.location_name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Record Owner</Label>
                                <Select value={selectedOwner} onValueChange={setSelectedOwner} disabled={!selectedLocation}>
                                    <SelectTrigger><SelectValue placeholder="Select Record Owner" /></SelectTrigger>
                                    <SelectContent>
                                        {filteredOwners.map(o => <SelectItem key={o.record_owner_id} value={o.record_owner_id}>{o.record_owner_name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Preview & Operator */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><UserCheck className="h-4 w-4" /> Assign To Operator</Label>
                                <Select value={selectedOperator} onValueChange={setSelectedOperator}>
                                    <SelectTrigger><SelectValue placeholder="Pick an Operator" /></SelectTrigger>
                                    <SelectContent>
                                        {operators.map(op => <SelectItem key={op.id} value={op.id}>{op.name} (@{op.username})</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="mt-4 p-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center min-h-[140px] text-center bg-muted/20">
                                {currentAllocation ? (
                                    <>
                                        <div className="bg-success/10 p-2 rounded-full mb-2">
                                            <CheckCircle2 className="h-6 w-6 text-success" />
                                        </div>
                                        <p className="text-sm font-bold text-success">Valid Resource Found</p>
                                        <p className="text-[10px] text-muted-foreground mt-1 font-mono">{currentAllocation.vendor_allocation_id}</p>
                                        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                                            <FolderKanban className="h-3 w-3" />
                                            {currentAllocation.project_name}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <AlertCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                        <p className="text-sm font-semibold text-muted-foreground">Waiting for Selection</p>
                                        <p className="text-xs text-muted-foreground px-4">Complete the source, location, and owner stack to identify a valid allocation.</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleAllocate}
                            disabled={!currentAllocation || !selectedOperator || isSubmitting}
                            className="min-w-[120px]"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingAllocation ? 'Update Allocation' : 'Allocate Resource')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default OperatorAllocation;
