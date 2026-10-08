import * as React from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "./navigation";
import { useAuth } from "@/providers/AuthProvider";
import { PERMISSIONS } from "@/domain/permissions";

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
        <span className="text-base font-extrabold tracking-tight text-white">H6</span>
      </div>
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight text-white">HRIS PIAT6</p>
          <p className="truncate text-[11px] leading-tight text-navy-200">
            Bondowoso · Al Irsyad Tengaran 6
          </p>
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ onNavigate, className }: SidebarProps) {
  const { can } = useAuth();
  const isEmployeeOnly = !can(PERMISSIONS.HR_VIEW);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <aside
      className={cn(
        "flex h-full w-[264px] flex-col bg-navy-900 text-navy-100",
        className,
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <BrandMark />
        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            className="rounded-md p-1.5 text-navy-200 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Tutup menu"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => {
          const isCollapsed = collapsed[section.title] ?? true;
          return (
            <div key={section.title} className="mb-1">
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [section.title]: !isCollapsed }))
                }
                className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-navy-300 transition hover:text-navy-100"
              >
                <span>{section.title}</span>
                <ChevronDown
                  className={cn("size-3.5 transition-transform", !isCollapsed && "rotate-180")}
                />
              </button>
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="overflow-hidden"
                >
                  <ul className="mt-1 space-y-0.5">
                    {section.items.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          onClick={onNavigate}
                          className={({ isActive }) =>
                            cn(
                              "group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] font-medium transition",
                              isActive
                                ? "bg-white/10 text-white shadow-[inset_2px_0_0_#86aae1]"
                                : "text-navy-200 hover:bg-white/5 hover:text-white",
                            )
                          }
                        >
                          <item.icon className="size-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-navy-300">
          {isEmployeeOnly ? (
            <>
              Halaman ini menampilkan data milik Anda sendiri. Hubungi HRD bila
              ada data yang belum tepat atau belum lengkap.
            </>
          ) : (
            <>
              Data karyawan produksi diimpor melalui
              <span className="font-semibold text-navy-100"> Import Karyawan</span>, bukan diunggah ke repositori.
            </>
          )}
        </p>
      </div>
    </aside>
  );
}
