import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { Location, Source, Project, User } from '@/types';
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

const Locations: React.FC = () => {
    const { user } = useAuth();
    const [locations, setLocations] = useState<Location[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState<Location | null>(null);
    const [formData, setFormData] = useState({ name: '', code: '', sourceId: '', projectId: '' });
    const { toast } = useToast();

    const fetchUsers = async () => {
        try {
            const response = await fetch('http://localhost:8000/admin/users', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
            });
            if (response.ok) {
                const data = await response.json();
                setUsers(data.map((u: any) => ({ id: u.user_id, name: u.name, username: u.username, email: u.email, role: u.user_role })));
            }
        } catch (error) { console.error('Fetch users error:', error); }
    };

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [projectsRes, sourcesRes, locationsRes] = await Promise.all([
                fetch('http://localhost:8000/admin/projects', { headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` } }),
                fetch('http://localhost:8000/admin/sources', { headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` } }),
                fetch('http://localhost:8000/admin/locations', { headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` } })
            ]);

            if (projectsRes.ok && sourcesRes.ok && locationsRes.ok) {
                const [projectsData, sourcesData, locationsData] = await Promise.all([
                    projectsRes.json(),
                    sourcesRes.json(),
                    locationsRes.json()
                ]);

                const mappedProjects = projectsData.map((p: any) => ({ id: p.project_id, name: p.project_name }));
                const mappedSources = sourcesData.map((s: any) => ({ id: s.source_id, name: s.source_name, projectId: s.project_id }));
                const mappedLocations = locationsData.map((l: any) => {
                    const project = mappedProjects.find((p: any) => p.id === l.project_id);
                    const source = mappedSources.find((s: any) => s.id === l.source_id);
                    return {
                        id: l.location_id,
                        name: l.location_name,
                        code: l.location_code,
                        projectId: l.project_id,
                        sourceId: l.source_id,
                        projectName: project?.name || 'Unknown',
                        sourceName: source?.name || 'Unknown',
                        status: 'active',
                        createdBy: l.created_by,
                        createdAt: l.created_date
                    };
                });

                setProjects(mappedProjects);
                setSources(mappedSources);
                setLocations(mappedLocations);
            }
        } catch (error) {
            console.error('Fetch locations error:', error);
            toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchData();
    }, []);

    const handleCreate = () => {
        setEditingLocation(null);
        setFormData({ name: '', code: '', sourceId: '', projectId: '' });
        setIsDialogOpen(true);
    };

    const handleEdit = (location: Location) => {
        setEditingLocation(location);
        setFormData({ name: location.name, code: location.code, sourceId: location.sourceId, projectId: location.projectId });
        setIsDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.projectId || !formData.sourceId) {
            toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
            return;
        }

        try {
            if (editingLocation) {
                const response = await fetch(`http://localhost:8000/admin/locations/${editingLocation.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
                    },
                    body: JSON.stringify({ location_name: formData.name })
                });
                if (response.ok) {
                    toast({ title: 'Location updated successfully' });
                    fetchData();
                    setIsDialogOpen(false);
                }
            } else {
                const response = await fetch('http://localhost:8000/upload-sup/locations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
                    },
                    body: JSON.stringify({
                        project_id: formData.projectId,
                        source_id: formData.sourceId,
                        location_name: formData.name.trim().toUpperCase(),
                        created_by: user?.id
                    })
                });
                if (response.ok) {
                    toast({ title: 'Location created successfully' });
                    fetchData();
                    setIsDialogOpen(false);
                } else {
                    const error = await response.json();
                    toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
                }
            }
        } catch (error) {
            console.error('Submit location error:', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this location?')) return;
        try {
            const response = await fetch(`http://localhost:8000/admin/locations/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
            });
            if (response.ok) {
                toast({ title: 'Location deleted successfully' });
                fetchData();
            }
        } catch (error) { console.error('Delete error:', error); }
    };

    const columns = [
        { key: 'code', header: 'Code', sortable: true },
        { key: 'name', header: 'Location Name', sortable: true },
        { key: 'sourceName', header: 'Source', sortable: true },
        { key: 'projectName', header: 'Project', sortable: true },
        {
            key: 'createdBy',
            header: 'Created By',
            render: (v: string) => {
                if (!v) return 'System';
                const creator = users.find(u => u.id?.toLowerCase() === v?.toLowerCase());
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
            render: (_: any, item: Location) => (
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader title="Locations (Upload Sup)" description="Manage scan locations" action={{ label: 'Add Location', onClick: handleCreate }} />
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 space-y-4"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-muted-foreground animate-pulse">Loading locations...</p></div>
            ) : (
                <DataTable data={locations} columns={columns} searchPlaceholder="Search locations..." />
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editingLocation ? 'Edit Location' : 'Create Location'}</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Project</Label>
                            <Select value={formData.projectId} onValueChange={(v) => setFormData({ ...formData, projectId: v })}>
                                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                                <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Source</Label>
                            <Select value={formData.sourceId} onValueChange={(v) => setFormData({ ...formData, sourceId: v })}>
                                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                                <SelectContent>{sources.filter(s => s.projectId === formData.projectId).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Code</Label>
                            <Input value={editingLocation ? formData.code : 'Auto-generated (e.g., L001)'} disabled className="bg-muted" />
                        </div>
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Room 101" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit}>{editingLocation ? 'Update' : 'Create'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Locations;
