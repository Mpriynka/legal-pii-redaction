import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Shield, Chrome, Settings, Menu, X, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { path: "/", label: "Local Redaction", icon: Shield },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <ShieldCheck className="h-6 w-6 shrink-0 text-sidebar-primary" />
          {!collapsed && <span className="font-bold text-lg text-sidebar-primary-foreground">PII Redact</span>}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </Button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background">
        {children}
      </main>
    </div>
  );
}
