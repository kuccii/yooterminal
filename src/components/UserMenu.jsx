import React from 'react';
import { Link } from 'react-router-dom';
import { Ticket, LogOut, ChevronDown, LayoutDashboard, ShieldCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/AuthContext';

export default function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold transition hover:border-primary"
        >
          <span className="max-w-[110px] truncate">{user?.full_name || user?.email || 'Account'}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {user?.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/trips" className="cursor-pointer">
            <Ticket className="mr-2 h-4 w-4" /> My trips
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/operator" className="cursor-pointer">
            <LayoutDashboard className="mr-2 h-4 w-4" /> Operator dashboard
          </Link>
        </DropdownMenuItem>
        {user?.role === 'admin' && (
          <DropdownMenuItem asChild>
            <Link to="/admin" className="cursor-pointer">
              <ShieldCheck className="mr-2 h-4 w-4" /> Admin panel
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" onClick={() => logout()}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}