import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { mockBatches, mockUploadHistory } from '@/lib/mock-data';
import PageHeader from '@/components/common/PageHeader';

const VendorDashboard: React.FC = () => {
    const recentBatches = mockBatches.slice(0, 5);
    const recentUploads = mockUploadHistory.slice(0, 5);

    return (
        <div className="space-y-8 animate-fade-in">
            <PageHeader
                title="Vendor Dashboard"
                description="Manage your operations and operators"
            />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Link to="/operators">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary group">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">Manage Operators</h3>
                                    <p className="text-sm text-muted-foreground">Configure scanning operators</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary group-hover:translate-x-1 transition-transform" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/image-preview">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary group">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">Image Preview</h3>
                                    <p className="text-sm text-muted-foreground">Review uploaded images</p>
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
                                    <p className="text-sm text-muted-foreground">View batch history</p>
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
                        <CardTitle className="text-lg">My Batches</CardTitle>
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
                                        <p className="text-sm text-muted-foreground">{batch.recordTypeName}</p>
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
                        <CardTitle className="text-lg">Recent Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">Your recent upload activity tracking.</p>
                        <div className="space-y-4">
                            {recentUploads.map((upload) => (
                                <div key={upload.id} className="flex gap-3">
                                    <div className="p-2 h-fit rounded-full bg-primary/10">
                                        <Clock className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">{upload.batchCode} processed</p>
                                        <p className="text-xs text-muted-foreground">{upload.imageCount} images</p>
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

export default VendorDashboard;
