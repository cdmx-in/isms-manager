import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Link } from 'react-router-dom'
import { Shield, Brain, Lock, Loader2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const frameworkIcons: Record<string, React.ElementType> = {
  Shield: Shield,
  Brain: Brain,
  Lock: Lock,
}

const fallbackFrameworks = [
  {
    slug: 'iso27001',
    name: 'ISO/IEC 27001:2022',
    shortName: 'ISO 27001',
    description: 'Information Security Management Systems - Requirements. The international standard for managing information security.',
    icon: 'Shield',
    color: '#3b82f6',
    controlCount: 93,
  },
  {
    slug: 'iso42001',
    name: 'ISO/IEC 42001:2023',
    shortName: 'ISO 42001',
    description: 'Artificial Intelligence Management Systems. Requirements for establishing, implementing, maintaining and continually improving an AI management system.',
    icon: 'Brain',
    color: '#8b5cf6',
    controlCount: 39,
  },
  {
    slug: 'dpdpa',
    name: 'DPDPA 2023',
    shortName: 'DPDPA',
    description: 'Digital Personal Data Protection Act 2023 (India). Comprehensive data protection legislation governing the processing of digital personal data.',
    icon: 'Lock',
    color: '#f59e0b',
    controlCount: 30,
  },
]

export function FrameworksPage() {
  const { currentOrganizationId } = useAuthStore()

  const { data: frameworks, isLoading } = useQuery({
    queryKey: ['frameworks', currentOrganizationId],
    queryFn: () => api.frameworks.list(currentOrganizationId),
    enabled: !!currentOrganizationId,
  })

  const displayFrameworks = frameworks?.length ? frameworks : fallbackFrameworks

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compliance Frameworks</h1>
        <p className="text-muted-foreground">
          Manage and track implementation across multiple compliance frameworks
        </p>
      </div>

      {/* Framework Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {displayFrameworks.map((framework: any) => {
          const IconComponent = frameworkIcons[framework.icon] || Shield
          const progressPercent = framework.progress?.progressPercent || 0
          const controlCount = framework.controlCount || framework.progress?.total || 0

          return (
            <Card key={framework.slug} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-lg p-2"
                    style={{ backgroundColor: `${framework.color}20` }}
                  >
                    <IconComponent
                      className="h-6 w-6"
                      style={{ color: framework.color }}
                    />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{framework.shortName}</CardTitle>
                    <CardDescription className="text-xs">{framework.name}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <p className="text-sm text-muted-foreground mb-4 flex-1">
                  {framework.description}
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Controls</span>
                    <Badge variant="secondary">{controlCount}</Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{progressPercent}%</span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                  </div>

                  <Button asChild className="w-full mt-2">
                    <Link to={`/frameworks/${framework.slug}`}>
                      View Controls
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
