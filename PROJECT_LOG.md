---
project: chaser
name: 趕車 (Chaser)
status: active
last_deploy: 2026-06-06T22:30:00+08:00
last_version: route-validation-v1
last_update_by: HermesBPi
---

# 趕車 (Chaser) — 項目進展日誌

## 🚀 最新狀態 (2026-06-06)
**版本:** `route-validation-v1` | **部署時間:** 22:30 HKT | **狀態:** 運行中  
**部署地址:** https://master.chaser-6ta.pages.dev

### 核心功能
- [x] **路線設定**: 巴士/MTR/小巴/電車
- [x] **GPS 定位**: LocationTracker
- [x] **ETA 整合**: KMB/Citybus + MTR + GMB + 電車
- [x] **智能提醒**: TransferAdvice
- [x] **即時 ETA**: LiveETAPanel — 30 秒自動刷新
- [x] **地圖**: Leaflet + 用戶位置
- [x] **PWA**: Service Worker + manifest
- [x] **Web Push 通知**: VAPID + Worker backend
- [x] **多交通模式**: 巴士 + 港鐵 + 小巴 + 電車
- [x] **路線管理**: 滑動操作 — 編輯 + 刪除
- [x] **用戶系統**: 註冊/登入 + 雲端同步
- [x] **設定頁**: 帳號、通知、資料管理
- [x] **路線驗證**: 自動檢測路線 + 車站選擇器

### UI 導航
- **⚙️ 設定** — 右上角齒輪
- **➕ 新增** — 底部導航，新增路線
- **🏠 首頁** — 路線列表 + ETA
- **📍 追蹤** — GPS 追蹤

---

## 📝 變更歷史

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

### 2026-06-06 | Web Push 通知
**版本:** push-v1  

### 2026-06-06 | PWA 支援
**版本:** pwa-v1  

### 2026-06-06 | 項目初始化
**版本:** ea8ed7a  
