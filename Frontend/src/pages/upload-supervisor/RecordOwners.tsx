import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import { RecordOwner, Location, Source, Project, User } from '@/types';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
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

const RecordOwners: React.FC = () => {
    const { user } = useAuth();
    const [owners, setOwners] = useState<RecordOwner[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingOwner, setEditingOwner] = useState<RecordOwner | null>(null);
    const [formData, setFormData] = useState({ name: '', code: '', locationId: '', sourceId: '', projectId: '' });
    const { toast } = useToast();

    const fetchUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/users`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` } });
            if (response.ok) {
                const data = await response.json();
                setUsers(data.map((u: any) => ({ id: u.user_id, name: u.name, username: u.username, email: u.email, role: u.user_role })));
            }
        } catch (error) { console.error('Fetch users error:', error); }
    };

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [projectsRes, sourcesRes, locationsRes, ownersRes] = await Promise.all([
                fetch(`${API_BASE_URL}/admin/projects`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` } }),
                fetch(`${API_BASE_URL}/admin/sources`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` } }),
                fetch(`${API_BASE_URL}/admin/locations`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` } }),
                fetch(`${API_BASE_URL}/admin/record-owners`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` } })
            ]);

            if (projectsRes.status === 200 && sourcesRes.status === 200 && locationsRes.status === 200 && ownersRes.status === 200) {
                const [projectsData, sourcesData, locationsData, ownersData] = await Promise.all([
                    projectsRes.json(), sourcesRes.json(), locationsRes.json(), ownersRes.json()
                ]);

                const mappedProjects = projectsData.map((p: any) => ({ id: p.project_id, name: p.project_name }));
                const mappedSources = sourcesData.map((s: any) => ({ id: s.source_id, name: s.source_name, projectId: s.project_id }));
                const mappedLocations = locationsData.map((l: any) => ({ id: l.location_id, name: l.location_name, sourceId: l.source_id, projectId: l.project_id }));

                const mappedOwners = ownersData.map((o: any) => {
                    const project = mappedProjects.find((p: any) => p.id === o.project_id);
                    const source = mappedSources.find((s: any) => s.id === o.source_id);
                    const location = mappedLocations.find((l: any) => l.id === o.location_id);
                    return {
                        id: o.record_owner_id,
                        name: o.record_owner_name,
                        code: o.record_owner_code,
                        locationId: o.location_id,
                        sourceId: o.source_id,
                        projectId: o.project_id,
                        projectName: project?.name || 'Unknown',
                        sourceName: source?.name || 'Unknown',
                        locationName: location?.name || 'Unknown',
                        createdBy: o.created_by,
                        createdAt: o.created_date
                    };
                });

                setProjects(mappedProjects);
                setSources(mappedSources);
                setLocations(mappedLocations);
                setOwners(mappedOwners);
            }
        } catch (error) {
            console.error('Fetch data error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchData();
    }, []);

    const handleCreate = () => {
        setEditingOwner(null);
        setFormData({ name: '', code: '', locationId: '', sourceId: '', projectId: '' });
        setIsDialogOpen(true);
    };

    const handleEdit = (owner: RecordOwner) => {
        setEditingOwner(owner);
        setFormData({ name: owner.name, code: owner.code, locationId: owner.locationId, sourceId: owner.sourceId, projectId: owner.projectId });
        setIsDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.locationId || !formData.sourceId || !formData.projectId) {
            toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
            return;
        }

        try {
            if (editingOwner) {
                const response = await fetch(`${API_BASE_URL}/admin/record-owners/${editingOwner.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` },
                    body: JSON.stringify({ record_owner_name: formData.name })
                });
                if (response.ok) {
                    toast({ title: 'Record Owner updated' });
                    fetchData();
                    setIsDialogOpen(false);
                }
            } else {
                const response = await fetch(`${API_BASE_URL}/upload-sup/record-owners`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` },
                    body: JSON.stringify({
                        project_id: formData.projectId,
                        source_id: formData.sourceId,
                        location_id: formData.locationId,
                        record_owner_name: formData.name.trim().toUpperCase(),
                        created_by: user?.id
                    })
                });
                if (response.ok) {
                    toast({ title: 'Record Owner created' });
                    fetchData();
                    setIsDialogOpen(false);
                } else {
                    const error = await response.json();
                    toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
                }
            }
        } catch (error) { console.error('Submit error:', error); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        try {
            const response = await fetch(`${API_BASE_URL}/admin/record-owners/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
            });
            if (response.ok) { toast({ title: 'Deleted' }); fetchData(); }
        } catch (error) { console.error('Delete error:', error); }
    };

    const columns = [
        { key: 'projectName', header: 'Project', sortable: true },
        { key: 'sourceName', header: 'Source', sortable: true },
        { key: 'locationName', header: 'Location', sortable: true },
        { key: 'name', header: 'Owner Name', sortable: true },
        { key: 'code', header: 'Code', sortable: true },
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
            render: (v: string) => v ? new Date(v).toLocaleDateString() : '-'
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (_: any, item: RecordOwner) => (
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader title="Record Owners (Upload Sup)" description="Manage document record owners" action={{ label: 'Add Owner', onClick: handleCreate }} />
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /><p>Loading...</p></div>
            ) : (
                <DataTable data={owners} columns={columns} searchPlaceholder="Search owners..." />
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editingOwner ? 'Edit' : 'Create'} Record Owner</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2"><Label>Project</Label>
                            <Select value={formData.projectId} onValueChange={(v) => setFormData({ ...formData, projectId: v })}>
                                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                                <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2"><Label>Source</Label>
                            <Select value={formData.sourceId} onValueChange={(v) => setFormData({ ...formData, sourceId: v })}>
                                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                                <SelectContent>{sources.filter(s => s.projectId === formData.projectId).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2"><Label>Location</Label>
                            <Select value={formData.locationId} onValueChange={(v) => setFormData({ ...formData, locationId: v })}>
                                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                                <SelectContent>{locations.filter(l => l.sourceId === formData.sourceId).map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2"><Label>Code</Label><Input value={editingOwner ? formData.code : 'Auto-generated (e.g., R0001)'} disabled className="bg-muted" /></div>
                        <div className="space-y-2"><Label>Name</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Department of Treasury" /></div>
                    </div>
                    <DialogFooter><Button onClick={handleSubmit}>{editingOwner ? 'Update' : 'Create'}</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default RecordOwners;
