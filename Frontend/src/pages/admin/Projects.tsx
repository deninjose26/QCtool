import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { Project, User } from '@/types';
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
import { useAuth } from '@/contexts/AuthContext';
import { Edit, Trash2, Loader2, Info } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from '@/hooks/use-toast';
import { formatError } from '@/lib/utils';
import { API_BASE_URL } from '@/config';

const Projects: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({ name: '', code: '', description: '' });
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
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/admin/projects`, {
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
          description: p.description,
          status: 'active',
          createdBy: p.created_by,
          createdAt: p.created_date
        }));
        setProjects(mappedProjects);
      }
    } catch (error) {
      console.error('Fetch projects error:', error);
      toast({ title: 'Error', description: 'Failed to load projects', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchProjects();
  }, []);

  const handleCreate = () => {
    setEditingProject(null);
    setFormData({ name: '', code: '', description: '' });
    setIsDialogOpen(true);
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({ name: project.name, code: project.code, description: project.description || '' });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast({ title: 'Error', description: 'Please provide a project name', variant: 'destructive' });
      return;
    }

    try {
      if (editingProject) {
        const response = await fetch(`${API_BASE_URL}/admin/projects/${editingProject.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
          },
          body: JSON.stringify({
            project_name: formData.name,
            description: formData.description
          })
        });

        if (response.ok) {
          toast({ title: 'Project updated successfully' });
          fetchProjects();
          setIsDialogOpen(false);
        } else {
          const error = await response.json();
          toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
        }
      } else {
        const response = await fetch(`${API_BASE_URL}/admin/projects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
          },
          body: JSON.stringify({
            project_name: formData.name.trim().toUpperCase(),
            description: formData.description,
            created_by: user?.id
          })
        });

        if (response.ok) {
          toast({ title: 'Project created successfully' });
          fetchProjects();
          setIsDialogOpen(false);
        } else {
          const error = await response.json();
          toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
        }
      }
    } catch (error) {
      console.error('Submit project error:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/admin/projects/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
        }
      });

      if (response.ok) {
        toast({ title: 'Project deleted successfully' });
        fetchProjects();
      } else {
        const error = await response.json();
        toast({ title: 'Error', description: error.detail || 'Failed to delete project', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Delete project error:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
    }
  };

  const columns = [
    { key: 'name', header: 'Project Name', sortable: true },
    {
      key: 'description',
      header: 'Description',
      className: 'max-w-[300px]',
      render: (value: string) => {
        if (!value) return '-';
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="truncate cursor-help text-slate-500 italic max-w-[280px]">
                  {value}
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[400px] break-words bg-slate-900 text-white border-none shadow-xl">
                <p className="text-xs leading-relaxed">{value}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
    },
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
        if (!value) return 'System';
        const creator = users.find(u => u.id.toLowerCase() === value.toLowerCase());
        return creator ? creator.name : 'Admin';
      }
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (value: string) => new Date(value).toLocaleDateString()
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, item: Project) => (
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
  ].filter(col => {
    if (col.key === 'actions' && user?.role !== 'SuperAdmin') return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Projects"
        description={user?.role === 'SuperAdmin' ? "Manage digitization projects" : "View digitization projects"}
        action={user?.role === 'SuperAdmin' ? { label: 'Add Project', onClick: handleCreate } : undefined}
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">Loading projects...</p>
        </div>
      ) : (
        <DataTable
          data={projects}
          columns={columns}
          searchPlaceholder="Search projects..."
          emptyMessage="No projects found. Create your first project to get started!"
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Edit Project' : 'Create Project'}</DialogTitle>
            <DialogDescription>
              {editingProject ? 'Update the project details.' : 'Add a new digitization project.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., National Archives Digitization"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detailed description of the project mission, scope, and objectives..."
                className="min-h-[100px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editingProject ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Projects;
