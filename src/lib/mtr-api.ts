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
  lat: number;
  lng: number;
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
  { line: 'TWL', stationId: 'CEN', stationCode: 'CEN', name_tc: '中環', name_en: 'Central', lat: 22.2819, lng: 114.1583 },
  { line: 'TWL', stationId: 'ADM', stationCode: 'ADM', name_tc: '金鐘', name_en: 'Admiralty', lat: 22.2783, lng: 114.1647 },
  { line: 'TWL', stationId: 'TST', stationCode: 'TST', name_tc: '尖沙咀', name_en: 'Tsim Sha Tsui', lat: 22.2988, lng: 114.1722 },
  { line: 'TWL', stationId: 'JOR', stationCode: 'JOR', name_tc: '佐敦', name_en: 'Jordan', lat: 22.3048, lng: 114.1718 },
  { line: 'TWL', stationId: 'YMT', stationCode: 'YMT', name_tc: '油麻地', name_en: 'Yau Ma Tei', lat: 22.3103, lng: 114.1709 },
  { line: 'TWL', stationId: 'MOK', stationCode: 'MOK', name_tc: '旺角', name_en: 'Mong Kok', lat: 22.3193, lng: 114.1694 },
  { line: 'TWL', stationId: 'PRE', stationCode: 'PRE', name_tc: '太子', name_en: 'Prince Edward', lat: 22.3248, lng: 114.1684 },
  { line: 'TWL', stationId: 'SSP', stationCode: 'SSP', name_tc: '深水埗', name_en: 'Sham Shui Po', lat: 22.3310, lng: 114.1626 },
  { line: 'TWL', stationId: 'CSW', stationCode: 'CSW', name_tc: '長沙灣', name_en: 'Cheung Sha Wan', lat: 22.3371, lng: 114.1538 },
  { line: 'TWL', stationId: 'LCK', stationCode: 'LCK', name_tc: '荔枝角', name_en: 'Lai Chi Kok', lat: 22.3424, lng: 114.1465 },
  { line: 'TWL', stationId: 'KWF', stationCode: 'KWF', name_tc: '葵芳', name_en: 'Kwai Fong', lat: 22.3547, lng: 114.1298 },
  { line: 'TWL', stationId: 'KWH', stationCode: 'KWH', name_tc: '葵涌', name_en: 'Kwai Chung', lat: 22.3585, lng: 114.1260 },
  { line: 'TWL', stationId: 'TSW', stationCode: 'TSW', name_tc: '荃灣', name_en: 'Tsuen Wan', lat: 22.3708, lng: 114.1173 },
  
  // Kwun Tong Line (KTL)
  { line: 'KTL', stationId: 'WHA', stationCode: 'WHA', name_tc: '黃埔', name_en: 'Whampoa', lat: 22.3055, lng: 114.1868 },
  { line: 'KTL', stationId: 'HOM', stationCode: 'HOM', name_tc: '何文田', name_en: 'Ho Man Tin', lat: 22.3091, lng: 114.1815 },
  { line: 'KTL', stationId: 'YMT', stationCode: 'YMT', name_tc: '油麻地', name_en: 'Yau Ma Tei', lat: 22.3103, lng: 114.1709 },
  { line: 'KTL', stationId: 'MOK', stationCode: 'MOK', name_tc: '旺角', name_en: 'Mong Kok', lat: 22.3193, lng: 114.1694 },
  { line: 'KTL', stationId: 'NTK', stationCode: 'NTK', name_tc: '旺角東', name_en: 'Mong Kok East', lat: 22.3230, lng: 114.1740 },
  { line: 'KTL', stationId: 'KOT', stationCode: 'KOT', name_tc: '九龍塘', name_en: 'Kowloon Tong', lat: 22.3372, lng: 114.1760 },
  { line: 'KTL', stationId: 'LOF', stationCode: 'LOF', name_tc: '樂富', name_en: 'Lok Fu', lat: 22.3383, lng: 114.1848 },
  { line: 'KTL', stationId: 'WTS', stationCode: 'WTS', name_tc: '黃大仙', name_en: 'Wong Tai Sin', lat: 22.3418, lng: 114.1935 },
  { line: 'KTL', stationId: 'DIH', stationCode: 'DIH', name_tc: '鑽石山', name_en: 'Diamond Hill', lat: 22.3400, lng: 114.2010 },
  { line: 'KTL', stationId: 'CHH', stationCode: 'CHH', name_tc: '彩虹', name_en: 'Choi Hung', lat: 22.3347, lng: 114.2088 },
  { line: 'KTL', stationId: 'KOB', stationCode: 'KOB', name_tc: '九龍灣', name_en: 'Kowloon Bay', lat: 22.3234, lng: 114.2138 },
  { line: 'KTL', stationId: 'NTA', stationCode: 'NTA', name_tc: '牛頭角', name_en: 'Ngau Tau Kok', lat: 22.3175, lng: 114.2183 },
  { line: 'KTL', stationId: 'KWT', stationCode: 'KWT', name_tc: '觀塘', name_en: 'Kwun Tong', lat: 22.3122, lng: 114.2253 },
  { line: 'KTL', stationId: 'LAT', stationCode: 'LAT', name_tc: '藍田', name_en: 'Lam Tin', lat: 22.3064, lng: 114.2328 },
  { line: 'KTL', stationId: 'YAT', stationCode: 'YAT', name_tc: '油塘', name_en: 'Yau Tong', lat: 22.2979, lng: 114.2377 },
  { line: 'KTL', stationId: 'TIK', stationCode: 'TIK', name_tc: '調景嶺', name_en: 'Tiu Keng Leng', lat: 22.3053, lng: 114.2527 },
  
  // Island Line (ISL)
  { line: 'ISL', stationId: 'KET', stationCode: 'KET', name_tc: '堅尼地城', name_en: 'Kennedy Town', lat: 22.2811, lng: 114.1285 },
  { line: 'ISL', stationId: 'HKU', stationCode: 'HKU', name_tc: '香港大學', name_en: 'HKU', lat: 22.2856, lng: 114.1360 },
  { line: 'ISL', stationId: 'SHT', stationCode: 'SHT', name_tc: '西營盤', name_en: 'Sai Ying Pun', lat: 22.2880, lng: 114.1428 },
  { line: 'ISL', stationId: 'SHW', stationCode: 'SHW', name_tc: '上環', name_en: 'Sheung Wan', lat: 22.2884, lng: 114.1519 },
  { line: 'ISL', stationId: 'CEN', stationCode: 'CEN', name_tc: '中環', name_en: 'Central', lat: 22.2819, lng: 114.1583 },
  { line: 'ISL', stationId: 'ADM', stationCode: 'ADM', name_tc: '金鐘', name_en: 'Admiralty', lat: 22.2783, lng: 114.1647 },
  { line: 'ISL', stationId: 'WAC', stationCode: 'WAC', name_tc: '灣仔', name_en: 'Wan Chai', lat: 22.2750, lng: 114.1720 },
  { line: 'ISL', stationId: 'CAB', stationCode: 'CAB', name_tc: '銅鑼灣', name_en: 'Causeway Bay', lat: 22.2798, lng: 114.1815 },
  { line: 'ISL', stationId: 'TIH', stationCode: 'TIH', name_tc: '天后', name_en: 'Tin Hau', lat: 22.2816, lng: 114.1898 },
  { line: 'ISL', stationId: 'FOH', stationCode: 'FOH', name_tc: '炮台山', name_en: 'Fortress Hill', lat: 22.2856, lng: 114.1963 },
  { line: 'ISL', stationId: 'NOP', stationCode: 'NOP', name_tc: '北角', name_en: 'North Point', lat: 22.2910, lng: 114.2000 },
  { line: 'ISL', stationId: 'QUB', stationCode: 'QUB', name_tc: '鰂魚涌', name_en: 'Quarry Bay', lat: 22.2878, lng: 114.2103 },
  { line: 'ISL', stationId: 'TAK', stationCode: 'TAK', name_tc: '太古', name_en: 'Tai Koo', lat: 22.2857, lng: 114.2170 },
  { line: 'ISL', stationId: 'SWH', stationCode: 'SWH', name_tc: '西灣河', name_en: 'Sai Wan Ho', lat: 22.2822, lng: 114.2230 },
  { line: 'ISL', stationId: 'SHM', stationCode: 'SHM', name_tc: '筲箕灣', name_en: 'Shau Kei Wan', lat: 22.2793, lng: 114.2288 },
  { line: 'ISL', stationId: 'HFC', stationCode: 'HFC', name_tc: '杏花邨', name_en: 'Heng Fa Chuen', lat: 22.2771, lng: 114.2380 },
  { line: 'ISL', stationId: 'CHW', stationCode: 'CHW', name_tc: '柴灣', name_en: 'Chai Wan', lat: 22.2685, lng: 114.2335 },
  
  // East Rail Line (EAL)
  { line: 'EAL', stationId: 'ADM', stationCode: 'ADM', name_tc: '金鐘', name_en: 'Admiralty', lat: 22.2783, lng: 114.1647 },
  { line: 'EAL', stationId: 'EXC', stationCode: 'EXC', name_tc: '會展', name_en: 'Exhibition Centre', lat: 22.2783, lng: 114.1745 },
  { line: 'EAL', stationId: 'HOM', stationCode: 'HOM', name_tc: '何文田', name_en: 'Ho Man Tin', lat: 22.3091, lng: 114.1815 },
  { line: 'EAL', stationId: 'MKK', stationCode: 'MKK', name_tc: '旺角東', name_en: 'Mong Kok East', lat: 22.3230, lng: 114.1740 },
  { line: 'EAL', stationId: 'KOT', stationCode: 'KOT', name_tc: '九龍塘', name_en: 'Kowloon Tong', lat: 22.3372, lng: 114.1760 },
  { line: 'EAL', stationId: 'TAW', stationCode: 'TAW', name_tc: '大圍', name_en: 'Tai Wai', lat: 22.3430, lng: 114.1810 },
  { line: 'EAL', stationId: 'SHT', stationCode: 'SHT', name_tc: '沙田', name_en: 'Sha Tin', lat: 22.3540, lng: 114.1850 },
  { line: 'EAL', stationId: 'FOT', stationCode: 'FOT', name_tc: '火炭', name_en: 'Fo Tan', lat: 22.3905, lng: 114.1967 },
  { line: 'EAL', stationId: 'RAC', stationCode: 'RAC', name_tc: '馬場', name_en: 'Racecourse', lat: 22.3993, lng: 114.2023 },
  { line: 'EAL', stationId: 'UNI', stationCode: 'UNI', name_tc: '大學', name_en: 'University', lat: 22.4028, lng: 114.2085 },
  { line: 'EAL', stationId: 'TAP', stationCode: 'TAP', name_tc: '大埔墟', name_en: 'Tai Po Market', lat: 22.4520, lng: 114.1680 },
  { line: 'EAL', stationId: 'FAN', stationCode: 'FAN', name_tc: '粉嶺', name_en: 'Fanling', lat: 22.4910, lng: 114.1390 },
  { line: 'EAL', stationId: 'SHS', stationCode: 'SHS', name_tc: '上水', name_en: 'Sheung Shui', lat: 22.5040, lng: 114.1290 },
  { line: 'EAL', stationId: 'LOW', stationCode: 'LOW', name_tc: '羅湖', name_en: 'Lo Wu', lat: 22.5280, lng: 114.1150 },
  { line: 'EAL', stationId: 'LMC', stationCode: 'LMC', name_tc: '落馬洲', name_en: 'Lok Ma Chau', lat: 22.5140, lng: 114.0640 },
  
  // Tuen Ma Line (TML)
  { line: 'TML', stationId: 'TUM', stationCode: 'TUM', name_tc: '屯門', name_en: 'Tuen Mun', lat: 22.3917, lng: 114.0181 },
  { line: 'TML', stationId: 'SIH', stationCode: 'SIH', name_tc: '兆康', name_en: 'Siu Hong', lat: 22.3888, lng: 114.0370 },
  { line: 'TML', stationId: 'TIS', stationCode: 'TIS', name_tc: '天水圍', name_en: 'Tin Shui Wai', lat: 22.4490, lng: 114.0040 },
  { line: 'TML', stationId: 'LOP', stationCode: 'LOP', name_tc: '朗屏', name_en: 'Long Ping', lat: 22.4465, lng: 114.0075 },
  { line: 'TML', stationId: 'YUL', stationCode: 'YUL', name_tc: '元朗', name_en: 'Yuen Long', lat: 22.4458, lng: 114.0228 },
  { line: 'TML', stationId: 'KSR', stationCode: 'KSR', name_tc: '錦上路', name_en: 'Kam Sheung Road', lat: 22.4340, lng: 114.0490 },
  { line: 'TML', stationId: 'TWW', stationCode: 'TWW', name_tc: '荃灣西', name_en: 'Tsuen Wan West', lat: 22.3689, lng: 114.1050 },
  { line: 'TML', stationId: 'MEF', stationCode: 'MEF', name_tc: '美孚', name_en: 'Mei Foo', lat: 22.3377, lng: 114.1430 },
  { line: 'TML', stationId: 'NAC', stationCode: 'NAC', name_tc: '南昌', name_en: 'Nam Cheong', lat: 22.3280, lng: 114.1540 },
  { line: 'TML', stationId: 'AUS', stationCode: 'AUS', name_tc: '柯士甸', name_en: 'Austin', lat: 22.3050, lng: 114.1720 },
  { line: 'TML', stationId: 'ETS', stationCode: 'ETS', name_tc: '尖東', name_en: 'East Tsim Sha Tsui', lat: 22.2982, lng: 114.1750 },
  { line: 'TML', stationId: 'HUH', stationCode: 'HUH', name_tc: '紅磡', name_en: 'Hung Hom', lat: 22.3033, lng: 114.1815 },
  { line: 'TML', stationId: 'HOM', stationCode: 'HOM', name_tc: '何文田', name_en: 'Ho Man Tin', lat: 22.3091, lng: 114.1815 },
  { line: 'TML', stationId: 'TKW', stationCode: 'TKW', name_tc: '土瓜灣', name_en: 'To Kwa Wan', lat: 22.3130, lng: 114.1875 },
  { line: 'TML', stationId: 'SUW', stationCode: 'SUW', name_tc: '宋皇臺', name_en: 'Sung Wong Toi', lat: 22.3255, lng: 114.1910 },
  { line: 'TML', stationId: 'KAT', stationCode: 'KAT', name_tc: '啟德', name_en: 'Kai Tak', lat: 22.3295, lng: 114.1995 },
  { line: 'TML', stationId: 'DIH', stationCode: 'DIH', name_tc: '鑽石山', name_en: 'Diamond Hill', lat: 22.3400, lng: 114.2010 },
  { line: 'TML', stationId: 'HIK', stationCode: 'HIK', name_tc: '顯徑', name_en: 'Hin Keng', lat: 22.3490, lng: 114.1920 },
  { line: 'TML', stationId: 'TAW', stationCode: 'TAW', name_tc: '大圍', name_en: 'Tai Wai', lat: 22.3430, lng: 114.1810 },
  { line: 'TML', stationId: 'CKT', stationCode: 'CKT', name_tc: '車公廟', name_en: 'Che Kung Temple', lat: 22.3540, lng: 114.1755 },
  { line: 'TML', stationId: 'SHA', stationCode: 'SHA', name_tc: '沙田圍', name_en: 'Sha Tin', lat: 22.3580, lng: 114.1670 },
  { line: 'TML', stationId: 'CIO', stationCode: 'CIO', name_tc: '第一城', name_en: 'City One', lat: 22.3810, lng: 114.2040 },
  { line: 'TML', stationId: 'STW', stationCode: 'STW', name_tc: '石門', name_en: 'Shek Mun', lat: 22.3870, lng: 114.2090 },
  { line: 'TML', stationId: 'TSH', stationCode: 'TSH', name_tc: '大水坑', name_en: 'Tai Shui Hang', lat: 22.4040, lng: 114.2220 },
  { line: 'TML', stationId: 'HCH', stationCode: 'HCH', name_tc: '恆安', name_en: 'Heng On', lat: 22.4140, lng: 114.2280 },
  { line: 'TML', stationId: 'MOS', stationCode: 'MOS', name_tc: '馬鞍山', name_en: 'Ma On Shan', lat: 22.4250, lng: 114.2320 },
  { line: 'TML', stationId: 'WKS', stationCode: 'WKS', name_tc: '烏溪沙', name_en: 'Wu Kai Sha', lat: 22.4320, lng: 114.2420 },
  
  // Tseung Kwan O Line (TKL)
  { line: 'TKL', stationId: 'NOP', stationCode: 'NOP', name_tc: '北角', name_en: 'North Point', lat: 22.2910, lng: 114.2000 },
  { line: 'TKL', stationId: 'QUB', stationCode: 'QUB', name_tc: '鰂魚涌', name_en: 'Quarry Bay', lat: 22.2878, lng: 114.2103 },
  { line: 'TKL', stationId: 'YAT', stationCode: 'YAT', name_tc: '油塘', name_en: 'Yau Tong', lat: 22.2979, lng: 114.2377 },
  { line: 'TKL', stationId: 'TIK', stationCode: 'TIK', name_tc: '調景嶺', name_en: 'Tiu Keng Leng', lat: 22.3053, lng: 114.2527 },
  { line: 'TKL', stationId: 'TKO', stationCode: 'TKO', name_tc: '將軍澳', name_en: 'Tseung Kwan O', lat: 22.3095, lng: 114.2575 },
  { line: 'TKL', stationId: 'LHP', stationCode: 'LHP', name_tc: '康城', name_en: 'LOHAS Park', lat: 22.2950, lng: 114.2710 },
  { line: 'TKL', stationId: 'HAH', stationCode: 'HAH', name_tc: '坑口', name_en: 'Hang Hau', lat: 22.3140, lng: 114.2620 },
  
  // South Island Line (SIL)
  { line: 'SIL', stationId: 'ADM', stationCode: 'ADM', name_tc: '金鐘', name_en: 'Admiralty', lat: 22.2783, lng: 114.1647 },
  { line: 'SIL', stationId: 'OCP', stationCode: 'OCP', name_tc: '海洋公園', name_en: 'Ocean Park', lat: 22.2405, lng: 114.1740 },
  { line: 'SIL', stationId: 'WCH', stationCode: 'WCH', name_tc: '黃竹坑', name_en: 'Wong Chuk Hang', lat: 22.2520, lng: 114.1700 },
  { line: 'SIL', stationId: 'LET', stationCode: 'LET', name_tc: '利東', name_en: 'Lei Tung', lat: 22.2420, lng: 114.1600 },
  { line: 'SIL', stationId: 'SOH', stationCode: 'SOH', name_tc: '海怡半島', name_en: 'South Horizons', lat: 22.2430, lng: 114.1510 },
  
  // Disneyland Resort Line (DRL)
  { line: 'DRL', stationId: 'SUN', stationCode: 'SUN', name_tc: '欣澳', name_en: 'Sunny Bay', lat: 22.3316, lng: 114.0290 },
  { line: 'DRL', stationId: 'DIS', stationCode: 'DIS', name_tc: '迪士尼', name_en: 'Disneyland Resort', lat: 22.3140, lng: 114.0450 },
  
  // Airport Express (AEL)
  { line: 'AEL', stationId: 'HOK', stationCode: 'HOK', name_tc: '香港', name_en: 'Hong Kong', lat: 22.2855, lng: 114.1575 },
  { line: 'AEL', stationId: 'KOW', stationCode: 'KOW', name_tc: '九龍', name_en: 'Kowloon', lat: 22.3050, lng: 114.1680 },
  { line: 'AEL', stationId: 'AIR', stationCode: 'AIR', name_tc: '機場', name_en: 'Airport', lat: 22.3215, lng: 113.9180 },
  { line: 'AEL', stationId: 'AWE', stationCode: 'AWE', name_tc: '博覽館', name_en: 'AsiaWorld-Expo', lat: 22.3215, lng: 113.9440 },
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

    // MTR API returns UP/DOWN as arrays of train objects
    // Each train has: seq, dest, plat, time, ttnt, valid, source
    for (const direction of ['UP', 'DOWN'] as const) {
      const trainList = schedule[direction];
      if (!Array.isArray(trainList)) continue;
      
      for (const train of trainList) {
        if (train.ttnt && train.ttnt !== '-' && train.ttnt !== '') {
          trains.push({
            line: lineCode,
            station: stationCode,
            time: train.time,
            platform: train.plat,
            direction,
            destination: train.dest,
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

// ============ Line Coordinates for Map Polyline ============

/**
 * Get ordered coordinates for all stations on an MTR line.
 * Returns an array of {lat, lng} — straight lines between each station.
 */
export function getMTRLineCoords(lineCode: string): { lat: number; lng: number }[] | null {
  const stations = MTR_STATIONS.filter(s => s.line === lineCode);
  if (stations.length === 0) return null;

  return stations.map(s => ({ lat: s.lat, lng: s.lng }));
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
