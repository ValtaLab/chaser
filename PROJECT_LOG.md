---
project: chaser
name: 趕車 (Chaser)
status: active
last_deploy: 2026-07-16T07:30:00+08:00
last_version: bus-hop-sum
last_update_by: HermesBPi
---

# 趕車 (Chaser) — 項目進展日誌


### 2026-07-17 | Tracking ETA 尾班車 UI
**App** `TrackingView.tsx`
1. 右上角 ETA 卡：尾班車時仍逐條顯示 K/C（或 MTR 方向），每線顯示 remark；段底統一「⚠️ 尾班車已過」
2. 聯營線補齊：`ensureAllBusOperatorLines`（KMB 主線 + 已知 CTB 雙營）
3. 移除右下角「所選路線尾班車已過」重複橫幅（改由 ETA 卡提示）


### 2026-07-16 | 巴士車程改 hop-sum（USHB 式）
**App + Worker** `bus-hop-sum`
1. 舊：端到端 ×1.7÷11km/h 同站數×2.5 取大 → 307P 富蝶→天后 **~187–190′**（用戶實感 ~90′，USHB 編定 72′）
2. 新：沿 route-stop **逐站距離計 hop 分鐘再加總**（校準 USHB 307P=72′），×1.15 現實緩衝 → **~82′**
3. KMB 查站序試 service_type **1/2/3**（富蝶 307P = type 2）
4. DO / alt-routes / smart-route fallback 改 ~18km/h（唔再 11km/h）


### 2026-07-15 | 誤報「尾班車已過」
1. 舊：任何段 ETA 空或全 -1 → isLastBusPassed（7pm 東鐵都誤報）
2. 新：要有「最後/尾班/已過」remark，或 0–5 點先當尾班；空資料 = noEtaData 唔彈警告
3. 只檢查當前段；alternatives 永遠 refresh 清舊警告



### 2026-07-15 | 巴士車程估算過短
**版本:** bus-ride-est
1. 舊：直線距離÷18km/h、最少5′ → 大埔中心→富蝶 出5′
2. 新：站數×2.5′+緩衝 與 1.7×繞路÷11km/h 取較大；最少8′
3. DO rideTime 同樣調慢（約11km/h + 1.7 detour，floor 8′）



### 2026-07-15 | ETA 跟進度 + 重入 App 持續更新
**App + Worker** `eta-phase-20260715`
1. ETA 卡片只顯示當前要上嘅程（轉車站唔再顯示 307 趕快）
2. GPS 持續 update midJourney phase；接近落車站 → promote 下一程
3. DO 按 phase key resync（轉車／進度變會更新剩餘 ride + 推送狀態）



### 2026-07-15 | Mid-journey auto skip boarding
**App + Worker** `mid-journey-20260715`
1. GPS 對 polyline：離線 <150m + 已過上車站 → 判定途中
2. 時間軸：唔再步行返上車站；車程用剩餘比例
3. DO start 收 `alreadyOnBoard`：該程 onBoard、前程 completed、rideTime 縮短



### 2026-07-15 | 未到轉車站就推 72X 準備上車
**Worker:** chaser-auth `seg-gate-20260715`
1. Root cause: 全部 segment 一開始都係 `waiting`；seg0 上車後仍處理 seg1 approach（大埔 72X ETA≤3′）
2. Fix: 只有第一程 `waiting`，其後 `pending`；`earlierNotDone` gate；onBoard 後 break 唔處理下程
3. 要等前程 `completed` 先 promote 下程 waiting + 推轉乘/準備上車



### 2026-07-15 | False「已上車」push fix
**Worker:** chaser-auth `board-detect-20260715` · DO JourneyMonitor
1. Root cause: boarding if ETA≤5 and any change → countdown 5′→4′ 誤判上車
2. New rule: only when prev first ≤2′ AND (jump +3 or matches prev second bus)
3. Unit cases: countdown no-board; [2,8]→[8,15] board



### 2026-07-15 | 巴士站氣泡唔顯示
**版本:** bus-map-bubbles
1. Root cause: MapView 用 `route.segments`（巴士 coords 多數 0,0）；enrich 結果只入 ref → 唔 re-render
2. 改 `mapSegments` state 餵 MapView（enrich 完更新）
3. MapLabels fallback：stop.location 無效時用 route polyline 首/尾點



### 2026-07-15 | Tracking crash fix (map labels)
**版本:** map-label-crash-fix
1. Root cause: incomplete stop coords (`lat` undefined) → `toFixed` throw; transfer `toStop` optional crash during render
2. Harden MapLabels: typeof+isFinite coord guard, HTML escape, try/catch, single-line divIcon HTML
3. Harden transferMarkers optional chaining
4. SW cache chaser-v9 → **v10** (force iOS PWA refresh)


### 2026-07-15 | 地圖氣泡站名側移 + 精簡
**版本:** map-label-side-offset · commit 8ca78e7
1. 站名氣泡改側向（左右交替）+ 小箭咀指站點，唔再壓住路線
2. 文字精簡：去 emoji／站碼括號／逗號後段，最多 7 字
3. 同一座標只顯示一個氣泡（去重上落／轉車重疊）
4. 轉車 Popup：`轉 站名 → 路線`


### 2026-07-15 00:34 | Background push fix (A-scheme)
**Versions:** chaser-auth c95abc7d · PWA push-fix-20260715
1. DO empty Web Push + pending_notif (unencrypted JSON body rejected by FCM/APNs)
2. ECDSA sig: use raw 64-byte if already P1363
3. DO classic fetch entry /start /stop /status /test-push
4. Guest journey without login (endpoint-hash DO id)
5. TrackingView: do NOT /journey/end on unmount; only 結束旅程
6. Re-subscribe push after permission grant
7. /push-test endpoint; journey start sends confirmation push


### 2026-07-15 07:08 | Push title format
- Title = actionable content (預計站名 / 轉乘…)
- Remove redundant title「趕車 Chaser」(iOS already shows from short_name)
- SW cache v9


### 2026-07-15 07:18 | MTR map route accuracy (EAL)
- Root cause: wrong station coords (太和 ~1.9km off; 大埔墟/沙田/大學 similarly bad)
- Calibrated EAL coords via OSM/Nominatim; 太和 error 1896m → 7m
- getMTRPathStations(line-scoped) + skip Racecourse spur
- Always refresh MTR stop coords on enrichment

## 🚀 最新狀態 (2026-06-29)
**版本:** `cleanup-dead-gps` | **部署時間:** ~10:50 HKT | **狀態:** 運行中  
**部署地址:** https://master.chaser-6ta.pages.dev

### 2026-06-29 | 清理 Dead GPS Code
**版本:** cleanup-dead-gps
1. **移除 `sendBeacon('/location')`** — `TrackingView.tsx` pagehide handler 原本送最後 GPS 到 Worker，但 DO `JourneyMonitor` 從不讀取，係 dead code
2. **移除 debounced `/location` POST** — 每 10s POST GPS 到 Worker 嘅 useEffect 同樣無用
3. **移除 `notifyLocation` function** — `chaser-auth` Worker 入面嘅 `/location` endpoint + route + publicPaths entry
4. **清理 refs** — `locationDebounceRef`, `lastSentLocRef`, `liveLocationRef` 全部移除
5. **不影響功能** — 後台 push 靠 DO ETA 輪詢，唔靠 GPS；前景 GPS 通知（≤500m + ETA ≤5min）不受影響
6. **`handleCron` fallback** — `j.lastLocation` 永遠為 null，自動用 `estimatePos` 估算位置

### 核心功能
- [x] **路線設定**: 巴士/MTR/小巴/電車
- [x] **GPS 定位**: LocationTracker
- [x] **ETA 整合**: KMB/Citybus + MTR + GMB + 電車
- [x] **智能提醒**: TransferAdvice
- [x] **即時 ETA**: LiveETAPanel — 30 秒自動刷新
- [x] **地圖**: Leaflet + 用戶位置 + 路線顯示
- [x] **PWA**: Service Worker + manifest
- [x] **通知**: Notification API + 設定頁 toggle + 到站 proximity 提醒
- [x] **多交通模式**: 巴士 + 港鐵 + 小巴 + 電車
- [x] **路線管理**: 滑動操作 — 編輯 + 刪除
- [x] **用戶系統**: 註冊/登入 + 雲端同步
- [x] **設定頁**: 帳號、通知、資料管理
- [x] **路線驗證**: 自動檢測路線 + 車站選擇器
- [x] **後台行程**: 追蹤畫面可返回主頁，行程繼續運行
- [x] **Proximity 通知**: 接近車站 500m + ETA ≤ 5min → 推送通知
- [x] **智能路線時間**: SmartJourneyTimeline — 步行+等候+乘車時間軸
- [x] **替代路線推薦**: 更快路線自動發現 + AlternativeRouteCard

### UI 導航
- **⚙️ 設定** — 右上角齒輪
- **➕ 新增** — 底部導航，新增路線
- **🏠 首頁** — 路線列表 + ETA
- **📍 追蹤** — GPS 追蹤

---

## 📝 變更歷史

### 2026-06-16 | iOS PWA 通知 Crash 修復 + PushNotification try-catch
**版本:** ios-notification-crash-fix-v1

**問題：** 喺 iOS PWA standalone mode，開啓推播通知 toggle 後進入 tracking view 會出現空白畫面（React component tree crash）。

**Root cause：**
1. `PushNotification.tsx` 嘅 `toggle()` handler 直接 call `Notification.requestPermission()` 但冇 try-catch — iOS PWA 上佢會 throw error，async event handler 嘅 unhandled rejection 會 crash 成個 app
2. TrackingView 入面嘅 notification effects 同樣冇 try-catch，任何 `Notification` API 嘅錯誤都會 propagate 到 React error boundary

**修復：**
1. **PushNotification.tsx** — `toggle()` handler 包 try-catch
2. **TrackingView.tsx** — 所有 notification 相關 code 包 try-catch：
   - `sendNotification()` helper 最外層
   - Progress notification effect（持續顯示通知卡片）
   - Proximity notification effect（到站提醒）
   - Permission request effect（開始旅程時）
3. **Build fix** — try-catch 包 `sendNotification()` 時遺失咗 function closing `}`，修復後 clean build

**Service Worker：** Cache 版本 v4 → v5，強制清除舊 cache

### 2026-06-15 | Debug Panel 合併 + 通知修復 + UI 重構
**版本:** notification-fix-v4

**Debug Panel 合併：**
1. **移除 MainApp debug panel** — 白底 🐛 button 移除，`debugLogs`/`showDebug` state 清除
2. **保留 TrackingView debug panel** — 黃色 🐛 button，黑底黃邊 panel
3. **位置調整** — debug button 由 `bottom-20` 移到 `bottom-32`，避開 SmartJourneyTimeline

**通知功能修復：**
1. **PushNotification.tsx**：
   - Permission denied 時彈 alert 提示用戶去瀏覽器設定允許
   - iOS detection 支援 iPadOS desktop mode（`navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1`）
   - iOS 未加至主屏幕時顯示「iOS 需加至主屏幕」
2. **TrackingView.tsx**：
   - 移除自動 `requestPermission()`（時機差）
   - 開始旅程時自動 request permission（時機啱）
   - iOS PWA 用 `ServiceWorkerRegistration.showNotification()` 代替 `new Notification()`（後者喺 PWA standalone mode 唔支援）
   - 加 `sendNotification()` helper function 自動檢測平台

**路線進度通知（Persistent Notification）：**
1. **進度計算** — 用 haversine 計算用戶位置相對起點/終點嘅百分比
2. **通知內容**：
   ```
   趕車 · 60%
   ▓▓▓▓▓▓░░░░
   富蝶總站 → 銅鑼灣
   ```
3. **更新機制** — 用 `tag: 'journey-progress'` 更新同一個通知（唔會彈新通知）
4. **Silent mode** — `silent: true` 唔會有聲音
5. **Zero coordinates 修復** — 用 `enrichSegmentWithCoords` runtime 修復舊路線嘅 `{lat: 0, lng: 0}` 座標

**UI 重構：**
1. **ETA panel** — 由右上 `right-3` 移去左上 `left-3`，`top-14`（返回鍵下面）
2. **ETA 精簡** — 每個 segment 只顯示 1 個 ETA（最近嗰班），寬度收窄至 180px
3. **智能推薦** — 由大卡片改為細 badge（`🚀 EAL 快 29min`），tap 展開完整卡片
4. **智能推薦位置** — 由 `top-3 left-14` 移到 `bottom-40 right-3`（時間條上方）
5. **時間條壓縮** — 字體 10px → 9px，padding 收窄，arrows 10px → 8px
6. **時間條寬度** — 加 `max-w-[calc(100%-24px)]` 確保唔超出屏幕

**156031 分鐘 bug 修復：**
1. **smart-route.ts**：
   - `estimateRideTime` 加 zero coordinates guard（`{lat: 0, lng: 0}` → 30min 預設）
   - `calculateConfiguredRouteTime` 加 zero coordinates guard（`{lat: 0, lng: 0}` → 2min 預設）

**Service Worker 升級：**
- Cache version v3 → v4，force clear 舊 cache

**已知問題：**
- iOS PWA 通知需要用戶手動開啟（加至主屏幕 → 設定 → 通知）
- 舊路線（2026-06-12 之前創建）可能冇座標，需要 runtime enrich

### 2026-06-10 | 旅程卡片整合 + GPS 追蹤簡化
**版本:** journey-card-integration-v1

1. **旅程卡片整合到路線列表** — `SwipeableRouteCard.tsx` + `MainApp.tsx`：
   - 移除獨立嘅「📍 旅程進行中」banner
   - 活躍旅程喺「我嘅路線」列表中以綠色高亮顯示
   - SwipeableRouteCard 新增 `isActive` 模式：綠色邊框 + 脈衝綠點 + 「追蹤中」badge
   - 活躍卡片顯示「返回」+「結束」按鈕取代「開始」
   - 綠色左側條 + 綠色邊框區分進行中狀態

2. **GPS 追蹤簡化** — `LocationTracker.tsx`：
   - 移除坐標顯示（`lat.toFixed(6), lng.toFixed(6)`）
   - 改為一行 icon：`📍 GPS 追蹤中` + 脈衝綠點
   - 不再顯示具體位置數據

3. **保留後台追蹤** — `display: none` 保持 TrackingView 掛載

### 2026-06-09 | MTR 線路修復 + Proximity 通知 + 後台行程
**版本:** proximity-notify-v1

1. **MTR 線路直連站點** — `mtr-api.ts`：
   - 移除 `getMTRLineCoords` 嘅線性插值（每站之間加 5 個假中間點）
   - 改為直接返回站坐標，站與站之間直線連接
   - 修復港鐵線「走位」問題

2. **統一 MTR 坐標源** — `stop-coords.ts`：
   - 120 行硬編碼 `MTR_COORDS` 替換為 `MTR_STATIONS` 動態生成
   - `mtr-api.ts` 嘅 `MTR_STATIONS` 成為 single source of truth
   - 修復站 marker 同線條坐標偏差

3. **Proximity 到站通知** — `TrackingView.tsx`：
   - `watchPosition` 持續追蹤用戶位置
   - 計算用戶到每個上車站距離（Haversine 公式）
   - 距離 ≤ 500m + ETA ≤ 5 分鐘 → `Notification API` 推送原生通知
   - 每站只通知一次（`useRef<Set>` + Notification tag 防重複）
   - `road-snap.ts` export `haversineMeters` 供重用

4. **通知開關重寫** — `PushNotification.tsx`：
   - 移除 VAPID + Web Push Worker backend 依賴
   - 改用簡單 `Notification API` + `localStorage` 記錄偏好
   - UI 改為 toggle 開關（圓形滑動）
   - iOS Safari 不支援時顯示「需加至主屏幕」文字提示

5. **Settings.tsx 修復**：
   - 刪除本地 `PushToggle` function（用錯 `useState` 做初始化 + call 唔存在嘅 VAPID backend）
   - 改為 import `PushNotification.tsx`

6. **後台行程 + 返回按鈕**：
   - `TrackingView.tsx` — 加 `onBack` prop + 左上角 `←` 返回按鈕
   - `MainApp.tsx` — 行程開始後 TrackingView 用 `display: none` 保持掛載
   - 主頁顯示「📍 旅程進行中」卡片：路線摘要 + 「返回」+ 「結束」按鈕
   - 底部 `📍 追蹤` tab 可跳返行程畫面

### 2026-06-08 | 雲端儲存修復 + Bug Fixes
**版本:** cloud-save-fix-v1  
1. **根因診斷**: 用 Debug panel 證實 `saveToCloud` 靜默失敗 — API 返回錯誤但冇 check `res.ok`
2. **`onSave` callback**: `saveToCloud` 改為 click「儲存路線」時即時觸發，唔再等 `handleDone`（防止用底部導航離開時漏 save）
3. **Error handling**: `saveToCloud` + `syncFromCloud` 加 `res.ok` check，失敗時顯示錯誤
4. **🐛 Debug panel**: 頁面底部可見嘅 debug log，手機唔需要 DevTools 就可以 trace auth/sync/save 流程
5. **`toUpperCase()` 修復**: 路線號碼輸入細楷自動轉大楷（Citybus API 需要大楷）
6. **車站選擇修復**: `onChange` 只 call 一次 `setSegments`，唔再有第二次覆蓋導致選擇消失
7. **SwipeableRouteCard 修復**: 編輯/刪除按鈟預設隱藏，改用 `absolute inset-0` + `bg-slate-800` 覆蓋，左滑才顯示
8. **下拉刷新**: 首頁支援 pull-to-refresh，下拉超過 80px 鬆開觸發雲端同步
9. **編輯模式車站載入**: 進入編輯時自動觸發 `validateAndLoadStops`，顯示上下車站選擇框

### 2026-06-06 | 路線驗證 + 車站選擇器
**版本:** route-validation-v1  
1. 更新 `RouteSetup` — 輸入路線號碼後自動驗證：
   - 500ms debounce 防抖
   - 同時檢測 KMB、Citybus、GMB
   - 綠色光暈 = 路線有效
   - 紅色邊框 = 路線無效
   - 黃色載入中指示
2. 車站滾動選擇器：
   - 驗證成功後自動載入所有車站
   - 下拉選單顯示序號 + 站名
   - 支援方向切換（去程/回程）
   - MTR/電車保持手動輸入
3. 顯示巴士公司標籤（九巴/城巴/小巴）

### 2026-06-06 | 設定頁
**版本:** settings-v1  
1. `Settings` 組件 — 帳號、通知、資料管理

### 2026-06-06 | 用戶認證系統
**版本:** auth-v1  
1. `chaser-auth` Worker + D1 資料庫
2. 雲端路線同步

### 2026-06-06 | 路線滑動管理
**版本:** swipe-v1  
1. `SwipeableRouteCard` — 觸控滑動手勢

### 2026-06-06 | 多交通模式
**版本:** transport-v1  
1. `gmb-api.ts` + `tram-api.ts`

### 2026-06-07 | 路線持久化 + 快取修復
**版本:** persist-fix-v1  
1. **Zustand persist middleware** — 路線存入 localStorage，刷新唔會消失
2. **Service Worker cache** — 靜態資源改 network-first，永遠取最新版
3. **Cache 版本升級** v1 → v2，清除舊 cache
4. **Settings 清除快取** 指向新 cache name

### 2026-06-06 | Web Push 通知
**版本:** push-v1  

### 2026-06-06 | PWA 支援
**版本:** pwa-v1  

### 2026-06-06 | 項目初始化
**版本:** ea8ed7a  
## 2026-06-08 | Route persistence fix

**版本:** persist-merge-v1
1. **Zustand persist** — routes 存入 localStorage
2. **Cloud sync merge** — 唔再 blind overwrite，merge 雲端 + 本地
3. **Service Worker** — network-first + version forced cache clear
4. **_headers** — Clear-Site-Data + no-cache HTML

---

### 2026-06-11 | 智能路線推薦（Smart Journey Timeline）
**版本:** smart-journey-v1

1. **步行時間計算** — `road-snap.ts`：
   - 新增 `walkTimeBetween(from, to)` — OSRM walking profile 計算真實步行時間（分鐘）
   - 新增 `walkDistanceBetween(from, to)` — OSRM walking 計算步行距離
   - 失敗 fallback：haversine × 1.3 ÷ 80m/min（5 km/h 步行速度）

2. **智能行程時間估算** — `eta-service.ts`：
   - 新增 `calculateTotalJourney(route, currentLocation)` — 整合步行 + 等候 + 乘車時間
   - 每段路線：步行至上車站 → 等 ETA → 乘車 → 如有換乘步行至下一段上車站
   - 等候時間 = max(0, nextBusETA - 步行到達時間)
   - 乘車時間：MTR 用站數 × 2.5min，Bus 用 haversine ÷ 0.3 km/min
   - 信心等級：high（ETA < 15min）/ medium（< 30min）/ low（> 30min 或錯誤）

3. **類型定義** — `types/index.ts`：
   - `SmartSegment` — walk/wait/ride 段落描述
   - `SmartRouteRecommendation` — 完整路線推薦（總時間、信心、能否趕上）

4. **UI 組件** — `SmartJourneyTimeline.tsx`：
   - 水平時間軸 pill（🚶藍/🕐黃/🚌綠）+ 總時間 + 信心等級點
   - 點擊展開詳情列表：每段 icon + 描述 + 分鐘
   - 等候超過 15 分鐘顯示 ⚠️ 警告
   - 信心等級：綠點=可靠 / 黃點=一般 / 紅點=不確定

5. **TrackingView 整合**：
   - 500ms debounce 呼叫 `calculateTotalJourney`
   - Timeline 浮動顯示喺 bottom bar 上方（`bottom-16`）
   - 只在有 GPS 定位時計算

### 2026-06-11 | 智能路線推薦（即時計算最佳路線）
**版本:** smart-route-v1
**部署:** https://master.chaser-6ta.pages.dev

**新功能 (17:30):**
1. **智能路線推薦** — `smart-route.ts`：
   - `findSmartRoute()` — 開始行程後即時計算最快路線
   - 輸入：當前 GPS 位置 + 目的地位置 + 用戶配置路線
   - 輸出：最快替代路線選項（最多 3 條）
   - 計算：步行去 MTR 站 + 等候 + 乘車 + 步行去目的地
   - 比較：同用戶配置路線嘅總時間比較

2. **智能路線卡片** — `SmartRouteCard.tsx`：
   - 顯示「🚀 智能推薦」標題
   - 最佳選項：路線名 + 快 X 分鐘 badge
   - 展開可見所有選項（最多 3 條）
   - 每個選項顯示：類型 emoji + 路線名 + 總時間 + 分段詳情
   - 信心等級顏色點（綠/黃/紅）
   - slide-in 動畫

3. **TrackingView 整合**：
   - 新增 `smartRouteRec` state
   - `useEffect`：當 `liveLocation` + `segmentETAs` 有數據時計算
   - 顯示喺 ETA panel 下方（z-index 1002，優先於 AlternativeRouteCard）
   - 30 秒 ETA 刷新時一併更新

**限制：**
- 目前只實現 MTR 直達路線（唔考慮轉乘）
- 未實現巴士 + MTR 混合路線
- 未實現附近巴士站搜索（需要站點數據庫）

---

### 2026-06-11 | 智能替代路線推薦 + Bug Fixes
**版本:** alternative-routes-v4
**部署:** https://master.chaser-6ta.pages.dev

**新功能 (17:15):**
1. **混合 MTR 推薦** — `alternative-routes.ts`：
   - 當用戶搭緊巴士時，自動檢查附近 MTR 站係咪有更快路線
   - 搵起點站 800m 內嘅 MTR 站
   - 搵終點站 1km 內嘅 MTR 站
   - 計算 MTR 總時間：步行去 MTR 站 + 等候 + 乘車 + 步行去目的地
   - 如果 MTR 快過巴士 ≥3 分鐘，就推薦
   - 只考慮直達路線（唔使轉乘）

**Bug Fixes (17:00):**
1. **閃現問題** — `TrackingView.tsx`：
   - `findAlternativesForSegment` 出錯時 `setAlternatives([])` 覆蓋舊數據
   - 改為只有搵到替代路線先更新 state，保留舊數據
2. **重疊問題** — `TrackingView.tsx`：
   - AlternativeRouteCard 冇 absolute 定位，同 ETA panel 重疊
   - 改為 `absolute top-[220px] right-3 w-[280px]`，放喺 ETA panel 下方
   - 加 `pointer-events-auto` + `z-index: 1001` 確保可點擊
3. **地區匹配太嚴格** — `alternative-routes.ts`：
   - `isGoingToward` 嘅地區關鍵詞太少，72 去長沙灣冇被匹配為同一方向
   - 擴展地區關鍵詞：旺角加入「長沙灣、荔枝角、美孚」，其他地區都加入更多相鄰站
   - 新增「觀塘」地區（觀塘、牛頭角、九龍灣、彩虹）
4. **Debug log** — 加入 `[AltRoutes]` console log 幫助診斷

**限制：**
- 用戶起點站（如富蝶總站）只有一條路線時，冇替代路線可推薦（正常情況）
- GMB 小巴 API 目的地為空字串，暫無法推薦小巴替代路線
- MTR 推薦只考慮直達路線，唔考慮轉乘
- 替代路線只用 haversine 估算乘車時間，唔考慮實際路線迂迴

---

### 2026-06-11 | 智能替代路線推薦
**版本:** alternative-routes-v1
**部署:** https://master.chaser-6ta.pages.dev

1. **替代路線發現** — `alternative-routes.ts`：
   - `findAlternativesForSegment()` — 在每個上車站發現更快替代路線
   - KMB/CTB：一次 API call 拎晒同一站所有路線 ETA + 目的地
   - MTR：搵轉乘線替代路線（`findInterchangeLines()`）
   - `isGoingToward()` 目的地匹配：地區關鍵詞（旺角、銅鑼灣等）+ 中文名稱比對
   - `estimateBusRideMinutes()` haversine 估算乘車時間
   - 只推薦快 ≥3 分鐘嘅路線，最多 3 條，按時間節省排序
   - 信心等級：high（≤5min 等）/ medium（≤15min）/ low

2. **UI 組件** — `AlternativeRouteCard.tsx`：
   - 緊湊卡片：「🚀 更快路線」+ 路線名 + 「快 X 分鐘」badge
   - 信心等級顏色點：綠/黃/紅
   - 點擊展開查看詳情：到站時間、方向、目的地
   - 深色主題、手機優先、slide-in 動畫
   - 無替代路線時 `return null`（唔佔空間）

3. **TrackingView 整合**：
   - 新增 `alternatives` state（`SegmentAlternatives[]`）
   - ETA 更新後自動 call `findAlternativesForSegment()`
   - 在 SmartJourneyTimeline 上方渲染每段的 AlternativeRouteCard
   - 30 秒 ETA 刷新時一併更新替代路線

4. **類型定義** — `alternative-routes.ts`：
   - `AlternativeRoute` — 替代路線詳情（路線名、類型、目的地、等車時間、節省時間、信心）
   - `SegmentAlternatives` — 每段路線嘅替代推薦結果

**限制：**
- GMB 小巴 API 目的地為空字串，暫無法推薦小巴替代路線
- `isGoingToward()` 地區 mapping 只覆蓋 10 個主要地區
- `findInterchangeLines()` 只覆蓋主要轉乘站（金鐘、旺角、紅磡等）
- 替代路線只用 haversine 估算乘車時間，唔考慮實際路線迂迴

---

| ⚠️ 已知問題

1. **iOS Safari 通知限制** — `Notification` API 喺純 Safari 瀏覽器唔可用，必須將 app 加至主屏幕（PWA 模式）先有推播通知。設定頁已顯示「需加至主屏幕」提示。
2. **MTR 軌道幾何** — 港鐵線用站坐標直線連接，唔跟實際軌道弧線。受限於冇公開軌道數據，呢個係最好嘅近似。
3. **通知權限** — `Notification.permission` 一旦 denied 就無法由 JS 恢復，用戶需去瀏覽器設定手動允許。
4. **舊路線座標** — 2026-06-12 之前創建嘅路線可能冇巴士站座標（`{lat: 0, lng: 0}`），已用 `enrichSegmentWithCoords` runtime 修復，但需要用戶重新開旅程先會生效。
5. **Service Worker cache** — iOS PWA 嘅 SW cache 好 persistent，uninstall app 唔會清到。如要強制更新，需去 **設定 → Safari → 進階 → 網站資料** 刪除 domain 資料。

## 2026-06-17 — Fix: Joint-operated routes missing Citybus ETAs (307P)

**Problem**: 307P (聯營線 by KMB + Citybus) only showed KMB scheduled departures. Citybus ETAs were completely missing.

**Root cause (2 bugs)**:
1. `RouteSetup.tsx` hardcoded `operator: 'kmb'` for ALL bus routes in `handleSave()` — even Citybus-only routes. KMB found first during validation → only KMB stop IDs stored.
2. `fetchAllETAs` in `TrackingView.tsx` only fetched ETAs from the stored operator (always 'kmb') → Citybus ETAs never fetched.

**Fix**:
1. `RouteSetup.tsx` — Added `getOperator()` helper that checks `validation.company` to determine actual operator. `'CTB'` → `'citybus'`, else `'kmb'`.
2. `bus-api.ts` — Added `findCitybusStopIdByRouteAndName()` with module-level cache. Matches Citybus stop IDs by stop name for joint-operated routes.
3. `TrackingView.tsx` — In `fetchAllETAs`, for KMB bus segments, also checks if Citybus serves the route. If yes, finds matching Citybus stop ID → fetches Citybus ETAs → merges with KMB ETAs sorted by time.

**Verification**: Build OK, deployed, 0 JS errors, fix confirmed in deployed JS chunk.

## 2026-06-17 — Enhanced MTR alternative search for bus routes

**Problem**: `findMTRAlternatives` only checked stations within 800m of origin (too restrictive for 大埔/郊区).
`findConnectingLines` was missing EAL (東鐵綫), TML (屯馬綫), SIL (南港島綫), DRL (迪士尼綫).

**Fix**:
1. `findConnectingLines`: Updated `allLines` from `['TWL','KTL','ISL','TKL','SCL','TCL','AEL']` to `['TWL','KTL','ISL','TKL','EAL','TML','SIL','DRL','AEL']` — added EAL, TML, SIL, DRL; removed SCL, TCL (non-existent in data).
2. `findMTRAlternatives`: Extended search radius from 800m to 2000m practical walk. Proper total time comparison (walkToMTR + wait + ride + walkFromMTR vs busWait + busRide). Added coordinate validation guard.
3. Direction label now uses `getMTRLineName()` for Chinese line names.

**Example**: 大埔中心總站 → 國際調解院
- Walk 186m to 大埔墟站 → EAL → 會展站 (147m from destination) → total ~26min vs bus ~44min
- Previously: 0 alternatives found (EAL missing from connecting lines)
- Now: Should recommend EAL 東鐵綫 大埔墟→會展

## 2026-06-17 — Added mixed transport alternatives (bus→MTR)

**What**: New `findMixedAlternatives()` function that finds bus→MTR combinations.

**How it works**:
1. Gets area keyword from user's stop name (e.g. "大埔" from "大埔中心總站")
2. Fetches ALL KMB routes (cached) → filters by origin area matching → skips user's route
3. For each candidate route, checks if destination text contains an MTR station name
4. If the MTR station connects toward user's destination (same line), calculates total time:
   bus_wait + bus_ride_to_station + walk_to_platform + mtr_wait + mtr_ride + walk_from_mtr
5. Compares with current bus total time, recommends if saves ≥3 min

**Example for 307 大埔中心→國際調解院**:
- 🚌 72X 富蝶總站→旺角柏景灣 → 🚇 TWL 旺角→金鐘
- 🚌 271 大埔→尖沙咀 → 🚇 TWL 尖沙咀→金鐘
- 🚇 Pure MTR: 大埔墟站→會展站 (walk to station)

|**Fixed**: `findConnectingLines` added EAL, TML, SIL, DRL. MTR radius 800→2000m.

## 2026-06-19 — Fix: Citybus ETA lookup blocking main ETA render (slow load)

**版本:** citybus-eta-nonblocking-v1

**Problem**: 307P 路線第一次 load ETA 超慢（~19 API calls），Citybus API 嘅逐站 lookup blocking 咗主 KMB ETA 渲染。

**Root cause**: `fetchAllETAs()` 入面每個 KMB 巴士 segment 都會 call `findCitybusStopIdByRouteAndName()` → 內部 fetch 城巴路線全部車站 + 逐一 match → 一條 307 路線 ~16 個站 => 約 19 個 API calls chain 先出到 ETA。

**Fix**:
1. `TrackingView.tsx` — 抽走 Citybus lookup 做獨立 `fetchCitybusETAs()` function
2. `fetchAllETAs()` 只 fetch KMB ETA（主要 operator）→ **即時顯示**
3. `fetchAllETAs()` 完成後 background fire `fetchCitybusETAs()`（非阻塞）
4. Citybus cache（module-level Map）跨 re-render 保留
5. Citybus ETA 用 `setSegmentETAs(prev => {...})` merge 入現有資料，唔會覆蓋 KMB ETA

**Effect**:
- First load: KMB ETA 1秒內顯示，Citybus 幾秒後 background 到
- 30s refresh: Citybus cache warm → 只需多 1 個 API call
- 用戶唔會見到空白 loading 等所有 ETA

**Verification**: Build OK, deploy 成功, 0 JS errors, 307P 正常顯示班次。

## 2026-06-19 — 全新 Icon 設計 (C Concept + Pin + Bullseye)

**版本:** icon-redesign-v1a

**設計過程：**
1. 用 designer agent（kimi-k2.7-code @ opencode-go）生成多個概念
2. 最終揀選「大 C」概念 — C 字母的兩個端點作為起點/終點
3. 起點：藍色圓點（代表「你」），終點：紫色 bullseye target（代表「目的地」）
4. 多次迭代優化：粗度、同心、端點大小

**最終規格：**
- C stroke: 50px，漸變 sky#38bdf8 → blue#60a5fa → purple#a78bfa
- Pin 起點：r=40px，同心於 C 頂端 (379,170)
- Bullseye 終點：outer r=40px，同心於 C 底端 (379,342)
- 背景: #0f172a, rounded rect rx=112
- 移除 emoji 🏃 同「趕車」文字

**更新檔案：**
- `public/icon-512x512.svg` — SVG 源檔
- `public/icon-512x512.png` — 512x512 PNG
- `public/icon-192x192.png` — 192x192 PNG (PWA manifest + notification)
- `public/icon-design-v1a.svg` — 設計稿
- `src/app/favicon.ico` — 瀏覽器 favicon
- `src/components/AuthScreen.tsx` — login page logo (🏃 emoji → SVG 新 icon)

**驗證：** 0 JS errors, login page 顯示新 logo, PWA icons 已更新

## 2026-06-17 — Fix: Citybus stop name matching + Icon v1a + Header PNG

**版本:** `icon-v1a-header-png`

### Icon 修正
- PWA icon 由 SVG 設計改為直接用 v1a design（空心 C + 藍點，冇三角形）
- Header icon 由白色 SVG 改為 `<img src="/icon-192-v2.png">`，同 PWA icon 一致
- Settings about 頁 icon 同步更新

### Citybus 307P 停站 matching 修復
- **問題**：KMB stop name 有 `(TP576)` suffix 而 Citybus 用 `廣福邨, 大埔公路` comma format，`findCitybusStopIdByRouteAndName()` 無法 match
- **修復**：matching 時 strip KMB input name 嘅 parenthetical suffix (`(TPxxx)`) 再重試；Citybus name map 同時儲存 comma-stripped base name（`港運城, 英皇道` → 同時存 `港運城`）
- 而家可以 match 到：廣福邨、大埔中心、太和廣場、港運城、炮台山站、清風街等

**驗證：** 0 JS errors, UI 正常，icon 正確顯示 v1a design