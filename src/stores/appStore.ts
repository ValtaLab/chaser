import { create } from 'zustand';
import type { CommuteRoute, Journey, ETA, Location, Notification } from '@/types';

interface AppState {
  // Routes
  routes: CommuteRoute[];
  activeRoute: CommuteRoute | null;
  
  // Journey
  currentJourney: Journey | null;
  currentLocation: Location | null;
  
  // ETA
  etas: ETA[];
  
  // Notifications
  notifications: Notification[];
  unreadCount: number;
  
  // UI
  isTracking: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setRoutes: (routes: CommuteRoute[]) => void;
  addRoute: (route: CommuteRoute) => void;
  removeRoute: (id: string) => void;
  updateRoute: (id: string, updates: Partial<CommuteRoute>) => void;
  setActiveRoute: (route: CommuteRoute | null) => void;
  
  startJourney: (routeId: string) => void;
  endJourney: () => void;
  updateLocation: (location: Location) => void;
  
  setETAs: (etas: ETA[]) => void;
  
  addNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  // Initial state
  routes: [],
  activeRoute: null,
  currentJourney: null,
  currentLocation: null,
  etas: [],
  notifications: [],
  unreadCount: 0,
  isTracking: false,
  isLoading: false,
  error: null,
  
  // Route actions
  setRoutes: (routes) => set({ routes }),
  addRoute: (route) => set((state) => ({ routes: [...state.routes, route] })),
  removeRoute: (id) => set((state) => ({ 
    routes: state.routes.filter(r => r.id !== id) 
  })),
  updateRoute: (id, updates) => set((state) => ({
    routes: state.routes.map(r => r.id === id ? { ...r, ...updates, updatedAt: new Date() } : r)
  })),
  setActiveRoute: (route) => set({ activeRoute: route }),
  
  // Journey actions
  startJourney: (routeId) => set((state) => {
    const journey: Journey = {
      id: `journey-${Date.now()}`,
      routeId,
      startTime: new Date(),
      currentSegmentIndex: 0,
      status: 'active',
    };
    return { currentJourney: journey, isTracking: true };
  }),
  endJourney: () => set({ currentJourney: null, isTracking: false }),
  updateLocation: (location) => set({ currentLocation: location }),
  
  // ETA actions
  setETAs: (etas) => set({ etas }),
  
  // Notification actions
  addNotification: (notification) => set((state) => ({
    notifications: [notification, ...state.notifications],
    unreadCount: state.unreadCount + 1,
  })),
  markNotificationRead: (id) => set((state) => ({
    notifications: state.notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ),
    unreadCount: Math.max(0, state.unreadCount - 1),
  })),
  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),
  
  // UI actions
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}));
