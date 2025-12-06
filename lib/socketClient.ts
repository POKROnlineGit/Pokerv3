import { io, Socket } from 'socket.io-client'
import { createClientComponentClient } from './supabaseClient'

let socket: Socket | null = null
let connectionPromise: Promise<Socket | null> | null = null
let connectionFailed = false

/**
 * Get or create Socket.io connection
 * Authenticates with Supabase session token
 * Returns null if connection fails (graceful degradation)
 */
export async function getSocket(): Promise<Socket | null> {
  // If we've already failed to connect, don't retry immediately
  if (connectionFailed && !socket?.connected) {
    return null
  }

  if (socket?.connected) {
    return socket
  }

  if (connectionPromise) {
    return connectionPromise
  }

  connectionPromise = (async () => {
    try {
      const supabase = createClientComponentClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        console.warn('[Socket] No authentication token available')
        connectionFailed = true
        return null
      }

      const wsUrl = process.env.NEXT_PUBLIC_SERVER_WS_URL || 'ws://localhost:4000'
      
      socket = io(wsUrl, {
        auth: {
          token: session.access_token,
        },
        transports: ['websocket', 'polling'],
        reconnection: false, // Disable auto-reconnection to avoid spam
        timeout: 5000, // 5 second timeout
        autoConnect: true,
      })

      // Set up event handlers
      socket.on('connect', () => {
        console.log('[Socket] Connected to server')
        connectionFailed = false
      })

      socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason)
        if (reason === 'io server disconnect') {
          // Server disconnected, don't retry
          connectionFailed = true
        }
      })

      socket.on('error', (error) => {
        console.warn('[Socket] Error:', error)
      })

      socket.on('connect_error', (error) => {
        console.warn('[Socket] Connection error:', error.message)
        connectionFailed = true
        // Don't throw - return null instead
      })

      // Wait for connection with timeout
      return new Promise<Socket | null>((resolve) => {
        const timeout = setTimeout(() => {
          if (!socket?.connected) {
            console.warn('[Socket] Connection timeout - server may not be running')
            connectionFailed = true
            if (socket) {
              socket.disconnect()
              socket = null
            }
            resolve(null)
          }
        }, 5000)

        socket.once('connect', () => {
          clearTimeout(timeout)
          resolve(socket)
        })

        socket.once('connect_error', () => {
          clearTimeout(timeout)
          if (socket) {
            socket.disconnect()
            socket = null
          }
          resolve(null)
        })
      })
    } catch (error) {
      console.warn('[Socket] Failed to initialize:', error)
      connectionFailed = true
      return null
    }
  })()

  try {
    const result = await connectionPromise
    connectionPromise = null
    return result
  } catch (error) {
    connectionPromise = null
    connectionFailed = true
    return null
  }
}

/**
 * Disconnect Socket.io connection
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  connectionPromise = null
  connectionFailed = false // Reset on manual disconnect
}

/**
 * Check if socket is connected
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false
}

