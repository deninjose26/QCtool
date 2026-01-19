import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { mockBatches, mockUploadHistory } from '@/lib/mock-data';
import PageHeader from '@/components/common/PageHeader';

const UploadSupervisorDashboard: React.FC = () => {
    const recentBatches = mockBatches.slice(0, 5);
    const recentUploads = mockUploadHistory.slice(0, 5);

    return (
        <div className="space-y-8 animate-fade-in">
            <PageHeader
                title="Upload Supervisor Dashboard"
                description="Monitor and manage vendor uploads"
            />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Link to="/vendors">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary group">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">Vendor Management</h3>
                                    <p className="text-sm text-muted-foreground">Create and manage vendor accounts</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary group-hover:translate-x-1 transition-transform" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/vendor-allocation">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary group">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">Vendor Allocations</h3>
                                    <p className="text-sm text-muted-foreground">Assign record stacks to vendors</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary group-hover:translate-x-1 transition-transform" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/sources">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary group">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">Sources</h3>
                                    <p className="text-sm text-muted-foreground">Configure primary data sources</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary group-hover:translate-x-1 transition-transform" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/locations">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary group">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">Locations</h3>
                                    <p className="text-sm text-muted-foreground">Manage storage and scan locations</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary group-hover:translate-x-1 transition-transform" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/record-owners">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary group">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">Record Management</h3>
                                    <p className="text-sm text-muted-foreground">Setup owners and record types</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary group-hover:translate-x-1 transition-transform" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/upload-history">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary group">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">Upload History</h3>
                                    <p className="text-sm text-muted-foreground">Monitor vendor scanning progress</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary group-hover:translate-x-1 transition-transform" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
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
                                <div key={batch.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                    <div className="space-y-1">
                                        <p className="font-medium">{batch.batchCode}</p>
                                        <p className="text-sm text-muted-foreground">{batch.vendorName}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-muted-foreground">{batch.uploadedCount} images</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentUploads.map((upload) => (
                                <div key={upload.id} className="flex gap-3">
                                    <div className="p-2 h-fit rounded-full bg-primary/10">
                                        <Clock className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">{upload.batchCode} uploaded</p>
                                        <p className="text-xs text-muted-foreground">{upload.uploadedBy}</p>
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

export default UploadSupervisorDashboard;
