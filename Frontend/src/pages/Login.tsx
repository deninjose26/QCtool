import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, ArrowLeft, Mail, Lock, Eye, EyeOff, Upload, CheckCircle, Users, BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/logo.png';
import loginBg from '@/assets/login-bg.png';


const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const success = await login(username, password);
      if (success) {
        toast({
          title: 'Login successful',
          description: 'Welcome to QC Portal',
        });
        navigate('/dashboard');
      } else {
        toast({
          title: 'Login failed',
          description: 'Invalid username or password.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An error occurred during login',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Illustration */}
      <div className="hidden lg:flex lg:w-3/5 p-12 flex-col justify-between relative overflow-hidden bg-gradient-to-br from-slate-300 via-slate-400 to-blue-300">
        {/* Background Image with subtle overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80"
          style={{ backgroundImage: `url(${loginBg})` }}
        >
          {/* Dark overlay for depth */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/25 via-slate-800/18 to-slate-700/10"></div>
        </div>

        <Link to="/" className="flex items-center gap-2 text-slate-700 hover:text-slate-900 transition-colors relative z-10">
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Home</span>
        </Link>

        <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto relative z-10">
          <div className="animate-slide-in-left text-center">

            <h1 className="text-5xl font-bold text-slate-800 mb-6 leading-tight drop-shadow-sm">
              Welcome to the<br />
              <span className="text-teal-600 bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">FamilyaConnect QC Portal</span>
            </h1>
            <p className="text-lg text-slate-700 mb-10 leading-relaxed">
              A comprehensive platform for managing document digitization projects with
              enterprise-grade quality control workflows.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Upload, label: 'Batch Uploads' },
                { icon: CheckCircle, label: 'Quality Control' },
                { icon: Users, label: 'Role-Based Access' },
                { icon: BarChart3, label: 'Real-time Stats' },
              ].map((item, i) => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center justify-center gap-3 p-5 rounded-xl bg-white/90 backdrop-blur-sm border border-slate-300 shadow-md hover:shadow-lg hover:bg-white transition-all duration-300 hover:scale-105"
                  >
                    <IconComponent className="h-8 w-8 text-teal-600" />
                    <span className="text-slate-800 font-medium text-center text-sm">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="text-slate-600 text-sm relative z-10">
          © {new Date().getFullYear()} familyaConnect.com . Secure Enterprise Platform.
        </p>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-2/5 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md animate-slide-in-right">
          <Link to="/" className="lg:hidden flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Home</span>
          </Link>

          {/* Logo - Centered */}
          <div className="text-center mb-8 lg:mb-10">
            <img src={logo} alt="QC Portal Logo" className="h-20 w-auto object-contain mx-auto mb-4" />
            <p className="text-muted-foreground">Sign in to continue to QC Portal</p>
          </div>

          <Card className="border shadow-elevated hover:shadow-2xl transition-shadow duration-300">
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="Enter your username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-11 h-11 border-2 focus:border-primary transition-colors"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-11 pr-11 h-11 border-2 focus:border-primary transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-base font-medium shadow-lg hover:shadow-xl transition-all duration-300"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⏳</span>
                      Signing in...
                    </span>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Login;
