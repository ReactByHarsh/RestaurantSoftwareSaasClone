import { clsx } from 'clsx'

interface Props {
  stations: { id: string; name: string }[]
  activeStationId: string
  onSelect: (id: string) => void
}

export default function StationFilter({ stations, activeStationId, onSelect }: Props) {
  return (
    <div className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto scrollbar-hide">
      <button
        onClick={() => onSelect('all')}
        className={clsx(
          'flex-shrink-0 px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold border transition-all',
          activeStationId === 'all'
            ? 'bg-primary text-white border-primary shadow-md'
            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
        )}
      >
        All Stations
      </button>
      {stations.map(station => (
        <button
          key={station.id}
          onClick={() => onSelect(station.id)}
          className={clsx(
            'flex-shrink-0 px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold border transition-all',
            activeStationId === station.id
              ? 'bg-primary text-white border-primary shadow-md'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
          )}
        >
          {station.name}
        </button>
      ))}
    </div>
  )
}
