import { Outlet } from 'react-router-dom'
import TopStatusBar from './TopStatusBar'
import LeftSideNav from './LeftSideNav'

export default function AppShell() {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#F8FAFC]">
      <LeftSideNav />
      <div className="flex h-full flex-col pb-16 sm:pb-0 sm:pl-14">
        <TopStatusBar />
        <main className="main-content w-full min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
