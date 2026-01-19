import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { Source, Project, User } from '@/types';
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

const Sources: React.FC = () => {
    const { user } = useAuth();
    const [sources, setSources] = useState<Source[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingSource, setEditingSource] = useState<Source | null>(null);
    const [formData, setFormData] = useState({ name: '', code: '', projectId: '' });
    const { toast } = useToast();

    const fetchUsers = async () => {
        try {
            const response = await fetch('http://localhost:8000/admin/users', {
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

    const fetchProjects = async () => {
        try {
            const response = await fetch('http://localhost:8000/admin/projects', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                const mappedProjects = data.map((p: any) => ({
                    id: p.project_id,
                    name: p.project_name,
                    code: p.project_code,
                    status: 'active',
                    createdAt: p.created_date
                }));
                setProjects(mappedProjects);
            }
        } catch (error) {
            console.error('Fetch projects error:', error);
        }
    };

    const fetchSources = async () => {
        try {
            setIsLoading(true);
            const response = await fetch('http://localhost:8000/admin/sources', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                const mappedSources = data.map((s: any) => {
                    const project = projects.find(p => p.id === s.project_id);
                    return {
                        id: s.source_id,
                        name: s.source_name,
                        code: s.source_code,
                        projectId: s.project_id,
                        projectName: project?.name || 'Loading...',
                        status: 'active',
                        createdBy: s.created_by,
                        createdAt: s.created_date
                    };
                });
                setSources(mappedSources);
            }
        } catch (error) {
            console.error('Fetch sources error:', error);
            toast({ title: 'Error', description: 'Failed to load sources', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            fetchUsers();
            await fetchProjects();
        };
        init();
    }, []);

    useEffect(() => {
        if (projects.length > 0 || sources.length === 0) {
            fetchSources();
        }
    }, [projects]);

    const handleCreate = () => {
        setEditingSource(null);
        setFormData({ name: '', code: '', projectId: '' });
        setIsDialogOpen(true);
    };

    const handleEdit = (source: Source) => {
        setEditingSource(source);
        setFormData({ name: source.name, code: source.code, projectId: source.projectId });
        setIsDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.projectId) {
            toast({ title: 'Error', description: 'Please provide both Project and Source Name', variant: 'destructive' });
            return;
        }

        try {
            if (editingSource) {
                // Edit still hits admin for now as per instructions (or I could add to upload-sup)
                const response = await fetch(`http://localhost:8000/admin/sources/${editingSource.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
                    },
                    body: JSON.stringify({
                        source_name: formData.name
                    })
                });

                if (response.ok) {
                    toast({ title: 'Source updated successfully' });
                    fetchSources();
                    setIsDialogOpen(false);
                } else {
                    const error = await response.json();
                    toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
                }
            } else {
                // Create hits the new UPLOAD-SUP endpoint
                const response = await fetch('http://localhost:8000/upload-sup/sources', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
                    },
                    body: JSON.stringify({
                        project_id: formData.projectId,
                        source_name: formData.name.trim().toUpperCase(),
                        created_by: user?.id
                    })
                });

                if (response.ok) {
                    toast({ title: 'Source created successfully' });
                    fetchSources();
                    setIsDialogOpen(false);
                } else {
                    const error = await response.json();
                    toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
                }
            }
        } catch (error) {
            console.error('Submit source error:', error);
            toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this source?')) return;
        try {
            const response = await fetch(`http://localhost:8000/admin/sources/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
            });
            if (response.ok) {
                toast({ title: 'Source deleted successfully' });
                fetchSources();
            } else {
                const error = await response.json();
                toast({ title: 'Error', description: error.detail || 'Failed to delete source', variant: 'destructive' });
            }
        } catch (error) {
            console.error('Delete source error:', error);
        }
    };

    const columns = [
        { key: 'code', header: 'Code', sortable: true },
        { key: 'name', header: 'Source Name', sortable: true },
        { key: 'projectName', header: 'Project', sortable: true },
        {
            key: 'status',
            header: 'Status',
            render: (value: string) => <StatusBadge status={value as 'active' | 'inactive'} />
        },
        {
            key: 'createdBy',
            header: 'Created By',
            render: (value: string) => {
                if (!value) return 'System';
                const creator = users.find(u => u.id?.toLowerCase() === value?.toLowerCase());
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
            render: (_: any, item: Source) => (
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
                title="Sources (Upload Supervisor)"
                description="Manage document sources for assigned projects"
                action={{ label: 'Add Source', onClick: handleCreate }}
            />

            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground animate-pulse">Loading sources...</p>
                </div>
            ) : (
                <DataTable
                    data={sources}
                    columns={columns}
                    searchPlaceholder="Search sources..."
                    emptyMessage="No sources found."
                />
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingSource ? 'Edit Source' : 'Create Source'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="project">Project</Label>
                            <Select value={formData.projectId} onValueChange={(v) => setFormData({ ...formData, projectId: v })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select project" />
                                </SelectTrigger>
                                <SelectContent>
                                    {projects.map((project) => (
                                        <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="code">Source Code</Label>
                            <Input
                                id="code"
                                value={editingSource ? formData.code : 'Auto-generated (e.g., S001)'}
                                disabled
                                className="bg-muted"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name">Source Name</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g., Central Library"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit}>{editingSource ? 'Update' : 'Create'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Sources;
