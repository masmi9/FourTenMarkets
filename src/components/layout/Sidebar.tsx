"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "⚡" },
  { href: "/markets", label: "Markets", icon: "📊" },
  { href: "/bets", label: "My Bets", icon: "🎯" },
  { href: "/wallet", label: "Wallet", icon: "💰" },
];

const adminItems = [
  { href: "/admin", label: "Admin", icon: "🛡️" },
];

interface SidebarProps {
  role?: string;
  balance?: number;
}

export default function Sidebar({ role, balance }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen bg-brand-surface border-r border-border flex flex-col">
      {/* Logo */}
      <div className="px-4 py-3 border-b border-border">
        <Link href="/dashboard" className="flex items-center justify-center">
          <Image
            src="/FourTen_Logo.png"
            alt="FourTen Markets"
            width={130}
            height={65}
            priority
            className="drop-shadow-md"
          />
        </Link>
      </div>

      {/* Balance chip */}
      {balance !== undefined && (
        <div className="mx-4 mt-4 p-3 bg-brand-card rounded-lg border border-border">
          <p className="text-xs text-muted-foreground">Available Balance</p>
          <p className="text-lg font-bold text-brand-green">
            ${balance.toFixed(2)}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === item.href || pathname.startsWith(item.href + "/")
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {role === "ADMIN" && (
          <>
            <div className="pt-4 pb-2 px-3 text-xs text-muted-foreground uppercase tracking-wider">
              Admin
            </div>
            {adminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-border">
        <LogoutButton />
      </div>
    </aside>
  );
}

function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      Sign Out
    </button>
  );
}
