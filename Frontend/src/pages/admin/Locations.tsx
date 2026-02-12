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
import { API_BASE_URL } from '@/config';

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
        setProjects(data.map((p: any) => ({
          id: p.project_id,
          name: p.project_name,
          code: p.project_code
        })));
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
        setSources(data.map((s: any) => ({
          id: s.source_id,
          name: s.source_name,
          code: s.source_code,
          projectId: s.project_id
        })));
      }
    } catch (error) { console.error('Fetch sources error:', error); }
  };

  const fetchLocations = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/admin/locations`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        const mapped = data.map((l: any) => {
          const source = sources.find(s => s.id === l.source_id);
          const project = projects.find(p => p.id === l.project_id);
          return {
            id: l.location_id,
            name: l.location_name,
            code: l.location_code,
            sourceId: l.source_id,
            sourceName: source?.name || 'Loading...',
            projectId: l.project_id,
            projectName: project?.name || 'Loading...',
            status: 'active',
            createdBy: l.created_by,
            createdAt: l.created_date
          };
        });
        setLocations(mapped);
      }
    } catch (error) {
      console.error('Fetch locations error:', error);
      toast({ title: 'Error', description: 'Failed to load locations', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      fetchUsers();
      await fetchProjects();
      await fetchSources();
    };
    init();
  }, []);

  useEffect(() => {
    if ((projects.length > 0 && sources.length > 0) || locations.length === 0) {
      fetchLocations();
    }
  }, [projects, sources]);

  const handleCreate = () => {
    setEditingLocation(null);
    setFormData({ name: '', code: '', sourceId: '', projectId: '' });
    setIsDialogOpen(true);
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      code: location.code,
      sourceId: location.sourceId,
      projectId: location.projectId
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.projectId || !formData.sourceId) {
      toast({ title: 'Error', description: 'Please provide Project, Source and Location Name', variant: 'destructive' });
      return;
    }

    try {
      const url = editingLocation
        ? `${API_BASE_URL}/admin/locations/${editingLocation.id}`
        : `${API_BASE_URL}/admin/locations`;

      const method = editingLocation ? 'PUT' : 'POST';
      const body = editingLocation
        ? { location_name: formData.name }
        : {
          project_id: formData.projectId,
          source_id: formData.sourceId,
          location_name: formData.name.trim().toUpperCase(),
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
        toast({ title: `Location ${editingLocation ? 'updated' : 'created'} successfully` });
        fetchLocations();
        setIsDialogOpen(false);
      } else {
        const error = await response.json();
        toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Submit location error:', error);
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

    if (!confirm('Are you sure you want to delete this location?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/admin/locations/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
      });

      if (response.ok) {
        toast({ title: 'Location deleted successfully' });
        fetchLocations();
      } else {
        const error = await response.json();
        toast({ title: 'Error', description: error.detail || 'Failed to delete location', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Delete location error:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
    }
  };

  const filteredSources = formData.projectId
    ? sources.filter(s => s.projectId === formData.projectId)
    : sources;

  const columns = [
    { key: 'projectName', header: 'Project', sortable: true },
    { key: 'sourceName', header: 'Source', sortable: true },
    { key: 'name', header: 'Location Name', sortable: true },
    { key: 'code', header: 'Code', sortable: true },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => <StatusBadge status={value as 'active' | 'inactive'} />
    },
    {
      key: 'createdBy',
      header: 'Created By',
      render: (value: string) => {
        const creator = users.find(u => u.id === value);
        return creator ? creator.name : 'System';
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
        title="Locations"
        description="Manage storage locations"
        action={{ label: 'Add Location', onClick: handleCreate }}
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">Loading locations...</p>
        </div>
      ) : (
        <DataTable
          data={locations}
          columns={columns}
          searchPlaceholder="Search locations..."
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLocation ? 'Edit Location' : 'Create Location'}</DialogTitle>
            <DialogDescription>
              {editingLocation ? 'Update the location details.' : 'Add a new storage location.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project">Project</Label>
              <Select value={formData.projectId} onValueChange={(v) => setFormData({ ...formData, projectId: v, sourceId: '' })}>
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
              <Label htmlFor="source">Source</Label>
              <Select value={formData.sourceId} onValueChange={(v) => setFormData({ ...formData, sourceId: v })}>
                <SelectTrigger disabled={!formData.projectId}>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {filteredSources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Location Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Building A - Floor 1"
              />
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
