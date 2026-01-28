import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import { roleLabels } from '@/lib/role-config';
import { User, UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API_BASE_URL } from '@/config';
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
import { Edit, Trash2, Loader2, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatError } from '@/lib/utils';
import { formatToLocalTime } from '@/utils/dateUtils';

const backendRoleMap: Record<string, string> = {
  super_admin: 'SuperAdmin',
  upload_supervisor: 'Upload_Supervisor',
  vendor: 'Vendor',
  scanning_operator: 'Scanning_Operator',
  qc_supervisor: 'QC_Supervisor',
  qc_user: 'QC_User'
};

const Users: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'Upload_Supervisor' as UserRole
  });
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
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
          role: u.user_role as UserRole,
          createdBy: u.created_by,
          createdAt: u.created_date
        })));
      }
    } catch (error) {
      console.error('Fetch users error:', error);
      toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const creatableRoles: UserRole[] = ['SuperAdmin', 'Upload_Supervisor', 'QC_Supervisor', 'Vendor', 'QC_User'];

  const handleCreate = () => {
    setEditingUser(null);
    setFormData({ name: '', email: '', username: '', password: '', role: 'Upload_Supervisor' });
    setShowPassword(false);
    setIsDialogOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      username: user.username,
      password: '', // Password usually changed via separate flow
      role: user.role
    });
    setShowPassword(false);
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || (!editingUser && (!formData.username || !formData.password))) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    try {
      if (editingUser) {
        const response = await fetch(`${API_BASE_URL}/admin/users/${editingUser.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
          },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            user_role: backendRoleMap[formData.role] || formData.role
          })
        });

        if (response.ok) {
          toast({ title: 'User updated successfully' });
          fetchUsers();
          setIsDialogOpen(false);
        } else {
          const error = await response.json();
          toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
        }
      } else {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: formData.name,
            username: formData.username,
            email: formData.email,
            password: formData.password,
            user_role: backendRoleMap[formData.role] || formData.role,
            created_by: currentUser?.id
          })
        });

        if (response.ok) {
          toast({ title: 'User created successfully' });
          fetchUsers();
          setIsDialogOpen(false);
        } else {
          const error = await response.json();
          toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
        }
      }
    } catch (error) {
      console.error('Submit error:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (id === currentUser?.id) {
      toast({ title: 'Error', description: 'You cannot delete your own account', variant: 'destructive' });
      return;
    }
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
      });

      if (response.ok) {
        toast({ title: 'User deleted successfully' });
        fetchUsers();
      } else {
        const error = await response.json();
        toast({ title: 'Error', description: error.detail || 'Failed to delete user', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const getRoleBadgeColor = (role: UserRole): string => {
    const colors: Record<UserRole, string> = {
      SuperAdmin: 'bg-primary/10 text-primary border-primary/20',
      Upload_Supervisor: 'bg-info/10 text-info border-info/20',
      Vendor: 'bg-warning/10 text-warning border-warning/20',
      Scanning_Operator: 'bg-accent/10 text-accent border-accent/20',
      QC_Supervisor: 'bg-success/10 text-success border-success/20',
      QC_User: 'bg-muted text-muted-foreground border-muted',
    };
    return colors[role] || 'bg-muted text-muted-foreground';
  };

  const columns = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'username', header: 'Username', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'role',
      header: 'Role',
      render: (value: UserRole) => (
        <Badge variant="outline" className={getRoleBadgeColor(value)}>
          {roleLabels[value] || value}
        </Badge>
      )
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
      render: (value: string) => formatToLocalTime(value)
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, item: User) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
            <Edit className="h-4 w-4" />
          </Button>
          {item.id !== currentUser?.id && item.role !== 'SuperAdmin' && (
            <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="User Management"
        description="Manage portal users and their roles"
        action={{ label: 'Add User', onClick: handleCreate }}
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">Loading users...</p>
        </div>
      ) : (
        <DataTable
          data={users}
          columns={columns}
          searchPlaceholder="Search users..."
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Create User'}</DialogTitle>
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
                  disabled={!!editingUser}
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
                    placeholder={editingUser ? "Leave blank to keep same" : "••••••••"}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v as UserRole })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {creatableRoles.map((role) => (
                    <SelectItem key={role} value={role}>{roleLabels[role] || role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editingUser ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
