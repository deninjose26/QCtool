import React, { useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import { mockUsers } from '@/lib/mock-data';
import { roleLabels } from '@/lib/role-config';
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
import { Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/config';

const QCUsers: React.FC = () => {
    // QC Supervisor can only see and manage QC Users
    const [users, setUsers] = useState<User[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({ name: '', username: '', email: '', password: '' });
    const { toast } = useToast();
    const { user, apiFetch } = useAuth(); // To get current user ID for created_by


    const fetchUsers = async () => {
        try {
            const res = await apiFetch(`${API_BASE_URL}/qc-sup/qc-users`);
            if (res.ok) {
                const data = await res.json();
                // Map backend response to frontend format
                const mappedUsers = data.map((u: any) => ({
                    ...u,
                    id: u.user_id,
                    role: u.user_role,
                    createdByName: u.created_by_name
                }));
                setUsers(mappedUsers);
            }
        } catch (error) {
            console.error(error);
        }
    };

    React.useEffect(() => {
        fetchUsers();
    }, []);

    const handleCreate = () => {
        setEditingUser(null);
        setFormData({ name: '', username: '', email: '', password: '' });
        setIsDialogOpen(true);
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setFormData({ name: user.name, username: user.username, email: user.email, password: '' });
        setIsDialogOpen(true);
    };

    const handleSubmit = async () => {
        try {
            if (!formData.name || !formData.email || (!editingUser && (!formData.username || !formData.password))) {
                toast({ title: 'Error', description: 'Name, Username, Email are required. Password is required for new users.', variant: 'destructive' });
                return;
            }

            if (editingUser) {
                const payload: any = {
                    name: formData.name,
                    email: formData.email
                };
                if (formData.password) {
                    payload.password = formData.password;
                }

                const res = await apiFetch(`${API_BASE_URL}/qc-sup/qc-users/${editingUser.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || 'Failed to update QC User');
                }

                toast({ title: 'Success', description: 'QC User updated successfully' });
            } else {
                const payload = {
                    name: formData.name,
                    username: formData.username,
                    email: formData.email,
                    password: formData.password,
                    user_role: 'QC_User',
                    created_by: user?.id
                };

                const res = await apiFetch(`${API_BASE_URL}/auth/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || 'Failed to create QC User');
                }

                toast({ title: 'Success', description: 'QC User created successfully' });
            }

            setIsDialogOpen(false);
            fetchUsers();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await apiFetch(`${API_BASE_URL}/qc-sup/qc-users/${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Failed to delete user');

            toast({ title: 'Success', description: 'QC User deleted successfully' });
            fetchUsers();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    };

    const columns = [
        { key: 'name', header: 'Name', sortable: true },
        { key: 'username', header: 'Username', sortable: true },
        { key: 'email', header: 'Email', sortable: true },
        {
            key: 'role',
            header: 'Role',
            render: () => (
                <Badge variant="outline" className="bg-muted text-muted-foreground border-muted">
                    QC User
                </Badge>
            )
        },
        {
            key: 'createdByName',
            header: 'Created By',
            render: (value: string) => <span className="font-medium text-slate-600">{value}</span>
        },
        {
            key: 'created_date',
            header: 'Created On',
            render: (value: string) => value ? new Date(value).toLocaleDateString() : 'N/A'
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
                title="QC User Management"
                description="Manage quality control team members"
                action={{ label: 'Add QC User', onClick: handleCreate }}
            />

            <DataTable
                data={users}
                columns={columns}
                searchPlaceholder="Search QC users..."
            />

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingUser ? 'Edit QC User' : 'Create QC User'}</DialogTitle>
                        <DialogDescription>
                            {editingUser ? 'Update QC user details.' : 'Add a new member to the quality control team.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Full Name</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g., Jane Doe"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                placeholder="e.g., janedoe"
                                disabled={!!editingUser}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="e.g., jane@example.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder={editingUser ? "Leave blank to keep current" : "******"}
                            />
                            {editingUser && <p className="text-xs text-muted-foreground">Leave blank to keep current password. Enter new password to change.</p>}
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

export default QCUsers;
