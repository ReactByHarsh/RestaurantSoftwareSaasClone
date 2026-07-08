import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'
import { realtimeClient } from './lib/realtime'
import { isTauriDesktop } from './lib/localDb'
import DesktopBootstrap from './components/sync/DesktopBootstrap'

// Connect realtime client on app start
realtimeClient.connect()

if (isTauriDesktop()) {
  void (async () => {
    try {
      const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : []
      await Promise.all(registrations.map((registration) => registration.unregister()))
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
      if (registrations.length > 0 && !sessionStorage.getItem('bhojpatra-desktop-cache-refresh')) {
        sessionStorage.setItem('bhojpatra-desktop-cache-refresh', '1')
        window.location.reload()
      }
    } catch {
      // Old service-worker caches should never block a desktop update.
    }
  })()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DesktopBootstrap>
        <App />
      </DesktopBootstrap>
    </BrowserRouter>
  </React.StrictMode>
)
