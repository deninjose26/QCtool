import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { mockQCTasks, mockQCHistory } from '@/lib/mock-data';
import PageHeader from '@/components/common/PageHeader';

const QCSupervisorDashboard: React.FC = () => {
    const recentTasks = mockQCTasks.slice(0, 5);
    const recentHistory = mockQCHistory.slice(0, 5);

    return (
        <div className="space-y-8 animate-fade-in">
            <PageHeader
                title="QC Supervisor Dashboard"
                description="Monitor and manage quality control operations"
            />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Link to="/qc-users">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">Manage QC Users</h3>
                                    <p className="text-sm text-muted-foreground">Configure QC team</p>
                                </div>
                                <ArrowRight className="h-6 w-6 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link to="/second-level-qc">
                    <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">Second Level QC</h3>
                                    <p className="text-sm text-muted-foreground">Review QC decisions</p>
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
                                    <p className="text-sm text-muted-foreground">View QC reports</p>
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
                        <CardTitle className="text-lg">Recent QC Tasks</CardTitle>
                        <Link to="/tasks">
                            <Button variant="ghost" size="sm" className="gap-1">
                                View All <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentTasks.map((task) => (
                                <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                    <div className="space-y-1">
                                        <p className="font-medium">{task.batchCode}</p>
                                        <p className="text-sm text-muted-foreground">Assigned to: {task.assignedToName}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-muted-foreground">{task.status}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">QC History</CardTitle>
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
                                        <p className="text-xs text-muted-foreground">Accepted: {history.acceptedCount} | Rejected: {history.rejectedCount}</p>
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

export default QCSupervisorDashboard;
