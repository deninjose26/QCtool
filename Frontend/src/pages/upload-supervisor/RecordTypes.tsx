import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import { RecordType, Source, User } from '@/types';
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

const RecordTypes: React.FC = () => {
    const { user } = useAuth();
    const [types, setTypes] = useState<RecordType[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingType, setEditingType] = useState<RecordType | null>(null);
    const [formData, setFormData] = useState({ name: '', code: '', sourceId: '' });
    const { toast } = useToast();

    const fetchUsers = async () => {
        try {
            const response = await fetch('http://localhost:8000/admin/users', { headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` } });
            if (response.ok) {
                const data = await response.json();
                setUsers(data.map((u: any) => ({ id: u.user_id, name: u.name, username: u.username, email: u.email, role: u.user_role })));
            }
        } catch (error) { console.error('Fetch users error:', error); }
    };

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [sourcesRes, typesRes] = await Promise.all([
                fetch('http://localhost:8000/admin/sources', { headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` } }),
                fetch('http://localhost:8000/admin/record-types', { headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` } })
            ]);

            if (sourcesRes.status === 200 && typesRes.status === 200) {
                const [sourcesData, typesData] = await Promise.all([sourcesRes.json(), typesRes.json()]);

                const mappedSources = sourcesData.map((s: any) => ({ id: s.source_id, name: s.source_name }));
                const mappedTypes = typesData.map((t: any) => {
                    const source = mappedSources.find((s: any) => s.id === t.source_id);
                    return {
                        id: t.record_type_id,
                        name: t.record_type_name,
                        code: t.record_type_code,
                        sourceId: t.source_id,
                        sourceName: source?.name || 'Unknown',
                        createdBy: t.created_by,
                        createdAt: t.created_date
                    };
                });

                setSources(mappedSources);
                setTypes(mappedTypes);
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
        setEditingType(null);
        setFormData({ name: '', code: '', sourceId: '' });
        setIsDialogOpen(true);
    };

    const handleEdit = (type: RecordType) => {
        setEditingType(type);
        setFormData({ name: type.name, code: type.code, sourceId: type.sourceId });
        setIsDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.sourceId) {
            toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
            return;
        }

        try {
            if (editingType) {
                const response = await fetch(`http://localhost:8000/admin/record-types/${editingType.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` },
                    body: JSON.stringify({ record_type_name: formData.name })
                });
                if (response.ok) {
                    toast({ title: 'Record Type updated' });
                    fetchData();
                    setIsDialogOpen(false);
                }
            } else {
                const response = await fetch('http://localhost:8000/upload-sup/record-types', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` },
                    body: JSON.stringify({
                        source_id: formData.sourceId,
                        record_type_name: formData.name.trim().toUpperCase(),
                        created_by: user?.id
                    })
                });
                if (response.ok) {
                    toast({ title: 'Record Type created' });
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
            const response = await fetch(`http://localhost:8000/admin/record-types/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
            });
            if (response.ok) { toast({ title: 'Deleted' }); fetchData(); }
        } catch (error) { console.error('Delete error:', error); }
    };

    const columns = [
        { key: 'code', header: 'Code', sortable: true },
        { key: 'name', header: 'Type Name', sortable: true },
        { key: 'sourceName', header: 'Source', sortable: true },
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
            render: (_: any, item: RecordType) => (
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader title="Record Types (Upload Sup)" description="Manage document types" action={{ label: 'Add Type', onClick: handleCreate }} />
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /><p>Loading...</p></div>
            ) : (
                <DataTable data={types} columns={columns} searchPlaceholder="Search types..." />
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editingType ? 'Edit' : 'Create'} Record Type</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2"><Label>Source</Label>
                            <Select value={formData.sourceId} onValueChange={(v) => setFormData({ ...formData, sourceId: v })}>
                                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                                <SelectContent>{sources.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2"><Label>Code</Label><Input value={editingType ? formData.code : 'Auto-generated (e.g., RT001)'} disabled className="bg-muted" /></div>
                        <div className="space-y-2"><Label>Name</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Birth Certificate" /></div>
                    </div>
                    <DialogFooter><Button onClick={handleSubmit}>{editingType ? 'Update' : 'Create'}</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default RecordTypes;
