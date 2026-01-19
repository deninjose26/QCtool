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

const QCUsers: React.FC = () => {
    // QC Supervisor can only see and manage QC Users
    const [users, setUsers] = useState<User[]>(mockUsers.filter(u => u.role === 'qc_user'));
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({ name: '', email: '' });
    const { toast } = useToast();

    const handleCreate = () => {
        setEditingUser(null);
        setFormData({ name: '', email: '' });
        setIsDialogOpen(true);
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setFormData({ name: user.name, email: user.email });
        setIsDialogOpen(true);
    };

    const handleSubmit = () => {
        if (editingUser) {
            setUsers(users.map(u =>
                u.id === editingUser.id
                    ? { ...u, name: formData.name, email: formData.email }
                    : u
            ));
            toast({ title: 'QC User updated successfully' });
        } else {
            const newUser: User = {
                id: String(Date.now()),
                name: formData.name,
                email: formData.email,
                role: 'qc_user',
                createdAt: new Date().toISOString(),
            };
            setUsers([...users, newUser]);
            toast({ title: 'QC User created successfully' });
        }
        setIsDialogOpen(false);
    };

    const handleDelete = (id: string) => {
        setUsers(users.filter(u => u.id !== id));
        toast({ title: 'QC User deleted successfully' });
    };

    const columns = [
        { key: 'name', header: 'Name', sortable: true },
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
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="e.g., jane@example.com"
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

export default QCUsers;
