import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Shield,
  Upload,
  CheckCircle,
  Users,
  Database,
  FileCheck,
  ArrowRight,
  Zap,
  Lock,
  BarChart3,
  Download,
} from 'lucide-react';
import networkBg from '@/assets/network-bg.png';
import logo from '@/assets/logo.png';
import ctaBg from '@/assets/cta-bg.png';
import LandingInstallButton from '@/components/common/LandingInstallButton';

const Landing: React.FC = () => {
  const features = [
    {
      icon: Upload,
      title: 'Batch Image Upload',
      description: 'Efficiently upload and organize large volumes of scanned documents with automated batch processing.',
    },
    {
      icon: CheckCircle,
      title: 'Quality Control',
      description: 'Multi-level QC workflow ensures every image meets quality standards before approval.',
    },
    {
      icon: Users,
      title: 'Role-Based Access',
      description: 'Granular access control with 6 distinct roles for secure collaboration.',
    },
    {
      icon: Database,
      title: 'Centralized Management',
      description: 'Manage projects, sources, locations, and record owners from a single dashboard.',
    },
    {
      icon: FileCheck,
      title: 'Audit Trail',
      description: 'Complete history of uploads, QC actions, and user activities for compliance.',
    },
    {
      icon: BarChart3,
      title: 'Real-time Analytics',
      description: 'Track upload progress, QC statistics, and workflow performance instantly.',
    },
  ];

  const roles = [
    { name: 'Super Admin', description: 'Full system access and user management' },
    { name: 'Upload Manager', description: 'Vendor and allocation management' },
    { name: 'Vendor', description: 'Operator management and batch oversight' },
    { name: 'Scanning Operator', description: 'Batch creation and image upload' },
    { name: 'QC Manager', description: 'QC team and task allocation' },
    { name: 'QC User', description: 'Image review and quality control' },
  ];

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="QC Portal Logo" className="h-14 w-auto object-contain" />
          </div>
          <div className="flex items-center gap-4">
            <LandingInstallButton className="hidden md:flex" />
            <Link to="/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link to="/login">
              <Button className="gap-2">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-32 relative overflow-hidden min-h-[85vh] flex items-center">
        {/* Background Image with Overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${networkBg})` }}
        >
          {/* Dark gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628]/95 via-[#0f2744]/90 to-[#1a3a5c]/85"></div>
          {/* Accent gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-accent/10"></div>
        </div>

        <div className="container mx-auto px-4 text-center relative z-10">
          <div className="animate-fade-in max-w-5xl mx-auto">
            <span className="inline-block px-5 py-2 rounded-full bg-primary/20 backdrop-blur-sm text-primary-foreground text-sm font-medium mb-8 border border-primary-foreground/10">
              Enterprise Document Management
            </span>
            <h1 className="text-5xl md:text-7xl font-bold text-primary-foreground mb-8 leading-tight drop-shadow-lg">
              Welcome to the<br />
              <span className="text-accent bg-gradient-to-r from-accent to-accent/70 bg-clip-text text-transparent">FamilyaConnect QC Portal</span>
            </h1>
            <p className="text-xl md:text-2xl text-primary-foreground/90 max-w-3xl mx-auto mb-12 drop-shadow-md leading-relaxed">
              A comprehensive solution for managing large-scale document digitization
              projects with multi-level quality assurance workflows.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-5 mb-20">
              <Link to="/login">
                <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2 px-10 py-6 text-lg shadow-xl hover:shadow-2xl transition-all">
                  Start Now <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/documentation">
                <Button size="lg" variant="outline" className="border-primary-foreground/30 bg-primary-foreground/5 backdrop-blur-sm text-primary-foreground hover:bg-primary-foreground/10 px-10 py-6 text-lg">
                  View Documentation
                </Button>
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { value: '10M+', label: 'Images Processed' },
              { value: '500+', label: 'Batches Completed' },
              { value: '99.9%', label: 'Uptime SLA' },
            ].map((stat, i) => (
              <div key={i} className="text-center p-6 rounded-xl bg-primary-foreground/5 backdrop-blur-sm border border-primary-foreground/10 hover:bg-primary-foreground/10 transition-all">
                <p className="text-4xl md:text-5xl font-bold text-primary-foreground drop-shadow-md mb-2">{stat.value}</p>
                <p className="text-primary-foreground/70 text-base">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Powerful Features</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Everything you need to manage document digitization at scale
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <Card key={i} className="group hover:shadow-elevated transition-all duration-300 border-border/50">
                <CardContent className="p-6">
                  <div className="p-3 rounded-lg bg-primary/10 w-fit mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-24 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Role-Based Workflow</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Secure, structured access control for every team member
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {roles.map((role, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-4 rounded-lg bg-card border hover:shadow-card transition-all"
              >
                <div className="p-2 rounded-lg bg-accent/10">
                  <Lock className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h4 className="font-semibold">{role.name}</h4>
                  <p className="text-sm text-muted-foreground">{role.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        {/* Background Image with Overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${ctaBg})` }}
        >
          {/* Dark gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628]/90 via-[#0f2744]/85 to-[#1a3a5c]/80"></div>
        </div>

        <div className="container mx-auto px-4 text-center relative z-10">
          <Zap className="h-12 w-12 text-accent mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            Ready to Transform Your Workflow?
          </h2>
          <p className="text-primary-foreground/90 max-w-2xl mx-auto mb-8 text-lg">
            Experience enterprise-grade document management with powerful quality control. Start digitizing smarter today.
          </p>
          <Link to="/login">
            <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2 px-8 shadow-xl hover:shadow-2xl transition-all">
              Access Portal <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-card border-t">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src={logo} alt="QC Portal Logo" className="h-14 w-auto object-contain" />
              </div>
              <p className="text-sm text-muted-foreground">
                Enterprise-grade document digitization and quality control platform.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/documentation" className="hover:text-foreground transition-colors">Features</Link></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><Link to="/documentation" className="hover:text-foreground transition-colors">Documentation</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Support</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-12 pt-8 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} familyaConnect.com . Secure Enterprise Platform.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
