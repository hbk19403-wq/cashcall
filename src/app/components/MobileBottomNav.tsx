"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

export default function MobileBottomNav({ locationId }: { locationId: string }) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: `/location/${locationId}`,             icon: "🏠", label: "Home"      },
    { href: `/location/${locationId}/sales`,        icon: "💵", label: "Sales"     },
    { href: `/location/${locationId}/food`,         icon: "🥩", label: "Food"      },
    { href: `/location/${locationId}/payroll`,      icon: "💰", label: "Payroll"   },
    { href: `/location/${locationId}/analytics`,    icon: "📈", label: "Analytics" },
  ];

  const isActive = (href: string) => {
    if (href === `/location/${locationId}`) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom"
      style={{
        background: "linear-gradient(to top, #060b18, #0a1628)",
        borderTop: "1px solid rgba(0,212,168,0.2)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
      <div className="flex items-stretch">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-2 pt-3 gap-0.5 transition-all active:scale-95"
              style={{ color: active ? "#00d4a8" : "rgba(255,255,255,0.5)" }}>
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
              {active && (
                <span className="absolute bottom-0 w-8 h-0.5 rounded-full" style={{ background: "#00d4a8" }} />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
