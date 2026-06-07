// Hong Kong Tramways API client
// ETA API currently under upgrade — using static stop data

export interface TramStop {
  code: string;
  name_tc: string;
  name_en: string;
  name_sc: string;
  lat: number;
  lng: number;
}

// Major tram stops with coordinates
export const TRAM_STOPS: TramStop[] = [
  // Westbound (Kennedy Town → Shau Kei Wan)
  { code: 'KTT', name_tc: '堅尼地城總站', name_en: 'Kennedy Town Terminus', name_sc: '坚尼地城总站', lat: 22.2810, lng: 114.1280 },
  { code: 'WST', name_tc: '石塘咀總站', name_en: 'Shek Tong Tsui Terminus', name_sc: '石塘咀总站', lat: 22.2830, lng: 114.1340 },
  { code: 'WMT', name_tc: '西港城總站', name_en: 'Western Market Terminus', name_sc: '西港城总站', lat: 22.2880, lng: 114.1520 },
  { code: 'SHT', name_tc: '上環', name_en: 'Sheung Wan', name_sc: '上环', lat: 22.2860, lng: 114.1520 },
  { code: 'CEN', name_tc: '中環', name_en: 'Central', name_sc: '中环', lat: 22.2810, lng: 114.1580 },
  { code: 'ADM', name_tc: '金鐘', name_en: 'Admiralty', name_sc: '金钟', lat: 22.2790, lng: 114.1640 },
  { code: 'WAC', name_tc: '灣仔', name_en: 'Wan Chai', name_sc: '湾仔', lat: 22.2750, lng: 114.1710 },
  { code: 'CAB', name_tc: '銅鑼灣', name_en: 'Causeway Bay', name_sc: '铜锣湾', lat: 22.2700, lng: 114.1810 },
  { code: 'TIH', name_tc: '天后', name_en: 'Tin Hau', name_sc: '天后', lat: 22.2830, lng: 114.1920 },
  { code: 'NOP', name_tc: '北角', name_en: 'North Point', name_sc: '北角', lat: 22.2910, lng: 114.2000 },
  { code: 'QUB', name_tc: '鰂魚涌', name_en: 'Quarry Bay', name_sc: '鲗鱼涌', lat: 22.2880, lng: 114.2090 },
  { code: 'TAK', name_tc: '太古', name_en: 'Tai Koo', name_sc: '太古', lat: 22.2850, lng: 114.2150 },
  { code: 'SWH', name_tc: '西灣河', name_en: 'Sai Wan Ho', name_sc: '西湾河', lat: 22.2820, lng: 114.2210 },
  { code: 'SHM', name_tc: '筲箕灣', name_en: 'Shau Kei Wan', name_sc: '筲箕湾', lat: 22.2790, lng: 114.2290 },
  { code: 'SKT', name_tc: '筲箕灣總站', name_en: 'Shau Kei Wan Terminus', name_sc: '筲箕湾总站', lat: 22.2790, lng: 114.2290 },
  // Happy Valley branch
  { code: 'HVT', name_tc: '跑馬地總站', name_en: 'Happy Valley Terminus', name_sc: '跑马地总站', lat: 22.2710, lng: 114.1850 },
];

// Tram schedule (approximate — trams run every 1-2 minutes during peak, 3-5 min off-peak)
export interface TramSchedule {
  interval_minutes: number;
  first_tram: string; // HH:MM
  last_tram: string;  // HH:MM
}

export const TRAM_SCHEDULE: TramSchedule = {
  interval_minutes: 3, // Average interval
  first_tram: '06:00',
  last_tram: '23:00',
};

// Find tram stop by code or name
export function findTramStop(query: string): TramStop | undefined {
  const q = query.toLowerCase();
  return TRAM_STOPS.find(
    s => s.code.toLowerCase() === q ||
         s.name_tc === query ||
         s.name_en.toLowerCase() === q
  );
}

// Get estimated next tram time (static schedule)
export function getEstimatedTramTime(): { minutesAway: number; remark: string }[] {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // Check if tram is running
  if (hour < 6 || (hour >= 23 && minute > 0)) {
    return [{ minutesAway: -1, remark: '電車服務已結束' }];
  }

  // Peak hours: 7-9, 17-19 → shorter interval
  const isPeak = (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
  const interval = isPeak ? 2 : 4;

  // Estimate based on current time
  const minutesSinceHour = minute;
  const nextTramIn = interval - (minutesSinceHour % interval);

  return [
    { minutesAway: nextTramIn, remark: isPeak ? '繁忙時間' : '' },
    { minutesAway: nextTramIn + interval, remark: '' },
    { minutesAway: nextTramIn + interval * 2, remark: '' },
  ];
}

// Get all stop codes for a route
export function getTramRouteStops(direction: 'westbound' | 'eastbound'): TramStop[] {
  const mainStops = TRAM_STOPS.filter(s => s.code !== 'HVT');
  return direction === 'westbound' ? [...mainStops].reverse() : mainStops;
}
