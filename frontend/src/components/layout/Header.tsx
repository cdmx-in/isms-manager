import { useState } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Bell, LogOut, Settings, User, SendHorizontal, CheckCircle, XCircle, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const NOTIFICATION_ICONS: Record<string, typeof SendHorizontal> = {
  soa_submitted: SendHorizontal,
  soa_approved_first: CheckCircle,
  soa_approved_final: ShieldCheck,
  soa_rejected: XCircle,
}

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function Header() {
  const { user, logout, currentOrganizationId } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [notifOpen, setNotifOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`
    : 'U'

  // Unread count — polls every 30s
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'count', currentOrganizationId],
    queryFn: () => api.notifications.unreadCount(currentOrganizationId!),
    enabled: !!currentOrganizationId,
    refetchInterval: 30000,
  })

  // Notification list — only fetched when popover is open
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', 'list', currentOrganizationId],
    queryFn: () => api.notifications.list(currentOrganizationId!, { limit: 10 }),
    enabled: !!currentOrganizationId && notifOpen,
  })

  const handleMarkAllRead = async () => {
    if (!currentOrganizationId) return
    await api.notifications.markAllRead(currentOrganizationId)
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const handleNotificationClick = async (notif: any) => {
    if (!notif.isRead) {
      await api.notifications.markRead(notif.id)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
    setNotifOpen(false)
    if (notif.link) {
      navigate(notif.link)
    }
  }

  return (
    <header className="flex h-16 items-center justify-end border-b bg-card px-6">
      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h4 className="text-sm font-semibold">Notifications</h4>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs text-muted-foreground"
                  onClick={handleMarkAllRead}
                >
                  Mark all read
                </Button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No notifications
                </div>
              ) : (
                notifications.map((notif: any) => {
                  const Icon = NOTIFICATION_ICONS[notif.type] || Bell
                  const isRejection = notif.type === 'soa_rejected'
                  return (
                    <button
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${
                        !notif.isRead ? 'bg-muted/30' : ''
                      }`}
                    >
                      <div className={`mt-0.5 shrink-0 ${isRejection ? 'text-destructive' : 'text-primary'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${!notif.isRead ? 'font-semibold' : ''}`}>
                          {notif.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {notif.message}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground/70">
                          {timeAgo(notif.createdAt)}
                        </p>
                      </div>
                      {!notif.isRead && (
                        <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline-block">
                {user?.firstName} {user?.lastName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
