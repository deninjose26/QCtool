import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
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
import { Edit, Trash2, Loader2, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatError } from '@/lib/utils';
import { API_BASE_URL } from '@/config';

const VendorManagement: React.FC = () => {
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
  });
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const fetchVendors = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/admin/users`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        // Filter to only show users with the 'vendor' role
        const vendorUsers = data
          .filter((u: any) => u.user_role === 'Vendor')
          .map((u: any) => ({
            id: u.user_id,
            name: u.name,
            username: u.username,
            email: u.email,
            role: 'vendor' as UserRole,
            createdBy: u.created_by,
            createdAt: u.created_date
          }));
        setUsers(vendorUsers);
      }
    } catch (error) {
      console.error('Fetch vendors error:', error);
      toast({ title: 'Error', description: 'Failed to load vendors', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleCreate = () => {
    setEditingUser(null);
    setFormData({ name: '', email: '', username: '', password: '' });
    setShowPassword(false);
    setIsDialogOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      username: user.username,
      password: '',
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
            user_role: 'Vendor'
          })
        });

        if (response.ok) {
          toast({ title: 'Vendor updated successfully' });
          fetchVendors();
          setIsDialogOpen(false);
        } else {
          const error = await response.json();
          toast({ title: 'Error', description: formatError(error.detail), variant: 'destructive' });
        }
      } else {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('qc_token')}`
          },
          body: JSON.stringify({
            name: formData.name,
            username: formData.username,
            email: formData.email,
            password: formData.password,
            user_role: 'Vendor',
            created_by: currentUser?.id
          })
        });

        if (response.ok) {
          toast({ title: 'Vendor created successfully' });
          fetchVendors();
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
    if (!confirm('Are you sure you want to delete this vendor?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('qc_token')}` }
      });

      if (response.ok) {
        toast({ title: 'Vendor deleted successfully' });
        fetchVendors();
      } else {
        const error = await response.json();
        toast({ title: 'Error', description: error.detail || 'Failed to delete vendor', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const columns = [
    { key: 'name', header: 'Vendor Name', sortable: true },
    { key: 'username', header: 'Username', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'createdAt',
      header: 'Created',
      render: (value: string) => new Date(value).toLocaleDateString()
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, item: User) => (
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
        title="Vendor Management"
        description="Create and manage scanning vendor accounts"
        action={{ label: 'Add Vendor User', onClick: handleCreate }}
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">Loading vendors...</p>
        </div>
      ) : (
        <DataTable
          data={users}
          columns={columns}
          searchPlaceholder="Search vendors..."
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit Vendor' : 'Create Vendor User'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Update vendor credentials and profile.' : 'Directly register a new vendor account.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Vendor Full Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., DigiScan Solutions"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g., admin@digiscan.com"
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
                  placeholder="e.g., digiscan_admin"
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
              <Label htmlFor="role">Role (Fixed)</Label>
              <Input
                id="role"
                value="Vendor"
                disabled
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
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

export default VendorManagement;
