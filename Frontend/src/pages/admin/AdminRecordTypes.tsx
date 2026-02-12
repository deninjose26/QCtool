import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import { RecordType, Source, Project, User } from '@/types';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Edit, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatError } from '@/lib/utils';
import { API_BASE_URL } from '@/config';

const RecordTypes: React.FC = () => {
    const { user } = useAuth();
    const [recordTypes, setRecordTypes] = useState<RecordType[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingType, setEditingType] = useState<RecordType | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        sourceId: '',
        projectId: ''
    });
    const { toast } = useToast();

    const fetchUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/users`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
            });
            if (response.ok) {
                const data = await response.json();
                setUsers(data.map((u: any) => ({
                    id: u.user_id,
                    name: u.name,
                    username: u.username,
                    email: u.email,
                    role: u.user_role
                })));
            }
        } catch (error) { console.error('Fetch users error:', error); }
    };

    const fetchData = async (endpoint: string, setter: Function) => {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/${endpoint}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
            });
            if (response.ok) {
                const data = await response.json();
                setter(data);
            }
        } catch (error) { console.error(`Fetch ${endpoint} error:`, error); }
    };

    const fetchRecordTypes = async (currentSources: Source[], currentProjects: Project[]) => {
        try {
            setIsLoading(true);
            const response = await fetch(`${API_BASE_URL}/admin/record-types`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
            });
            if (response.ok) {
                const data = await response.json();
                const mapped = data.map((rt: any): RecordType => {
                    const src = currentSources.find(s => s.id === rt.source_id);
                    const prj = currentProjects.find(p => p.id === src?.projectId);
                    return {
                        id: rt.record_type_id,
                        name: rt.record_type_name,
                        code: rt.record_type_code,
                        sourceId: rt.source_id,
                        sourceName: src?.name || 'Unknown Source',
                        projectId: src?.projectId || '',
                        projectName: prj?.name || 'Unknown Project',
                        recordOwnerId: '',
                        recordOwnerName: 'All Owners in Source',
                        locationId: '',
                        locationName: 'All Locations in Source',
                        createdBy: rt.created_by,
                        createdAt: rt.created_date
                    };
                });
                setRecordTypes(mapped);
            }
        } catch (error) {
            console.error('Fetch record types error:', error);
            toast({ title: 'Error', description: 'Failed to load record types', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            let loadedProjects: Project[] = [];
            let loadedSources: Source[] = [];

            await fetchData('projects', (data: any[]) => {
                loadedProjects = data.map(p => ({
                    id: p.project_id,
                    name: p.project_name,
                    code: p.project_code,
                    status: 'active',
                    createdAt: p.created_date
                }));
                setProjects(loadedProjects);
            });

            await fetchData('sources', (data: any[]) => {
                loadedSources = data.map(s => ({
                    id: s.source_id,
                    name: s.source_name,
                    code: s.source_code,
                    projectId: s.project_id,
                    projectName: '',
                    status: 'active'
                }));
                setSources(loadedSources);
            });

            await fetchRecordTypes(loadedSources, loadedProjects);
        };
        fetchUsers();
        init();
    }, []);

    const handleCreate = () => {
        setEditingType(null);
        setFormData({ name: '', code: '', sourceId: '', projectId: '' });
        setIsDialogOpen(true);
    };

    const handleEdit = (type: RecordType) => {
        setEditingType(type);
        setFormData({
            name: type.name,
            code: type.code,
            sourceId: type.sourceId,
            projectId: type.projectId
        });
        setIsDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.sourceId) {
            toast({ title: 'Error', description: 'Please provide both Source and Record Type Name', variant: 'destructive' });
            return;
        }

        try {
            const url = editingType
                ? `${API_BASE_URL}/admin/record-types/${editingType.id}`
                : `${API_BASE_URL}/admin/record-types`;
            const method = editingType ? 'PUT' : 'POST';
            const body = editingType
                ? { record_type_name: formData.name }
                : {
                    source_id: formData.sourceId,
                    record_type_name: formData.name.trim().toUpperCase(),
                    created_by: user?.id
                };

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                toast({ title: `Record Type ${editingType ? 'updated' : 'created'} successfully` });
                fetchRecordTypes(sources, projects);
                setIsDialogOpen(false);
            } else {
                const error = await response.json();
                toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
            }
        } catch (error) {
            console.error('Submit error:', error);
            toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: string) => {
        if (user?.role !== 'SuperAdmin') {
            toast({
                title: 'Permission Denied',
                description: 'Only Admins are permitted to delete records. Please contact Administrator.',
                variant: 'destructive'
            });
            return;
        }

        if (!confirm('Are you sure you want to delete this record type?')) return;
        try {
            const response = await fetch(`${API_BASE_URL}/admin/record-types/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
            });
            if (response.ok) {
                toast({ title: 'Record Type deleted successfully' });
                fetchRecordTypes(sources, projects);
            }
        } catch (error) { console.error('Delete error:', error); }
    };

    const filteredSources = sources.filter(s => s.projectId === formData.projectId);

    const columns = [
        { key: 'projectName', header: 'Project', sortable: true },
        { key: 'sourceName', header: 'Source', sortable: true },
        { key: 'name', header: 'Type Name', sortable: true },
        { key: 'code', header: 'Code', sortable: true },
        {
            key: 'createdBy',
            header: 'Created By',
            render: (value: string) => {
                if (!value) return 'System';
                const creator = users.find(u => u.id.toLowerCase() === value.toLowerCase());
                return creator ? creator.name : 'Admin';
            }
        },
        {
            key: 'createdAt',
            header: 'Created',
            render: (value: string) => value ? new Date(value).toLocaleDateString() : '-'
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (_: any, item: RecordType) => (
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                        <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Record Types"
                description="Manage master definitions for different types of record series"
                action={{ label: 'Add Record Type', onClick: handleCreate }}
            />

            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground animate-pulse">Loading record types...</p>
                </div>
            ) : (
                <DataTable
                    data={recordTypes}
                    columns={columns}
                    searchPlaceholder="Search types..."
                />
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingType ? 'Edit Record Type' : 'Create Record Type'}</DialogTitle>
                        <DialogDescription>
                            Record Types are master definitions common to all locations under a Source.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Project</Label>
                                <Select
                                    value={formData.projectId}
                                    onValueChange={(v) => setFormData({ ...formData, projectId: v, sourceId: '' })}
                                    disabled={!!editingType}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                                    <SelectContent>
                                        {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Source</Label>
                                <Select
                                    value={formData.sourceId}
                                    onValueChange={(v) => setFormData({ ...formData, sourceId: v })}
                                    disabled={!formData.projectId || !!editingType}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                                    <SelectContent>
                                        {filteredSources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Type Name</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g., Bahi"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit}>{editingType ? 'Update' : 'Create'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default RecordTypes;
