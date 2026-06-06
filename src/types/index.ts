// Core types for Chaser app

export interface Location {
  lat: number;
  lng: number;
}

export interface Stop {
  id: string;
  name: string;
  nameZh: string;
  location: Location;
  routes: string[];
}

export interface Route {
  id: string;
  name: string;
  type: 'bus' | 'mtr' | 'minibus' | 'tram' | 'ferry';
  operator: 'kmb' | 'citybus' | 'mtr' | 'nlb' | 'gmb';
  stops: Stop[];
}

export interface ETA {
  routeId: string;
  stopId: string;
  nextArrival: Date;
  minutesAway: number;
  destination: string;
}

export interface TransferPoint {
  id: string;
  name: string;
  nameZh: string;
  location: Location;
  fromRoute: Route;
  toRoute: Route;
  walkingTime: number; // minutes
}

export interface CommuteRoute {
  id: string;
  name: string;
  direction: 'to_work' | 'to_home';
  segments: CommuteSegment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CommuteSegment {
  id: string;
  route: Route;
  fromStop: Stop;
  toStop: Stop;
  transferTo?: TransferPoint;
}

export interface Journey {
  id: string;
  routeId: string;
  startTime: Date;
  currentSegmentIndex: number;
  status: 'active' | 'completed' | 'cancelled';
  location?: Location;
}

export interface Notification {
  id: string;
  type: 'transfer_approaching' | 'eta_update' | 'missed_transfer' | 'suggestion';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

export interface UserPreferences {
  notifyBeforeTransfer: number; // minutes
  language: 'zh-HK' | 'en';
  darkMode: boolean;
}
