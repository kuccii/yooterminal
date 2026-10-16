import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

function timeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell({ className }) {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleNotificationClick = (notification) => {
    if (!notification.read) markRead(notification.id);
    if (notification.link) {
      setOpen(false);
      navigate(notification.link);
    }
  };

  const handleMarkAllRead = () => {
    markAllRead();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn('relative rounded-full p-2 text-muted-foreground transition hover:text-foreground', className)}
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80" ref={dropdownRef}>
        <div className="flex items-center justify-between px-4 py-2">
          <DropdownMenuLabel className="font-semibold">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="flex cursor-pointer flex-col items-start gap-1 px-4 py-3"
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span className={cn('text-sm font-medium', !notification.read && 'font-semibold')}>
                    {notification.title}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {!notification.read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(notification.created_date)}
                    </span>
                  </div>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
