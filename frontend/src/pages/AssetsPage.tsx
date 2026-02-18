import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Server,
  Database,
  Globe,
  FileText,
  Users,
  Loader2,
  Filter,
  AlertCircle,
} from 'lucide-react'

const assetTypeIcons: Record<string, React.ElementType> = {
  HARDWARE: Server,
  SOFTWARE: Globe,
  DATA: Database,
  SERVICE: Globe,
  PERSONNEL: Users,
  DOCUMENT: FileText,
}

const assetTypes = [
  'HARDWARE',
  'SOFTWARE',
  'DATA',
  'SERVICE',
  'PERSONNEL',
  'DOCUMENT',
]

export function AssetsPage() {
  const { currentOrganizationId } = useAuthStore()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  const { data: assets, isLoading } = useQuery({
    queryKey: ['assets', currentOrganizationId, search, typeFilter],
    queryFn: () =>
      api.assets.list(currentOrganizationId!, {
        search,
      }),
    enabled: !!currentOrganizationId,
  })

  const getCriticalityColor = (criticality: string) => {
    switch (criticality?.toUpperCase()) {
      case 'CRITICAL':
        return 'destructive'
      case 'HIGH':
        return 'warning'
      case 'MEDIUM':
        return 'default'
      case 'LOW':
        return 'success'
      default:
        return 'secondary'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assets</h1>
          <p className="text-muted-foreground">
            View your organization's information assets from iTop
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">
                Assets are fetched from iTop
              </p>
              <p className="text-sm text-blue-700 mt-1">
                This is a read-only view. To add, edit, or delete assets, please manage them directly in iTop at{' '}
                <a 
                  href="https://help.cdmx.in" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-900"
                >
                  help.cdmx.in
                </a>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {assetTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Assets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Asset Inventory</CardTitle>
          <CardDescription>
            {assets?.length || 0} assets from iTop
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>CIA Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <p className="text-muted-foreground">No assets found in iTop</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  assets?.map((asset: any) => {
                    const Icon = assetTypeIcons[asset.assetType] || Server
                    return (
                      <TableRow key={asset.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{asset.name}</p>
                              {asset.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {asset.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{asset.assetType}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getCriticalityColor(asset.classification) as any}>
                            {asset.classification}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {asset.owner || '-'}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {asset.location || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">
                            C:{asset.confidentiality || 0} I:{asset.integrity || 0} A:{asset.availability || 0}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={asset.status === 'active' ? 'success' : 'secondary'}>
                            {asset.status || 'active'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
