import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { mockBatches, mockUploadHistory } from '@/lib/mock-data';
import PageHeader from '@/components/common/PageHeader';

const ScanningOperatorDashboard: React.FC = () => {
    const recentBatches = mockBatches.slice(0, 5);
    const recentUploads = mockUploadHistory.slice(0, 5);

    return (
        <div className="space-y-8 animate-fade-in">
            <PageHeader
                title="Operator Dashboard"
                description="Quickly create and upload new batches"
            />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Link to="/create-batch">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">Create Batch</h3>
                                    <p className="text-sm text-muted-foreground">Start new upload batch</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/upload">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">Upload Images</h3>
                                    <p className="text-sm text-muted-foreground">Upload scanned images</p>
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
                                    <p className="text-sm text-muted-foreground">View your uploads</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">Recent Work</CardTitle>
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
                                        <p className="text-xs text-muted-foreground">{batch.status}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">My Activity</CardTitle>
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

export default ScanningOperatorDashboard;
