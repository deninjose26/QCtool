import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { User, UserRole } from '@/types';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Edit, Trash2, Loader2, Eye, EyeOff, UserCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatError } from '@/lib/utils';

const Operators: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [operators, setOperators] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOperator, setEditingOperator] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    status: true
  });

  const fetchOperators = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('qc_token');
      const response = await fetch('http://localhost:8000/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const filtered = data.filter((u: any) =>
          u.user_role === 'Scanning_Operator' && u.created_by === currentUser?.id
        );

        setOperators(filtered.map((u: any) => ({
          id: u.user_id,
          name: u.name,
          username: u.username,
          email: u.email,
          role: 'Scanning_Operator' as UserRole,
          createdBy: u.created_by,
          createdAt: u.created_date,
          status: u.is_active
        })));
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load operators', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOperators();
  }, []);

  const handleCreate = () => {
    setEditingOperator(null);
    setFormData({ name: '', username: '', email: '', password: '', status: true });
    setShowPassword(false);
    setIsDialogOpen(true);
  };

  const handleEdit = (operator: User) => {
    setEditingOperator(operator);
    setFormData({
      name: operator.name,
      username: operator.username,
      email: operator.email,
      password: '',
      status: operator.status
    });
    setShowPassword(false);
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || (!editingOperator && !formData.username) || (!editingOperator && !formData.password)) {
      toast({ title: 'Error', description: 'Please fill all required fields', variant: 'destructive' });
      return;
    }

    try {
      const token = localStorage.getItem('qc_token');
      let response;

      if (editingOperator) {
        const updateData: any = {
          name: formData.name,
          email: formData.email,
          is_active: formData.status
        };
        if (formData.password) {
          updateData.password = formData.password;
        }
        response = await fetch(`http://localhost:8000/admin/users/${editingOperator.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(updateData)
        });
      } else {
        response = await fetch('http://localhost:8000/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: formData.name,
            username: formData.username,
            email: formData.email,
            password: formData.password,
            user_role: 'Scanning_Operator',
            created_by: currentUser?.id
          })
        });
      }

      if (response.ok) {
        toast({ title: 'Success', description: `Operator ${editingOperator ? 'updated' : 'created'} successfully` });
        fetchOperators();
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
    if (!confirm('Are you sure you want to delete this operator?')) return;
    try {
      const token = localStorage.getItem('qc_token');
      const response = await fetch(`http://localhost:8000/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        toast({ title: 'Success', description: 'Operator deleted' });
        fetchOperators();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
  };

  const columns = [
    { key: 'name', header: 'Full Name', sortable: true },
    {
      key: 'username',
      header: 'Username',
      sortable: true,
      render: (val: string) => <span className="text-sm text-muted-foreground">{val}</span>
    },
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'createdAt',
      header: 'Joined Date',
      render: (val: string) => new Date(val).toLocaleDateString()
    },
    {
      key: 'status',
      header: 'Status',
      render: (val: boolean) => (
        <StatusBadge status={val ? 'active' : 'inactive'} />
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, item: User) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Operator Management"
        description="Manage your team of scanning operators"
        action={{ label: 'Add Operator', onClick: handleCreate }}
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">Loading operators...</p>
        </div>
      ) : (
        <DataTable
          data={operators}
          columns={columns}
          searchPlaceholder="Search operators..."
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOperator ? 'Edit Operator' : 'Add Operator'}</DialogTitle>
            <DialogDescription>
              {editingOperator ? 'Update operator details.' : 'Register a new scanning operator.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., John Smith"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g., john@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="e.g., jsmith"
                  disabled={!!editingOperator}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingOperator ? "•••••••• (Leave blank to keep same)" : "Password"}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {editingOperator && (
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="space-y-0.5">
                  <Label>Operator Status</Label>
                  <p className="text-xs text-muted-foreground">Active operators can access the system</p>
                </div>
                <Switch
                  checked={formData.status}
                  onCheckedChange={(v) => setFormData({ ...formData, status: v })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editingOperator ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Operators;
