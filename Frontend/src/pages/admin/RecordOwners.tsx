import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import { RecordOwner, Location, Source, Project, User } from '@/types';
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

const RecordOwners: React.FC = () => {
  const { user } = useAuth();
  const [recordOwners, setRecordOwners] = useState<RecordOwner[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOwner, setEditingOwner] = useState<RecordOwner | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    locationId: '',
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

  const fetchProjects = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/projects`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data.map((p: any) => ({ id: p.project_id, name: p.project_name })));
      }
    } catch (error) { console.error('Fetch projects error:', error); }
  };

  const fetchSources = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/sources`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSources(data.map((s: any) => ({ id: s.source_id, name: s.source_name, projectId: s.project_id })));
      }
    } catch (error) { console.error('Fetch sources error:', error); }
  };

  const fetchLocations = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/locations`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setLocations(data.map((l: any) => ({ id: l.location_id, name: l.location_name, sourceId: l.source_id })));
      }
    } catch (error) { console.error('Fetch locations error:', error); }
  };

  const fetchRecordOwners = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/admin/record-owners`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        const mapped = data.map((ro: any) => {
          const loc = locations.find(l => l.id === ro.location_id);
          const src = sources.find(s => s.id === ro.source_id);
          const prj = projects.find(p => p.id === ro.project_id);
          return {
            id: ro.record_owner_id,
            name: ro.record_owner_name,
            code: ro.record_owner_code,
            locationId: ro.location_id,
            locationName: loc?.name || 'Loading...',
            sourceId: ro.source_id,
            sourceName: src?.name || 'Loading...',
            projectId: ro.project_id,
            projectName: prj?.name || 'Loading...',
            createdBy: ro.created_by,
            createdAt: ro.created_date
          };
        });
        setRecordOwners(mapped);
      }
    } catch (error) {
      console.error('Fetch record owners error:', error);
      toast({ title: 'Error', description: 'Failed to load record owners', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      fetchUsers();
      await fetchProjects();
      await fetchSources();
      await fetchLocations();
    };
    init();
  }, []);

  useEffect(() => {
    if ((projects.length > 0 && sources.length > 0 && locations.length > 0) || recordOwners.length === 0) {
      fetchRecordOwners();
    }
  }, [projects, sources, locations]);

  const handleCreate = () => {
    setEditingOwner(null);
    setFormData({ name: '', code: '', locationId: '', sourceId: '', projectId: '' });
    setIsDialogOpen(true);
  };

  const handleEdit = (owner: RecordOwner) => {
    setEditingOwner(owner);
    setFormData({
      name: owner.name,
      code: owner.code,
      locationId: owner.locationId,
      sourceId: owner.sourceId,
      projectId: owner.projectId
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.locationId || !formData.sourceId || !formData.projectId) {
      toast({ title: 'Error', description: 'Please provide Project, Source, Location and Record Owner Name', variant: 'destructive' });
      return;
    }

    try {
      const url = editingOwner
        ? `${API_BASE_URL}/admin/record-owners/${editingOwner.id}`
        : `${API_BASE_URL}/admin/record-owners`;
      const method = editingOwner ? 'PUT' : 'POST';
      const body = editingOwner
        ? { record_owner_name: formData.name }
        : {
          project_id: formData.projectId,
          source_id: formData.sourceId,
          location_id: formData.locationId,
          record_owner_name: formData.name.trim().toUpperCase(),
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
        toast({ title: `Record Owner ${editingOwner ? 'updated' : 'created'} successfully` });
        fetchRecordOwners();
        setIsDialogOpen(false);
      } else {
        const error = await response.json();
        toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Submit record owner error:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this record owner?')) return;
    try {
      const response = await fetch(`${API_BASE_URL}/admin/record-owners/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
      });
      if (response.ok) {
        toast({ title: 'Record Owner deleted successfully' });
        fetchRecordOwners();
      } else {
        const error = await response.json();
        toast({ title: 'Error', description: error.detail || 'Failed to delete record owner', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
    }
  };

  const filteredSources = sources.filter(s => s.projectId === formData.projectId);
  const filteredLocations = locations.filter(l => l.sourceId === formData.sourceId);

  const columns = [
    { key: 'projectName', header: 'Project', sortable: true },
    { key: 'sourceName', header: 'Source', sortable: true },
    { key: 'locationName', header: 'Location', sortable: true },
    { key: 'name', header: 'Owner Name', sortable: true },
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
      render: (_: any, item: RecordOwner) => (
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
        title="Record Owners"
        description="Manage record owner entities"
        action={{ label: 'Add Record Owner', onClick: handleCreate }}
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">Loading record owners...</p>
        </div>
      ) : (
        <DataTable
          data={recordOwners}
          columns={columns}
          searchPlaceholder="Search record owners..."
          emptyMessage="No record owners found."
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingOwner ? 'Edit Record Owner' : 'Create Record Owner'}</DialogTitle>
            <DialogDescription>
              {editingOwner ? 'Update the record owner details.' : 'Add a new record owner entity.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={formData.projectId} onValueChange={(v) => setFormData({ ...formData, projectId: v, sourceId: '', locationId: '' })}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={formData.sourceId} onValueChange={(v) => setFormData({ ...formData, sourceId: v, locationId: '' })} disabled={!formData.projectId}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {filteredSources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={formData.locationId} onValueChange={(v) => setFormData({ ...formData, locationId: v })} disabled={!formData.sourceId}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {filteredLocations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Department of Records" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editingOwner ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecordOwners;
