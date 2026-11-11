/**
 * FleetFlow Real-Time WebSocket Manager
 */
class TelemetrySocket {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 30;
        this.reconnectDelay = 2000;
        this.connect();
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

        this.updateStatus('connecting', 'Connecting...');

        try {
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                this.reconnectAttempts = 0;
                this.updateStatus('connected', 'Live Telemetry');
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Dispatch custom DOM event
                    const customEvent = new CustomEvent('telemetry:update', { detail: data });
                    window.dispatchEvent(customEvent);

                    // Check for milestone events like deliveries
                    if (data.events && data.events.length > 0) {
                        data.events.forEach(ev => {
                            const evEvent = new CustomEvent('telemetry:event', { detail: ev });
                            window.dispatchEvent(evEvent);
                        });
                    }
                } catch (err) {
                    console.error('Error parsing WebSocket payload', err);
                }
            };

            this.socket.onclose = () => {
                this.updateStatus('disconnected', 'Disconnected');
                this.attemptReconnect();
            };

            this.socket.onerror = (err) => {
                console.warn('WebSocket encountered error:', err);
                this.socket.close();
            };
        } catch (e) {
            this.attemptReconnect();
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay);
        }
    }

    updateStatus(state, label) {
        const el = document.getElementById('ws-status');
        const textEl = document.getElementById('ws-status-text');
        if (!el || !textEl) return;

        textEl.textContent = label;
        const dot = el.querySelector('span');

        if (state === 'connected') {
            dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
            el.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-300';
        } else if (state === 'connecting') {
            dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
            el.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-300';
        } else {
            dot.className = 'w-2 h-2 rounded-full bg-rose-400';
            el.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-300';
        }
    }
}

// Initialize telemetry connection globally
window.telemetrySocket = new TelemetrySocket();
