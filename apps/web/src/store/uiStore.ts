import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  title?: string
}

interface UIStore {
  activeModule: string
  sidebarExpanded: boolean
  tableCompactView: boolean
  tableRightSidebarOpen: boolean
  toasts: Toast[]

  setActiveModule: (mod: string) => void
  toggleSidebar: () => void
  setSidebarExpanded: (v: boolean) => void
  setTableCompactView: (v: boolean) => void
  setTableRightSidebarOpen: (v: boolean) => void
  addToast: (type: Toast['type'], message: string, title?: string) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      activeModule: 'billing',
      sidebarExpanded: true,
      tableCompactView: false,
      tableRightSidebarOpen: true,
      toasts: [],

      setActiveModule: (mod) => set({ activeModule: mod }),
      toggleSidebar: () => set(s => ({ sidebarExpanded: !s.sidebarExpanded })),
      setSidebarExpanded: (v) => set({ sidebarExpanded: v }),
      setTableCompactView: (v) => set({ tableCompactView: v }),
      setTableRightSidebarOpen: (v) => set({ tableRightSidebarOpen: v }),

      addToast: (type, message, title) => {
        const id = `toast_${Date.now()}`
        set(s => ({ toasts: [...s.toasts, { id, type, message, title }] }))
        setTimeout(() => get().removeToast(id), 3200)
      },

      removeToast: (id) => {
        set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
      },
    }),
    {
      name: 'bhojpatra-ui-v1',
      partialize: (state) => ({
        activeModule: state.activeModule,
        sidebarExpanded: state.sidebarExpanded,
        tableCompactView: state.tableCompactView,
        tableRightSidebarOpen: state.tableRightSidebarOpen,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<UIStore> | undefined),
        toasts: [],
      }),
    }
  )
)
