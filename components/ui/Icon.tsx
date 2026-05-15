'use client'
// Icon component — Lucide by key, with emoji-passthrough fallback so existing
// emoji call sites keep working during the migration.
//
//   <Icon name="package" />    → Lucide Package
//   <Icon name="📦" />          → Lucide Package (aliased below)
//   <Icon name="unknown" />    → renders 'unknown' as plain text (graceful)

import { type ReactElement } from 'react'
import {
  LayoutGrid, Package, FileText, Banknote, Landmark, TrendingDown,
  Handshake, Calculator, BarChart3, Settings, Users, Tag, BookOpen,
  ArrowRight, ArrowUp, ArrowDown, Plus, Search, RefreshCw,
  Download, Upload, LogOut, Check, X, Mail, Phone, Trash2, Edit, Bell,
  Flame, Coins, TrendingUp, AlertTriangle, Info, ChevronRight,
  ChevronDown, ChevronUp, MoreHorizontal, Filter, Eye, EyeOff,
  Shield, UserCog, ClipboardList, Database, Receipt, ShoppingCart,
  Activity, Key, Crown, Wallet,
  type LucideIcon,
} from 'lucide-react'

// Key → Lucide component
const REGISTRY: Record<string, LucideIcon> = {
  dashboard:     LayoutGrid,
  stocks:        Package,
  proformas:     FileText,
  sales:         Banknote,
  collections:   Landmark,
  expenses:      TrendingDown,
  partners:      Handshake,
  simulation:    Calculator,
  analytics:     BarChart3,
  settings:      Settings,
  customers:     Users,
  products:      Tag,
  catalog:       BookOpen,
  users:         UserCog,        // admin: team management
  shield:        Shield,         // admin: audit log
  tasks:         ClipboardList,  // task management
  backup:        Database,       // admin: backup/restore
  cashflow:      Wallet,         // cash flow page
  tax:           Receipt,        // tax centre
  orders:        ShoppingCart,   // order operations
  activity:      Activity,       // activity history
  roles:         Key,            // authorization / roles
  ceo:           Crown,          // CEO summary
  alerts:        AlertTriangle,  // critical alerts
  'arrow-right': ArrowRight,
  'arrow-up':    ArrowUp,
  'arrow-down':  ArrowDown,
  'chevron-right': ChevronRight,
  'chevron-down':  ChevronDown,
  'chevron-up':    ChevronUp,
  'more':          MoreHorizontal,
  plus:          Plus,
  search:        Search,
  refresh:       RefreshCw,
  download:      Download,
  upload:        Upload,
  logout:        LogOut,
  check:         Check,
  x:             X,
  mail:          Mail,
  phone:         Phone,
  trash:         Trash2,
  edit:          Edit,
  bell:          Bell,
  flame:         Flame,
  coins:         Coins,
  'trending-up': TrendingUp,
  'alert':       AlertTriangle,
  'info':        Info,
  'filter':      Filter,
  'eye':         Eye,
  'eye-off':     EyeOff,
}

// Emoji → key alias (so existing call sites with emoji strings keep working).
const EMOJI_ALIAS: Record<string, string> = {
  '▦': 'dashboard',    '📦': 'stocks',       '📄': 'proformas',   '💰': 'sales',
  '🏦': 'collections', '💸': 'expenses',     '🤝': 'partners',
  '🧮': 'simulation',  '📊': 'analytics',    '⚙️': 'settings',   '⚙': 'settings',
  '👥': 'customers',   '🏷️': 'products',    '🏷': 'products',
  '→': 'arrow-right',  '↗': 'arrow-up',      '↘': 'arrow-down',
  '＋': 'plus',        '+': 'plus',          '🔥': 'flame',       '🪙': 'coins',
  '🔄': 'refresh',     '📥': 'download',     '📤': 'upload',
  '↩': 'logout',       '✓': 'check',         '✕': 'x',
  '📧': 'mail',        '📞': 'phone',        '🗑': 'trash',
  '📉': 'trending-up', '⚖': 'alert',
}

export function Icon({
  name,
  size = 16,
  className,
  fallback,
  strokeWidth = 1.5,
}: {
  name: string
  size?: number
  className?: string
  fallback?: string
  strokeWidth?: number
}): ReactElement {
  const key = REGISTRY[name] ? name : EMOJI_ALIAS[name]
  const Cmp = key ? REGISTRY[key] : undefined

  if (Cmp) {
    return <Cmp size={size} strokeWidth={strokeWidth} className={className} />
  }
  // Graceful fallback: render fallback prop, otherwise the `name` itself as text.
  return (
    <span className={className} style={{ fontSize: size, lineHeight: 1 }} aria-hidden>
      {fallback ?? name}
    </span>
  )
}
