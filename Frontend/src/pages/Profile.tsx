import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { User, Camera, Lock, Mail, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '@/config';
import defaultAvatar from '@/assets/default-avatar.png';

const Profile: React.FC = () => {
    const { user, apiFetch, refreshProfile } = useAuth();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [updatingProfile, setUpdatingProfile] = useState(false);
    const [updatingPassword, setUpdatingPassword] = useState(false);

    // Profile Form
    const { register: registerProfile, handleSubmit: handleProfileSubmit } = useForm({
        defaultValues: {
            name: user?.name || '',
            username: user?.username || '',
            email: user?.email || '',
        }
    });

    // Password Form
    const { register: registerPassword, handleSubmit: handlePasswordSubmit, reset: resetPassword } = useForm();

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const onProfileUpdate = async (data: any) => {
        setUpdatingProfile(true);
        try {
            const res = await apiFetch(`${API_BASE_URL}/auth/profile/update`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                toast({ title: 'Success', description: 'Profile details updated successfully.' });
                await refreshProfile();
            } else {
                const err = await res.json();
                toast({ title: 'Error', description: err.detail || 'Failed to update profile.', variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Network error occurred.', variant: 'destructive' });
        } finally {
            setUpdatingProfile(false);
        }
    };

    const onPasswordChange = async (data: any) => {
        if (data.new_password !== data.confirm_password) {
            toast({ title: 'Error', description: 'New passwords do not match.', variant: 'destructive' });
            return;
        }

        setUpdatingPassword(true);
        try {
            const res = await apiFetch(`${API_BASE_URL}/auth/profile/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                toast({ title: 'Success', description: 'Password changed successfully.' });
                resetPassword();
            } else {
                const err = await res.json();
                toast({ title: 'Error', description: err.detail || 'Failed to change password.', variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Network error occurred.', variant: 'destructive' });
        } finally {
            setUpdatingPassword(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await apiFetch(`${API_BASE_URL}/auth/profile/upload-picture`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                toast({ title: 'Success', description: 'Profile picture updated.' });
                await refreshProfile();
            } else {
                toast({ title: 'Error', description: 'Failed to upload image.', variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Network error occurred.', variant: 'destructive' });
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
            <PageHeader
                title="My Profile"
                description="Manage your account details and security settings"
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Profile Picture Card */}
                <div className="md:col-span-1">
                    <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 bg-white h-full">
                        <CardHeader>
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Profile Picture</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center pt-4 pb-8">
                            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                <Avatar className="h-40 w-40 border-4 border-slate-50 shadow-inner">
                                    <AvatarImage src={user?.avatar || defaultAvatar} className="object-cover" />
                                    <AvatarFallback className="text-4xl font-bold bg-indigo-50 text-indigo-600">
                                        {user ? getInitials(user.name) : 'U'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <Camera className="h-8 w-8 text-white" />
                                </div>
                                {uploading && (
                                    <div className="absolute inset-0 rounded-full bg-white/80 flex items-center justify-center">
                                        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                                    </div>
                                )}
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/png, image/jpeg, image/jpg"
                                onChange={handleFileChange}
                            />
                            <p className="mt-4 text-xs font-medium text-slate-400 text-center">
                                Click to upload new picture<br />
                                (JPG, PNG max 5MB)
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Forms Column */}
                <div className="md:col-span-2 space-y-8">
                    {/* General Information */}
                    <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 bg-white">
                        <CardHeader>
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">General Information</CardTitle>
                            <CardDescription>Update your personal details</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleProfileSubmit(onProfileUpdate)} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name" className="text-xs uppercase font-bold text-slate-500">Full Name</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                            <Input id="name" {...registerProfile('name')} className="pl-9" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="username" className="text-xs uppercase font-bold text-slate-500">Username</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                            <Input id="username" {...registerProfile('username')} className="pl-9" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-xs uppercase font-bold text-slate-500">Email Address</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                        <Input id="email" type="email" {...registerProfile('email')} className="pl-9" />
                                    </div>
                                </div>
                                <div className="pt-2 flex justify-end">
                                    <Button type="submit" disabled={updatingProfile} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                                        {updatingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Changes
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Security */}
                    <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 bg-white">
                        <CardHeader>
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Security</CardTitle>
                            <CardDescription>Change your password</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handlePasswordSubmit(onPasswordChange)} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="current_password" className="text-xs uppercase font-bold text-slate-500">Current Password</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                        <Input id="current_password" type="password" {...registerPassword('current_password', { required: true })} className="pl-9" />
                                    </div>
                                </div>
                                <Separator className="my-2" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="new_password" className="text-xs uppercase font-bold text-slate-500">New Password</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                            <Input id="new_password" type="password" {...registerPassword('new_password', { required: true })} className="pl-9" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirm_password" className="text-xs uppercase font-bold text-slate-500">Confirm Password</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                            <Input id="confirm_password" type="password" {...registerPassword('confirm_password', { required: true })} className="pl-9" />
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-2 flex justify-end">
                                    <Button type="submit" disabled={updatingPassword} variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50 font-bold">
                                        {updatingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Update Password
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default Profile;
