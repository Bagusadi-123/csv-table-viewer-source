"use client"

// ============================================================
// AppSidebar — menu navigasi utama aplikasi.
// Desain berbasis menu: setiap fitur berada di sub menu
// sendiri (Beranda, Upload CSV, Tampilan Tabel,
// Dataset Tersimpan, Panduan & Catatan).
// ============================================================

import {
  BookOpen,
  Database,
  LayoutDashboard,
  Table2,
  UploadCloud,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

/** Identitas tiap sub menu */
export type AppSection =
  | "beranda"
  | "upload"
  | "tabel"
  | "dataset"
  | "panduan"

/** Judul tiap sub menu (dipakai di header halaman) */
export const SECTION_TITLES: Record<AppSection, string> = {
  beranda: "Beranda",
  upload: "Upload CSV",
  tabel: "Tampilan Tabel",
  dataset: "Dataset Tersimpan",
  panduan: "Panduan & Catatan",
}

interface MenuEntry {
  id: AppSection
  title: string
  icon: React.ComponentType<{ className?: string }>
}

interface MenuGroup {
  label: string
  items: MenuEntry[]
}

const MENU_GROUPS: MenuGroup[] = [
  {
    label: "Menu Utama",
    items: [
      { id: "beranda", title: "Beranda", icon: LayoutDashboard },
      { id: "upload", title: "Upload CSV", icon: UploadCloud },
      { id: "tabel", title: "Tampilan Tabel", icon: Table2 },
    ],
  },
  {
    label: "Database",
    items: [{ id: "dataset", title: "Dataset Tersimpan", icon: Database }],
  },
  {
    label: "Bantuan",
    items: [{ id: "panduan", title: "Panduan & Catatan", icon: BookOpen }],
  },
]

interface AppSidebarProps {
  /** sub menu yang sedang terbuka */
  activeSection: AppSection
  /** callback berpindah sub menu */
  onNavigate: (section: AppSection) => void
  /** jumlah baris dataset aktif (badge di sub menu Tampilan Tabel) */
  datasetRowCount?: number
  /** jumlah dataset tersimpan di database */
  savedCount: number
}

export function AppSidebar({
  activeSection,
  onNavigate,
  datasetRowCount,
  savedCount,
}: AppSidebarProps) {
  return (
    <Sidebar>
      {/* Brand aplikasi */}
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Table2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              CSV Table Viewer
            </p>
            <p className="truncate text-xs text-muted-foreground">
              CSV → Tabel Interaktif
            </p>
          </div>
        </div>
      </SidebarHeader>

      {/* Daftar menu → sub menu */}
      <SidebarContent>
        {MENU_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeSection === item.id}
                      onClick={() => onNavigate(item.id)}
                      tooltip={item.title}
                      aria-current={activeSection === item.id ? "page" : undefined}
                    >
                      <item.icon aria-hidden="true" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {item.id === "tabel" && datasetRowCount !== undefined && (
                      <SidebarMenuBadge className="tabular-nums">
                        {datasetRowCount.toLocaleString("id-ID")}
                      </SidebarMenuBadge>
                    )}
                    {item.id === "dataset" && savedCount > 0 && (
                      <SidebarMenuBadge className="tabular-nums">
                        {savedCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <p className="px-2 py-1 text-xs leading-relaxed text-muted-foreground">
          Firebase Auth & Prisma (MySQL-ready)
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
