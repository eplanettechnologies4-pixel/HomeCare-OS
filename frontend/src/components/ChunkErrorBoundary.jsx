import React from 'react';
import { RefreshCw } from 'lucide-react';

export default class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ChunkErrorBoundary] Caught render/chunk error:', error, errorInfo);

    const errorMessage = error?.message || error?.toString() || '';
    const isChunkError =
      /loading chunk/i.test(errorMessage) ||
      /dynamically imported module/i.test(errorMessage) ||
      /failed to fetch/i.test(errorMessage) ||
      /importing a module script failed/i.test(errorMessage);

    if (isChunkError) {
      try {
        const hasReloaded = sessionStorage.getItem('chunk_reload_attempted');
        if (!hasReloaded) {
          sessionStorage.setItem('chunk_reload_attempted', 'true');
          window.location.reload();
        }
      } catch (e) {
        console.warn('[ChunkErrorBoundary] Storage access blocked:', e);
      }
    }
  }

  handleManualReload = () => {
    try {
      sessionStorage.removeItem('chunk_reload_attempted');
    } catch (e) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div
            className="card"
            style={{
              maxWidth: 460,
              textAlign: 'center',
              padding: '36px 28px',
              borderTop: '4px solid #6D28D9',
              borderRadius: 16,
              boxShadow: '0 8px 30px rgba(109,40,217,0.1)',
              background: '#FFFFFF',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#EDE9FE',
                color: '#6D28D9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <RefreshCw size={26} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1E1B4B', margin: '0 0 8px 0' }}>
              A new version is available
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#6B7280', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              An updated version of the clinical portal has been deployed. Please reload the page to apply the latest updates.
            </p>
            <button
              onClick={this.handleManualReload}
              className="btn btn-primary"
              style={{
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 20px',
                fontWeight: 700,
              }}
            >
              <RefreshCw size={15} /> Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

