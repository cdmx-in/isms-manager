import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, CheckCircle2, Lock, BarChart3, FileCheck } from 'lucide-react'

export function LoginPage() {
  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google'
  }

  return (
    <div className="flex min-h-screen">
      {/* Left branded panel */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-400/5 rounded-full translate-x-1/4 translate-y-1/4" />
          <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-indigo-500/5 rounded-full" />
          {/* Grid pattern overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          {/* Top: Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 backdrop-blur-sm">
              <Shield className="h-6 w-6 text-blue-400" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Compliance Manager</span>
          </div>

          {/* Center: Value prop */}
          <div className="space-y-8 max-w-lg">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold leading-tight tracking-tight">
                Manage your information security compliance with confidence
              </h1>
              <p className="text-lg text-blue-200/70 leading-relaxed">
                Streamline ISO 27001, ISO 42001, and DPDPA compliance across your organization from a single platform.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/15 mt-0.5">
                  <FileCheck className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-blue-50">Statement of Applicability</p>
                  <p className="text-sm text-blue-200/60">Two-level approval workflows with full version tracking</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/15 mt-0.5">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-blue-50">Risk Management</p>
                  <p className="text-sm text-blue-200/60">AI-powered risk assessments with heat map visualization</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/15 mt-0.5">
                  <Lock className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-blue-50">152+ Controls</p>
                  <p className="text-sm text-blue-200/60">Covering ISO 27001, ISO 42001, and DPDPA frameworks</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: Subtle footer */}
          <div className="flex items-center gap-4 text-sm text-blue-200/40">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>SOC 2 Ready</span>
            </div>
            <span className="text-blue-200/20">|</span>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>ISO 27001</span>
            </div>
            <span className="text-blue-200/20">|</span>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>DPDPA</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right sign-in panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <Shield className="h-10 w-10 text-primary" />
              <span className="text-xl font-bold">Compliance Manager</span>
            </Link>
          </div>

          <div className="mb-8 lg:mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          <Card className="border-0 shadow-lg shadow-slate-200/50">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg">Sign in</CardTitle>
              <CardDescription>
                Use your Google account to access the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                className="w-full h-11 text-sm font-medium"
                onClick={handleGoogleLogin}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </Button>
            </CardContent>
          </Card>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            By signing in, you agree to our{' '}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
