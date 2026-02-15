import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('App error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
          <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
          <p className="text-sm text-gray-500 mt-2">{this.state.error?.message}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg"
          >
            Reload App
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
      console.log('Firebase SW registered')
    } catch (e) {
      console.log('Firebase SW registration failed:', e)
    }
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      console.log('Cache SW registered')
    } catch (e) {
      console.log('Cache SW registration failed:', e)
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
