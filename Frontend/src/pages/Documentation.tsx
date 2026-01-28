import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ArrowLeft,
    BookOpen,
    Users,
    Upload,
    CheckCircle,
    Settings,
    FileText,
    Shield,
    Zap,
    Database,
    GitBranch,
    Bell,
    Mail,
} from 'lucide-react';
import logo from '@/assets/logo.png';

const Documentation: React.FC = () => {
    const sections = [
        {
            id: 'getting-started',
            title: 'Getting Started',
            icon: Zap,
            content: [
                {
                    subtitle: 'System Overview',
                    text: 'The FamilyaConnect QC Portal is an enterprise-grade document digitization and quality control platform designed to manage large-scale scanning projects with multi-level quality assurance workflows.',
                },
                {
                    subtitle: 'Accessing the System',
                    text: 'Navigate to the login page and enter your credentials provided by your system administrator. Each user is assigned a specific role that determines their access level and available features.',
                },
            ],
        },
        {
            id: 'user-roles',
            title: 'User Roles & Permissions',
            icon: Users,
            content: [
                {
                    subtitle: 'Super Admin',
                    text: 'Full system access including user management, project setup, and system configuration. Can view all reports and manage all aspects of the platform.',
                },
                {
                    subtitle: 'Upload Supervisor',
                    text: 'Manages vendors and batch allocations. Reviews upload reports, monitors progress, and oversees the upload workflow.',
                },
                {
                    subtitle: 'Vendor',
                    text: 'Manages scanning operators and assigns batches. Reviews operator uploads and handles rework assignments.',
                },
                {
                    subtitle: 'Scanning Operator',
                    text: 'Creates batches and uploads scanned images. Can handle both complete and partial uploads, as well as rework batches.',
                },
                {
                    subtitle: 'QC Supervisor',
                    text: 'Manages QC users and allocates batches for quality control. Reviews completed QC tasks and makes final approval decisions.',
                },
                {
                    subtitle: 'QC User',
                    text: 'Performs quality checks on uploaded images. Reviews images for quality issues, orientation errors, and marks them as approved or rejected.',
                },
            ],
        },
        {
            id: 'upload-workflow',
            title: 'Upload Workflow',
            icon: Upload,
            content: [
                {
                    subtitle: '1. Batch Creation',
                    text: 'Operators create batches by selecting the hierarchy (Project → Source → Location → Record Owner → Record Type) and entering book details. Choose between Complete or Partial upload types.',
                },
                {
                    subtitle: '2. Image Upload',
                    text: 'Upload scanned images using the drag-and-drop interface or file browser. The system validates file formats (TIFF, JPG, PNG) and tracks upload progress in real-time.',
                },
                {
                    subtitle: '3. Batch Submission',
                    text: 'Once all images are uploaded, submit the batch for conversion and QC. The system automatically notifies supervisors of batch completion.',
                },
                {
                    subtitle: '4. Rework Handling',
                    text: 'If a batch is rejected during QC, it appears in the Re-upload Queue. Operators can upload corrected images for rejected pages.',
                },
            ],
        },
        {
            id: 'qc-workflow',
            title: 'Quality Control Workflow',
            icon: CheckCircle,
            content: [
                {
                    subtitle: '1. Batch Allocation',
                    text: 'QC Supervisors allocate batches to QC Users based on workload and expertise. Allocated batches appear in the QC User\'s task list.',
                },
                {
                    subtitle: '2. Image Review',
                    text: 'QC Users review each image for quality issues. They can mark images as Approved, Rejected, or Flagged, and add remarks for rejected images.',
                },
                {
                    subtitle: '3. Orientation Check',
                    text: 'Check for orientation errors and mark accordingly. Images with orientation issues can be flagged for correction.',
                },
                {
                    subtitle: '4. Task Completion',
                    text: 'After reviewing all images, mark the task as complete. The QC Supervisor is notified for final verification.',
                },
                {
                    subtitle: '5. Supervisor Verification',
                    text: 'QC Supervisors review completed tasks and make final approval decisions. They can approve the batch or send it back for rework.',
                },
            ],
        },
        {
            id: 'notifications',
            title: 'Notification System',
            icon: Bell,
            content: [
                {
                    subtitle: 'Real-time Alerts',
                    text: 'The system provides real-time notifications for important events like batch uploads, QC assignments, and task completions. Notifications appear in the bell icon in the header.',
                },
                {
                    subtitle: 'Sound Alerts',
                    text: 'Enable sound notifications in the notification dropdown to receive audio alerts when new notifications arrive. You can toggle this on/off as needed.',
                },
                {
                    subtitle: 'Email Notifications',
                    text: 'Configure email notifications in Settings to receive daily summaries and important updates via email. You can enable/disable this feature based on your preference.',
                },
                {
                    subtitle: 'Notification Actions',
                    text: 'Click on any notification to navigate directly to the relevant page. Mark notifications as read individually or use "Mark All as Read" for bulk actions.',
                },
            ],
        },
        {
            id: 'settings',
            title: 'Settings & Configuration',
            icon: Settings,
            content: [
                {
                    subtitle: 'Theme Selection',
                    text: 'Choose from Light, Dark, System, or Midnight Blue themes to customize your workspace appearance. Your preference is saved automatically.',
                },
                {
                    subtitle: 'Email Notifications',
                    text: 'Toggle email notifications on/off to control when you receive email updates about batch allocations, completions, and daily summaries.',
                },
                {
                    subtitle: 'Partial Upload Feature (Admin Only)',
                    text: 'Administrators can enable/disable the partial upload feature. When disabled, operators can only create complete batches, simplifying the workflow.',
                },
            ],
        },
        {
            id: 'reports',
            title: 'Reports & Analytics',
            icon: FileText,
            content: [
                {
                    subtitle: 'Upload History',
                    text: 'View comprehensive upload history with filters for date range, status, and batch type. Export reports to Excel for further analysis.',
                },
                {
                    subtitle: 'QC History',
                    text: 'Track QC progress and statistics including acceptance rates, rejection reasons, and turnaround times.',
                },
                {
                    subtitle: 'Dashboard Metrics',
                    text: 'Role-specific dashboards display key performance indicators like total batches, uploaded images, and quality metrics.',
                },
                {
                    subtitle: 'Image Preview',
                    text: 'Preview uploaded images with zoom and navigation controls. View image metadata and QC status.',
                },
            ],
        },
        {
            id: 'best-practices',
            title: 'Best Practices',
            icon: Shield,
            content: [
                {
                    subtitle: 'Image Quality',
                    text: 'Ensure scanned images are clear, properly oriented, and in the correct format (TIFF preferred). Use 300 DPI or higher for optimal quality.',
                },
                {
                    subtitle: 'Batch Organization',
                    text: 'Follow the hierarchy structure consistently. Use clear, descriptive book names with only letters, numbers, spaces, and hyphens.',
                },
                {
                    subtitle: 'QC Accuracy',
                    text: 'Review each image carefully. Provide clear, specific remarks when rejecting images to help operators understand required corrections.',
                },
                {
                    subtitle: 'Regular Monitoring',
                    text: 'Check notifications regularly and respond to assignments promptly. Use the dashboard to track your progress and pending tasks.',
                },
                {
                    subtitle: 'Data Security',
                    text: 'Never share your login credentials. Log out when leaving your workstation. Report any suspicious activity to your administrator.',
                },
            ],
        },
    ];

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-sm border-b">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src={logo} alt="QC Portal Logo" className="h-14 w-auto object-contain" />
                    </div>
                    <Link to="/">
                        <Button variant="ghost" className="gap-2">
                            <ArrowLeft className="h-4 w-4" /> Back to Home
                        </Button>
                    </Link>
                </div>
            </nav>

            {/* Hero */}
            <section className="py-20 bg-gradient-to-br from-primary/10 via-background to-accent/5">
                <div className="container mx-auto px-4 text-center">
                    <BookOpen className="h-16 w-16 text-primary mx-auto mb-6" />
                    <h1 className="text-4xl md:text-5xl font-bold mb-4">Documentation</h1>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                        Complete guide to using the FamilyaConnect QC Portal
                    </p>
                </div>
            </section>

            {/* Table of Contents */}
            <section className="py-12 bg-muted/30">
                <div className="container mx-auto px-4">
                    <h2 className="text-2xl font-bold mb-6 text-center">Quick Navigation</h2>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
                        {sections.map((section) => (
                            <a
                                key={section.id}
                                href={`#${section.id}`}
                                className="flex items-center gap-3 p-4 rounded-lg bg-card border hover:shadow-md transition-all group"
                            >
                                <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                                    <section.icon className="h-5 w-5 text-primary" />
                                </div>
                                <span className="font-medium">{section.title}</span>
                            </a>
                        ))}
                    </div>
                </div>
            </section>

            {/* Content Sections */}
            <section className="py-16">
                <div className="container mx-auto px-4 max-w-5xl">
                    <div className="space-y-16">
                        {sections.map((section) => (
                            <div key={section.id} id={section.id} className="scroll-mt-20">
                                <Card className="border-2">
                                    <CardHeader className="bg-muted/50">
                                        <CardTitle className="flex items-center gap-3 text-2xl">
                                            <div className="p-2 rounded-lg bg-primary/10">
                                                <section.icon className="h-6 w-6 text-primary" />
                                            </div>
                                            {section.title}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-6">
                                        {section.content.map((item, idx) => (
                                            <div key={idx} className="space-y-2">
                                                <h3 className="text-lg font-semibold text-primary">{item.subtitle}</h3>
                                                <p className="text-muted-foreground leading-relaxed">{item.text}</p>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Support Section */}
            <section className="py-16 bg-gradient-to-br from-primary/5 to-accent/5">
                <div className="container mx-auto px-4 text-center">
                    <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
                    <h2 className="text-3xl font-bold mb-4">Need Help?</h2>
                    <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                        If you have questions not covered in this documentation, please contact your system administrator or reach out to our support team.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link to="/login">
                            <Button size="lg" className="gap-2">
                                Access Portal <ArrowLeft className="h-4 w-4 rotate-180" />
                            </Button>
                        </Link>
                        <Link to="/">
                            <Button size="lg" variant="outline">
                                Back to Home
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-8 bg-card border-t">
                <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
                    © {new Date().getFullYear()} familyaConnect.com. All rights reserved.
                </div>
            </footer>
        </div>
    );
};

export default Documentation;
