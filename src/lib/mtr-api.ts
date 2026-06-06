// MTR API client for train ETA
// https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv
// https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php

const MTR_ETA_BASE = 'https://rt.data.gov.hk/v1/transport/mtr';

export interface MTRLine {
  code: string;
  name_tc: string;
  name_en: string;
}

export interface MTRStation {
  line: string;
  stationId: string;
  stationCode: string;
  name_tc: string;
  name_en: string;
}

export interface MTRETA {
  line: string;
  station: string;
  time: string;       // HH:MM:SS
  platform: string;
  direction: string;
  destination: string;
  ttnt: string;        // Time to next train (minutes)
}

// MTR Lines
export const MTR_LINES: MTRLine[] = [
  { code: 'AEL', name_tc: '機場快綫', name_en: 'Airport Express' },
  { code: 'TML', name_tc: '屯馬綫', name_en: 'Tuen Ma Line' },
  { code: 'TKL', name_tc: '將軍澳綫', name_en: 'Tseung Kwan O Line' },
  { code: 'TWL', name_tc: '荃灣綫', name_en: 'Tsuen Wan Line' },
  { code: 'ISL', name_tc: '港島綫', name_en: 'Island Line' },
  { code: 'KTL', name_tc: '觀塘綫', name_en: 'Kwun Tong Line' },
  { code: 'EAL', name_tc: '東鐵綫', name_en: 'East Rail Line' },
  { code: 'SIL', name_tc: '南港島綫', name_en: 'South Island Line' },
  { code: 'DRL', name_tc: '迪士尼綫', name_en: 'Disneyland Resort Line' },
];

// Common MTR stations with codes
export const MTR_STATIONS: MTRStation[] = [
  // Tsuen Wan Line (TWL)
  { line: 'TWL', stationId: 'CEN', stationCode: 'CEN', name_tc: '中環', name_en: 'Central' },
  { line: 'TWL', stationId: 'ADM', stationCode: 'ADM', name_tc: '金鐘', name_en: 'Admiralty' },
  { line: 'TWL', stationId: 'TST', stationCode: 'TST', name_tc: '尖沙咀', name_en: 'Tsim Sha Tsui' },
  { line: 'TWL', stationId: 'JOR', stationCode: 'JOR', name_tc: '佐敦', name_en: 'Jordan' },
  { line: 'TWL', stationId: 'YMT', stationCode: 'YMT', name_tc: '油麻地', name_en: 'Yau Ma Tei' },
  { line: 'TWL', stationId: 'MOK', stationCode: 'MOK', name_tc: '旺角', name_en: 'Mong Kok' },
  { line: 'TWL', stationId: 'PRE', stationCode: 'PRE', name_tc: '太子', name_en: 'Prince Edward' },
  { line: 'TWL', stationId: 'SSP', stationCode: 'SSP', name_tc: '深水埗', name_en: 'Sham Shui Po' },
  { line: 'TWL', stationId: 'CSW', stationCode: 'CSW', name_tc: '長沙灣', name_en: 'Cheung Sha Wan' },
  { line: 'TWL', stationId: 'LCK', stationCode: 'LCK', name_tc: '荔枝角', name_en: 'Lai Chi Kok' },
  { line: 'TWL', stationId: 'KWF', stationCode: 'KWF', name_tc: '葵芳', name_en: 'Kwai Fong' },
  { line: 'TWL', stationId: 'KWH', stationCode: 'KWH', name_tc: '葵涌', name_en: 'Kwai Chung' },
  { line: 'TWL', stationId: 'TWH', stationCode: 'TWH', name_tc: '荃灣', name_en: 'Tsuen Wan' },
  
  // Kwun Tong Line (KTL)
  { line: 'KTL', stationId: 'WHA', stationCode: 'WHA', name_tc: '黃埔', name_en: 'Whampoa' },
  { line: 'KTL', stationId: 'HOM', stationCode: 'HOM', name_tc: '何文田', name_en: 'Ho Man Tin' },
  { line: 'KTL', stationId: 'YMT', stationCode: 'YMT', name_tc: '油麻地', name_en: 'Yau Ma Tei' },
  { line: 'KTL', stationId: 'MOK', stationCode: 'MOK', name_tc: '旺角', name_en: 'Mong Kok' },
  { line: 'KTL', stationId: 'NTK', stationCode: 'NTK', name_tc: '旺角東', name_en: 'Mong Kok East' },
  { line: 'KTL', stationId: 'KOT', stationCode: 'KOT', name_tc: '九龍塘', name_en: 'Kowloon Tong' },
  { line: 'KTL', stationId: 'LOF', stationCode: 'LOF', name_tc: '樂富', name_en: 'Lok Fu' },
  { line: 'KTL', stationId: 'WTS', stationCode: 'WTS', name_tc: '黃大仙', name_en: 'Wong Tai Sin' },
  { line: 'KTL', stationId: 'DIH', stationCode: 'DIH', name_tc: '鑽石山', name_en: 'Diamond Hill' },
  { line: 'KTL', stationId: 'CHH', stationCode: 'CHH', name_tc: '彩虹', name_en: 'Choi Hung' },
  { line: 'KTL', stationId: 'KOB', stationCode: 'KOB', name_tc: '九龍灣', name_en: 'Kowloon Bay' },
  { line: 'KTL', stationId: 'NTA', stationCode: 'NTA', name_tc: '牛頭角', name_en: 'Ngau Tau Kok' },
  { line: 'KTL', stationId: 'KWT', stationCode: 'KWT', name_tc: '觀塘', name_en: 'Kwun Tong' },
  { line: 'KTL', stationId: 'LAT', stationCode: 'LAT', name_tc: '藍田', name_en: 'Lam Tin' },
  { line: 'KTL', stationId: 'YAT', stationCode: 'YAT', name_tc: '油塘', name_en: 'Yau Tong' },
  { line: 'KTL', stationId: 'TIK', stationCode: 'TIK', name_tc: '調景嶺', name_en: 'Tiu Keng Leng' },
  
  // Island Line (ISL)
  { line: 'ISL', stationId: 'KET', stationCode: 'KET', name_tc: '堅尼地城', name_en: 'Kennedy Town' },
  { line: 'ISL', stationId: 'HKU', stationCode: 'HKU', name_tc: '香港大學', name_en: 'HKU' },
  { line: 'ISL', stationId: 'SHT', stationCode: 'SHT', name_tc: '西營盤', name_en: 'Sai Ying Pun' },
  { line: 'ISL', stationId: 'SHW', stationCode: 'SHW', name_tc: '上環', name_en: 'Sheung Wan' },
  { line: 'ISL', stationId: 'CEN', stationCode: 'CEN', name_tc: '中環', name_en: 'Central' },
  { line: 'ISL', stationId: 'ADM', stationCode: 'ADM', name_tc: '金鐘', name_en: 'Admiralty' },
  { line: 'ISL', stationId: 'WAC', stationCode: 'WAC', name_tc: '灣仔', name_en: 'Wan Chai' },
  { line: 'ISL', stationId: 'CAB', stationCode: 'CAB', name_tc: '銅鑼灣', name_en: 'Causeway Bay' },
  { line: 'ISL', stationId: 'TIH', stationCode: 'TIH', name_tc: '天后', name_en: 'Tin Hau' },
  { line: 'ISL', stationId: 'FOH', stationCode: 'FOH', name_tc: '炮台山', name_en: 'Fortress Hill' },
  { line: 'ISL', stationId: 'NOP', stationCode: 'NOP', name_tc: '北角', name_en: 'North Point' },
  { line: 'ISL', stationId: 'QUB', stationCode: 'QUB', name_tc: '鰂魚涌', name_en: 'Quarry Bay' },
  { line: 'ISL', stationId: 'TAK', stationCode: 'TAK', name_tc: '太古', name_en: 'Tai Koo' },
  { line: 'ISL', stationId: 'SWH', stationCode: 'SWH', name_tc: '西灣河', name_en: 'Sai Wan Ho' },
  { line: 'ISL', stationId: 'SHM', stationCode: 'SHM', name_tc: '筲箕灣', name_en: 'Shau Kei Wan' },
  { line: 'ISL', stationId: 'HFC', stationCode: 'HFC', name_tc: '杏花邨', name_en: 'Heng Fa Chuen' },
  { line: 'ISL', stationId: 'CHW', stationCode: 'CHW', name_tc: '柴灣', name_en: 'Chai Wan' },
];

// ============ ETA ============

export async function getMTRETA(
  lineCode: string,
  stationCode: string
): Promise<MTRETA[]> {
  try {
    const res = await fetch(
      `${MTR_ETA_BASE}/getSchedule.php?line=${lineCode}&sta=${stationCode}`
    );
    const data = await res.json();
    
    const trains: MTRETA[] = [];
    const schedule = data?.data?.[`${lineCode}-${stationCode}`];
    
    if (!schedule) return [];

    // Process UP direction
    if (schedule.UP) {
      for (const [dest, trains_list] of Object.entries(schedule.UP)) {
        for (const train of (trains_list as Array<{ time: string; ttnt: string; platform: string }>)) {
          trains.push({
            line: lineCode,
            station: stationCode,
            time: train.time,
            platform: train.platform,
            direction: 'UP',
            destination: dest,
            ttnt: train.ttnt,
          });
        }
      }
    }

    // Process DOWN direction
    if (schedule.DOWN) {
      for (const [dest, trains_list] of Object.entries(schedule.DOWN)) {
        for (const train of (trains_list as Array<{ time: string; ttnt: string; platform: string }>)) {
          trains.push({
            line: lineCode,
            station: stationCode,
            time: train.time,
            platform: train.platform,
            direction: 'DOWN',
            destination: dest,
            ttnt: train.ttnt,
          });
        }
      }
    }

    return trains;
  } catch (err) {
    console.error('MTR ETA fetch error:', err);
    return [];
  }
}

// ============ Station Lookup ============

export function findStation(nameOrCode: string): MTRStation | undefined {
  const q = nameOrCode.toLowerCase();
  return MTR_STATIONS.find(
    s => s.stationCode.toLowerCase() === q ||
         s.name_tc === nameOrCode ||
         s.name_en.toLowerCase() === q
  );
}

export function getLineStations(lineCode: string): MTRStation[] {
  return MTR_STATIONS.filter(s => s.line === lineCode);
}

export function getInterchangeStations(stationCode: string): MTRStation[] {
  return MTR_STATIONS.filter(s => s.stationCode === stationCode);
}
