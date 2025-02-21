import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children, enabled = true }) => {
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Skip socket initialization if not enabled (e.g., on login/signup pages)
    if (!enabled) {
      return;
    }
    const initializeSocket = () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, skipping socket initialization');
        return;
      }

      // Clean up existing socket
      if (socketRef.current) {
        console.log('Cleaning up existing socket');
        socketRef.current.disconnect();
        socketRef.current.close();
      }

      console.log('Initializing socket with token');
      const newSocket = io('http://localhost:4000', {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        timeout: 10000,
        forceNew: true
      });

      newSocket.on('connect', () => {
        console.log('Socket connected successfully');
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        if (reason === 'io server disconnect') {
          setTimeout(() => {
            newSocket.connect();
          }, 1000);
        }
      });

      newSocket.on('error', (error) => {
        console.error('Socket error:', error);
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    };

    // Initialize socket when component mounts
    initializeSocket();

    // Handle token changes
    const handleStorageChange = (e) => {
      if (e.key === 'token') {
        console.log('Token changed, reinitializing socket');
        initializeSocket();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Cleanup function
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (socketRef.current) {
        console.log('Cleaning up socket connection');
        socketRef.current.disconnect();
        socketRef.current.close();
        socketRef.current = null;
        setSocket(null);
      }
    };
  }, []); // Empty dependency array - only run on mount/unmount

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
