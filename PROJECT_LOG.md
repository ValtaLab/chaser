---
project: chaser
name: 趕車 (Chaser)
status: active
last_deploy: 2026-06-06T19:35:00+08:00
last_version: ea8ed7a
last_update_by: HermesBPi
---

# 趕車 (Chaser) — 項目進展日誌

## 🚀 最新狀態 (2026-06-06)
**版本:** `ea8ed7a` | **部署時間:** 19:35 HKT | **狀態:** 運行中  
**部署地址:** https://master.chaser-6ta.pages.dev

### 核心功能 (MVP)
- [x] **路線設定**: RouteSearch 組件 — 巴士/MTR 路線 + 車站選擇
- [x] **GPS 定位**: LocationTracker — Browser Geolocation API
- [x] **ETA 整合**: KMB/Citybus (Data.gov.hk) + MTR API
- [x] **智能提醒**: TransferAdvice — 趕車/等車建議
- [x] **即時 ETA**: LiveETAPanel — 30 秒自動刷新
- [x] **地圖**: Leaflet + 用戶位置 + 車站標記
- [ ] **Web Push 通知**: 待實作
- [ ] **PWA**: 待設定（next-pwa 同 Next.js 16 有衝突）

### 技術架構
- **前端:** Next.js 16 + TypeScript + Tailwind CSS
- **狀態管理:** Zustand
- **地圖:** Leaflet (react-leaflet)
- **部署:** Cloudflare Pages (static export)
- **API:** Data.gov.hk (KMB/Citybus), MTR Open Data

### 數據來源
- `bus-api.ts` — KMB/Citybus 路線、車站、ETA
- `mtr-api.ts` — MTR 到站時間、車站資訊
- `eta-service.ts` — 合併 ETA + 轉乘建議邏輯

---

## 📝 變更歷史

### 2026-06-06 | 項目初始化 + 核心功能開發
**版本:** ea8ed7a  
1. 建立 Next.js 16 項目 + TypeScript + Tailwind CSS
2. 整合香港交通 API（KMB、Citybus、MTR）
3. 開發核心組件：RouteSearch、LocationTracker、ETADisplay、LiveETAPanel、Map
4. 部署到 Cloudflare Pages: https://master.chaser-6ta.pages.dev
