'use client'

import { useEffect, useMemo } from 'react'
import { io, Socket } from 'socket.io-client'
import { createClientComponentClient } from '../supabase/client'

let socket: Socket | null = null

/**
 * Get or create Socket.io connection (single source of truth)
 * Connects with Supabase auth token
 */
export function getSocket(): Socket {
  if (!socket) {
    const supabase = createClientComponentClient()
    
    // Get server URL - support both production and local
    let serverUrl = process.env.NEXT_PUBLIC_SERVER_WS_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:10000'
    
    // Normalize URL: convert ws:// to http:// and wss:// to https://
    if (serverUrl.startsWith('ws://')) {
      serverUrl = serverUrl.replace('ws://', 'http://')
    } else if (serverUrl.startsWith('wss://')) {
      serverUrl = serverUrl.replace('wss://', 'https://')
    }

    socket = io(serverUrl, {
      transports: ['websocket'], // WebSocket only - no polling
      autoConnect: false, // Manual connect
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    })

    // Set up auth token refresh
    socket.on('connect', async () => {
      console.log('[Socket] ✅ Connected to poker server')

      // Refresh token on connect
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token && socket) {
        socket.auth = { token: session.access_token }
      }
    })

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason)
    })

    socket.on('connect_error', async (error) => {
      console.error('[Socket] ❌ Connection error:', error.message)
      
      // Refresh token on connection error
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token && socket) {
        socket.auth = { token: session.access_token }
      }
    })

    // Refresh token on reconnection attempt
    socket.on('reconnect_attempt', async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token && socket) {
        socket.auth = { token: session.access_token }
      }
    })
  }

  // Set auth token before returning
  const supabase = createClientComponentClient()
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.access_token && socket) {
      socket.auth = { token: session.access_token }
    }
  })

  return socket
}

/**
 * React hook wrapper for the shared socket instance.
 * Ensures the socket is connected when used in client components.
 */
export function useSocket(): Socket {
  const socketInstance = useMemo(() => getSocket(), [])

  useEffect(() => {
    if (!socketInstance.connected) {
      socketInstance.connect()
    }
  }, [socketInstance])

  return socketInstance
}

/**
 * Disconnect Socket.io connection
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

/**
 * Check if socket is connected
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false
}
