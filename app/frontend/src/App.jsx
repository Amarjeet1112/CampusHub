import React, { useState, useEffect } from 'react';

export default function App() {
  const [events, setEvents] = useState([]);
  const [dataSource, setDataSource] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [systemHealth, setSystemHealth] = useState(null);

  // Registration Form State
  const [selectedEventId, setSelectedEventId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [submittingReg, setSubmittingReg] = useState(false);
  const [regMessage, setRegMessage] = useState(null);
  const [regError, setRegError] = useState(null);

  // Image Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  // Fetch Events from API
  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch('/api/events');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setEvents(data.data || []);
      setDataSource(data.source || (data.cached ? 'redis' : 'postgres'));
      if (data.data && data.data.length > 0 && !selectedEventId) {
        setSelectedEventId(data.data[0].id);
      }
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Check System Health
  const checkHealth = async () => {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      }
    } catch {
      setSystemHealth({ status: 'unreachable' });
    }
  };

  useEffect(() => {
    fetchEvents();
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // Handle Event Registration
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!selectedEventId || !studentName || !studentEmail) return;

    setSubmittingReg(true);
    setRegMessage(null);
    setRegError(null);

    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: parseInt(selectedEventId, 10),
          studentName,
          studentEmail
        })
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to submit registration');
      }

      setRegMessage({
        text: `Registration confirmed for ${studentName}! An email job was dispatched to RabbitMQ and delivered via MailHog.`,
        email: studentEmail
      });
      setStudentName('');
      setStudentEmail('');
    } catch (err) {
      setRegError(err.message || 'Error submitting registration.');
    } finally {
      setSubmittingReg(false);
    }
  };

  // Handle Image Upload to MinIO via API
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadMessage(null);
    setUploadError(null);

    const formData = new FormData();
    formData.append('image', selectedFile);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setUploadedImageUrl(result.url);
      setUploadMessage(`Image stored in MinIO bucket 'campushub'! Accessible via Gateway route: ${result.url}`);
    } catch (err) {
      setUploadError(err.message || 'Failed to upload image.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <header className="header">
        <div className="container header-content">
          <div className="logo-area">
            <h1>🎓 CampusHub</h1>
            <p>University Event Management & Registration Platform</p>
          </div>
          <div className="health-badge">
            <span className="dot"></span>
            <span>
              Stack Status: {systemHealth?.status === 'ok' ? 'All Services Healthy' : 'Online'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container">
        {/* Controls */}
        <div className="controls-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 className="section-title">Upcoming Campus Events</h2>
            {dataSource && (
              <span className={`cache-pill ${dataSource === 'redis' ? 'cache-redis' : 'cache-postgres'}`}>
                {dataSource === 'redis' ? '⚡ Served from Redis Cache' : '🐘 Served from PostgreSQL'}
              </span>
            )}
          </div>
          <button className="btn btn-secondary" onClick={fetchEvents} disabled={loadingEvents}>
            🔄 {loadingEvents ? 'Refreshing...' : 'Refresh Events'}
          </button>
        </div>

        {/* Layout */}
        <div className="main-layout">
          {/* Left Column: Events List */}
          <div className="events-grid">
            {events.length === 0 && !loadingEvents && (
              <div className="empty-state">
                <p>No events found. Events will appear once seeded from PostgreSQL.</p>
              </div>
            )}

            {events.map((event) => (
              <div key={event.id} className="event-card">
                <div className="event-image-wrap">
                  <img
                    src={event.image_url || '/storage/campushub/default-event.png'}
                    alt={event.title}
                    className="event-img"
                    onError={(e) => {
                      // Fallback SVG if image not yet in bucket
                      e.target.onerror = null;
                      e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect fill="%232563eb" width="300" height="200"/><text fill="%23ffffff" font-family="sans-serif" font-size="20" font-weight="bold" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">🎓 CampusHub Event</text></svg>';
                    }}
                  />
                </div>
                <div className="event-body">
                  <div>
                    <h3>{event.title}</h3>
                    <p>{event.description}</p>
                    <div className="event-meta">
                      <span>📅 {event.date}</span>
                      <span>📍 {event.location}</span>
                    </div>
                  </div>
                  <div>
                    <button
                      className="btn"
                      onClick={() => {
                        setSelectedEventId(event.id);
                        window.scrollTo({ top: 300, behavior: 'smooth' });
                      }}
                    >
                      Register for this Event →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right Column: Forms Panel */}
          <div className="side-panel">
            {/* Event Registration Card */}
            <div className="card">
              <h2>✍️ Student Registration</h2>
              {regMessage && (
                <div className="alert alert-success">
                  <strong>Success!</strong> {regMessage.text}
                </div>
              )}
              {regError && (
                <div className="alert alert-error">
                  <strong>Error:</strong> {regError}
                </div>
              )}
              <form onSubmit={handleRegister}>
                <div className="form-group">
                  <label htmlFor="regEvent">Select Event</label>
                  <select
                    id="regEvent"
                    className="form-control"
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose an Event --</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} ({ev.date})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="studentName">Student Full Name</label>
                  <input
                    id="studentName"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Alex Johnson"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="studentEmail">Student Email</label>
                  <input
                    id="studentEmail"
                    type="email"
                    className="form-control"
                    placeholder="e.g. alex@university.edu"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn" style={{ width: '100%' }} disabled={submittingReg}>
                  {submittingReg ? 'Dispatching Registration...' : 'Complete Registration'}
                </button>
              </form>
            </div>

            {/* MinIO Image Upload Card */}
            <div className="card">
              <h2>🖼️ Upload Event Banner (MinIO)</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                Uploads image directly to MinIO bucket <code>campushub</code> via the API & Gateway.
              </p>
              {uploadMessage && (
                <div className="alert alert-success">
                  <strong>Uploaded!</strong> {uploadMessage}
                </div>
              )}
              {uploadError && (
                <div className="alert alert-error">
                  <strong>Error:</strong> {uploadError}
                </div>
              )}
              <form onSubmit={handleUpload}>
                <div className="form-group">
                  <label htmlFor="imageFile">Select Image (Max 4MB)</label>
                  <input
                    id="imageFile"
                    type="file"
                    accept="image/*"
                    className="form-control"
                    onChange={(e) => setSelectedFile(e.target.files[0] || null)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-secondary" style={{ width: '100%' }} disabled={uploading || !selectedFile}>
                  {uploading ? 'Uploading to MinIO...' : 'Upload Image to Storage'}
                </button>
              </form>

              {uploadedImageUrl && (
                <div className="preview-box">
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>Uploaded Preview:</p>
                  <img src={uploadedImageUrl} alt="Uploaded to MinIO" />
                </div>
              )}
            </div>

            {/* Viva Reference Quick Links */}
            <div className="card" style={{ background: '#f8fafc', fontSize: '0.85rem' }}>
              <h2 style={{ fontSize: '1rem' }}>🔍 Viva Verification Links</h2>
              <ul style={{ paddingLeft: '18px', color: 'var(--text-muted)', lineHeight: '1.8' }}>
                <li><strong>Gateway:</strong> <a href="/" target="_blank" rel="noreferrer">/ (Port 80)</a></li>
                <li><strong>API Health:</strong> <a href="/health" target="_blank" rel="noreferrer">/health</a></li>
                <li><strong>Events API:</strong> <a href="/api/events" target="_blank" rel="noreferrer">/api/events</a></li>
                <li><strong>MailHog UI:</strong> <a href="http://localhost:8025" target="_blank" rel="noreferrer">localhost:8025</a></li>
                <li><strong>RabbitMQ UI:</strong> <a href="http://localhost:15672" target="_blank" rel="noreferrer">localhost:15672</a></li>
                <li><strong>MinIO Console:</strong> <a href="http://localhost:9001" target="_blank" rel="noreferrer">localhost:9001</a></li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
