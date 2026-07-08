export type FloorColorScheme = {
  active: string
  idle: string
  border: string
  borderIdle: string
  badge: string
}

export const FLOOR_COLORS: FloorColorScheme[] = [
  {
    active: 'bg-blue-500 text-black border-blue-600 shadow-blue-500/30',
    idle: 'bg-blue-100 border-blue-300 text-blue-900 hover:border-blue-500 hover:bg-blue-200',
    border: 'border-blue-500',
    borderIdle: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  {
    active: 'bg-emerald-500 text-black border-emerald-600 shadow-emerald-500/30',
    idle: 'bg-emerald-100 border-emerald-300 text-emerald-900 hover:border-emerald-500 hover:bg-emerald-200',
    border: 'border-emerald-500',
    borderIdle: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    active: 'bg-amber-400 text-black border-amber-500 shadow-amber-400/30',
    idle: 'bg-amber-100 border-amber-300 text-amber-900 hover:border-amber-500 hover:bg-amber-200',
    border: 'border-amber-500',
    borderIdle: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    active: 'bg-violet-500 text-black border-violet-600 shadow-violet-500/30',
    idle: 'bg-violet-100 border-violet-300 text-violet-900 hover:border-violet-500 hover:bg-violet-200',
    border: 'border-violet-500',
    borderIdle: 'border-violet-200',
    badge: 'bg-violet-100 text-violet-800 border-violet-300',
  },
  {
    active: 'bg-rose-500 text-black border-rose-600 shadow-rose-500/30',
    idle: 'bg-rose-100 border-rose-300 text-rose-900 hover:border-rose-500 hover:bg-rose-200',
    border: 'border-rose-500',
    borderIdle: 'border-rose-200',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  {
    active: 'bg-cyan-500 text-black border-cyan-600 shadow-cyan-500/30',
    idle: 'bg-cyan-100 border-cyan-300 text-cyan-900 hover:border-cyan-500 hover:bg-cyan-200',
    border: 'border-cyan-500',
    borderIdle: 'border-cyan-200',
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  },
]

export function getFloorColor(index: number): FloorColorScheme {
  return FLOOR_COLORS[index % FLOOR_COLORS.length]
}
