import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { mockQCTasks, mockQCHistory } from '@/lib/mock-data';
import PageHeader from '@/components/common/PageHeader';

const QCUserDashboard: React.FC = () => {
    const recentTasks = mockQCTasks.filter(t => t.status === 'pending').slice(0, 5);
    const recentHistory = mockQCHistory.slice(0, 5);

    return (
        <div className="space-y-8 animate-fade-in">
            <PageHeader
                title="QC Dashboard"
                description="View and manage your assigned QC tasks"
            />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Link to="/tasks">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">My Tasks</h3>
                                    <p className="text-sm text-muted-foreground">View assigned QC tasks</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/qc-history">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">QC History</h3>
                                    <p className="text-sm text-muted-foreground">View completed QC</p>
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
                        <CardTitle className="text-lg">Assigned Tasks</CardTitle>
                        <Link to="/tasks">
                            <Button variant="ghost" size="sm" className="gap-1">
                                View All <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentTasks.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">No pending tasks</p>
                            ) : (
                                recentTasks.map((task) => (
                                    <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                        <div className="space-y-1">
                                            <p className="font-medium">{task.batchCode}</p>
                                            <p className="text-sm text-muted-foreground">{task.imageCount} images</p>
                                        </div>
                                        <Link to={`/qc/${task.batchId}`}>
                                            <Button size="sm">Start QC</Button>
                                        </Link>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">My Recent History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentHistory.map((history) => (
                                <div key={history.id} className="flex gap-3">
                                    <div className="p-2 h-fit rounded-full bg-primary/10">
                                        <Clock className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">{history.batchCode} completed</p>
                                        <p className="text-xs text-muted-foreground">Processed: {history.totalImages} images</p>
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

export default QCUserDashboard;
