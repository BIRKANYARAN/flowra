'use client'
// ─────────────────────────────────────────────────────────────────────────────
// lib/workspace-context.tsx — Flowra WorkspaceContext
//
// Provides company_id, role, permissions, and nav mode to the entire
// dashboard tree. Populated by the server layout, consumed by client components.
//
// Usage:
//   const ws = useWorkspace()
//   if (!ws.permissions.canManagePartners) return null
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { MemberRole } from '@/types'
import {
  type WorkspaceValue,
  type WorkspacePermissions,
  type NavMode,
  permissionsFromRole,
  navModeFromRole,
} from '@/types/dto'

const NAV_MODE_KEY = 'flowra_nav_mode'

const WorkspaceCtx = createContext<WorkspaceValue | null>(null)

export interface WorkspaceProviderProps {
  companyId:    string | null
  companyName:  string | null
  logoUrl:      string | null
  userRole:     MemberRole | null
  userId:       string | null
  userEmail:    string | null
  userName:     string | null
  userInitials: string | null
  children:     ReactNode
}

export function WorkspaceProvider({
  companyId,
  companyName,
  logoUrl,
  userRole,
  userId,
  userEmail,
  userName,
  userInitials,
  children,
}: WorkspaceProviderProps) {
  const [navMode, setNavModeState] = useState<NavMode>(() => navModeFromRole(userRole))

  // Restore preferred nav mode from localStorage (only admin can switch)
  useEffect(() => {
    if (userRole !== 'admin') return
    const stored = localStorage.getItem(NAV_MODE_KEY) as NavMode | null
    if (stored === 'CEO' || stored === 'CFO' || stored === 'OPS') {
      setNavModeState(stored)
    }
  }, [userRole])

  function setNavMode(mode: NavMode) {
    setNavModeState(mode)
    try { localStorage.setItem(NAV_MODE_KEY, mode) } catch {}
  }

  const permissions: WorkspacePermissions = permissionsFromRole(userRole)

  const value: WorkspaceValue = {
    companyId,
    companyName,
    logoUrl,
    userRole,
    userId,
    userEmail,
    userName,
    userInitials,
    permissions,
    navMode,
    setNavMode,
  }

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>
}

/** Hook — use anywhere inside the dashboard tree */
export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceCtx)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}

/** Hook — permissions shortcut */
export function usePermissions(): WorkspacePermissions {
  return useWorkspace().permissions
}
