import {
  Award,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Network,
  ScrollText,
  Settings,
  ShieldAlert,
  TrendingUp,
  UserCog,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type Permission } from "@/domain/permissions";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: Permission;
  end?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Sidebar structure from the UI spec. Each item declares the permission it
 * needs so the navigation itself is permission-aware.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Ringkasan",
    items: [
      {
        label: "Dashboard",
        to: "/app",
        icon: LayoutDashboard,
        end: true,
        permission: PERMISSIONS.HR_VIEW,
      },
      {
        label: "Portal Karyawan",
        to: "/app/portal",
        icon: UserRound,
        end: true,
        permission: PERMISSIONS.HR_SELF_VIEW,
      },
    ],
  },
  {
    title: "Data SDM",
    items: [
      { label: "Data Karyawan", to: "/app/employees", icon: Users, permission: PERMISSIONS.HR_VIEW },
      {
        label: "Struktur Organisasi",
        to: "/app/organization",
        icon: Network,
        permission: PERMISSIONS.HR_VIEW,
      },
      {
        label: "Jabatan & Unit",
        to: "/app/positions",
        icon: Building2,
        permission: PERMISSIONS.HR_VIEW,
      },
    ],
  },
  {
    title: "Kepegawaian",
    items: [
      {
        label: "Kontrak & SK",
        to: "/app/contracts",
        icon: FileText,
        permission: PERMISSIONS.HR_CONTRACT_VIEW,
      },
      {
        label: "Kehadiran",
        to: "/app/attendance",
        icon: CalendarCheck,
        permission: PERMISSIONS.HR_ATTENDANCE_VIEW,
      },
      { label: "Cuti & Izin", to: "/app/leave", icon: CalendarDays, permission: PERMISSIONS.HR_LEAVE_VIEW },
    ],
  },
  {
    title: "Kompensasi",
    items: [
      {
        label: "Payroll",
        to: "/app/payroll",
        icon: Wallet,
        permission: PERMISSIONS.HR_PAYROLL_VIEW,
      },
      {
        label: "BPJS & Benefit",
        to: "/app/benefits",
        icon: ShieldAlert,
        permission: PERMISSIONS.HR_VIEW,
      },
    ],
  },
  {
    title: "Pengembangan",
    items: [
      {
        label: "Pendidikan & Kompetensi",
        to: "/app/education",
        icon: GraduationCap,
        permission: PERMISSIONS.HR_VIEW,
      },
      {
        label: "Pelatihan",
        to: "/app/trainings",
        icon: Award,
        permission: PERMISSIONS.HR_TRAINING_VIEW,
      },
      {
        label: "Penilaian Kinerja",
        to: "/app/performance",
        icon: TrendingUp,
        permission: PERMISSIONS.HR_PERFORMANCE_VIEW,
      },
      {
        label: "Disiplin & Pembinaan",
        to: "/app/discipline",
        icon: ClipboardCheck,
        permission: PERMISSIONS.HR_VIEW,
      },
    ],
  },
  {
    title: "Dokumen & Karier",
    items: [
      {
        label: "Dokumen",
        to: "/app/documents",
        icon: FolderOpen,
        permission: PERMISSIONS.HR_DOCUMENT_VIEW,
      },
      {
        label: "Mutasi & Promosi",
        to: "/app/mutations",
        icon: Briefcase,
        permission: PERMISSIONS.HR_VIEW,
      },
      {
        label: "Resign / Terminasi",
        to: "/app/resignations",
        icon: LogOut,
        permission: PERMISSIONS.HR_VIEW,
      },
    ],
  },
  {
    title: "Data & Governance",
    items: [
      { label: "Laporan", to: "/app/reports", icon: FileSpreadsheet, permission: PERMISSIONS.HR_REPORT_VIEW },
      { label: "Import Data", to: "/app/import", icon: FileSpreadsheet, permission: PERMISSIONS.HR_IMPORT },
      { label: "Audit Log", to: "/app/audit", icon: ScrollText, permission: PERMISSIONS.HR_AUDIT_VIEW },
      { label: "Pengaturan", to: "/app/settings", icon: Settings, permission: PERMISSIONS.HR_SETTINGS },
    ],
  },
];

export const USER_MENU_ITEMS = [
  { label: "Profil Saya", to: "/app/profile", icon: UserCog },
];
