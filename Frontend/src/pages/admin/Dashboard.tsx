import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { mockBatches, mockUploadHistory } from '@/lib/mock-data';
import PageHeader from '@/components/common/PageHeader';

const SuperAdminDashboard: React.FC = () => {
    const recentBatches = mockBatches.slice(0, 5);
    const recentUploads = mockUploadHistory.slice(0, 5);

    return (
        <div className="space-y-8 animate-fade-in">
            <PageHeader
                title="Super Admin Dashboard"
                description="Overview of your activities and key metrics"
            />

            {/* Quick Actions Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Link to="/projects">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">Manage Projects</h3>
                                    <p className="text-sm text-muted-foreground">Create and manage projects</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/sources">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">Manage Sources</h3>
                                    <p className="text-sm text-muted-foreground">Configure data sources</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/locations">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">Manage Locations</h3>
                                    <p className="text-sm text-muted-foreground">Set up storage locations</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/record-owners">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">Record Owners</h3>
                                    <p className="text-sm text-muted-foreground">Manage record ownership</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/users">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">User Management</h3>
                                    <p className="text-sm text-muted-foreground">Manage system users</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/upload-history">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">Upload History</h3>
                                    <p className="text-sm text-muted-foreground">View all uploads</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Recent Batches */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">Recent Batches</CardTitle>
                        <Link to="/upload-history">
                            <Button variant="ghost" size="sm" className="gap-1">
                                View All <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentBatches.map((batch) => (
                                <div
                                    key={batch.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                >
                                    <div className="space-y-1">
                                        <p className="font-medium">{batch.batchCode}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {batch.sourceName} • {batch.recordTypeName}
                                        </p>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <p className="text-xs text-muted-foreground">
                                            {batch.uploadedCount}/{batch.uploadCount} images
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentUploads.map((upload, i) => (
                                <div key={upload.id} className="flex gap-3">
                                    <div className="flex flex-col items-center">
                                        <div className="p-2 rounded-full bg-primary/10">
                                            <Clock className="h-4 w-4 text-primary" />
                                        </div>
                                        {i < recentUploads.length - 1 && (
                                            <div className="w-px h-full bg-border my-1" />
                                        )}
                                    </div>
                                    <div className="flex-1 pb-4">
                                        <p className="font-medium text-sm">{upload.batchCode} uploaded</p>
                                        <p className="text-xs text-muted-foreground">
                                            {upload.imageCount} images by {upload.uploadedBy}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {new Date(upload.uploadedAt).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default SuperAdminDashboard;
