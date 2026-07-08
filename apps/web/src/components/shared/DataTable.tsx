import { ReactNode } from 'react'

export interface Column<T> {
  key: string
  label: string
  render?: (item: T) => ReactNode
  align?: 'left' | 'center' | 'right'
}

interface Props<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  emptyMessage?: string
}

export default function DataTable<T>({ columns, data, keyExtractor, emptyMessage = 'No data found' }: Props<T>) {
  return (
    <div className="w-full overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`px-5 py-3 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-8 text-center text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map(item => (
              <tr key={keyExtractor(item)} className="hover:bg-slate-50 transition-colors">
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`px-5 py-3 text-slate-700 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    {col.render ? col.render(item) : (item as any)[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
