---
project: chaser
name: 趕車 (Chaser)
status: active
last_deploy: null
last_version: null
last_update_by: HermesBPi
---

# 趕車 (Chaser) — 項目進展日誌

## 🚀 最新狀態 (2026-06-06)
**版本:** init | **狀態:** 開發中

### 核心功能 (MVP)
- [ ] 路線設定（上班 / 下班路線）
- [ ] GPS 實時定位追蹤
- [ ] ETA 整合（KMB、Citybus、MTR）
- [ ] 智能轉乘提醒
- [ ] Web Push 通知
- [ ] PWA 支援

### 技術架構
- **前端:** Next.js 14 + TypeScript + Tailwind CSS
- **PWA:** next-pwa
- **狀態管理:** Zustand
- **地圖:** Mapbox GL JS / Leaflet
- **通知:** Service Worker + Web Push API
- **定位:** Browser Geolocation API
- **後端:** NestJS (Phase 2)
- **資料庫:** PostgreSQL (Phase 2)

### 數據來源
- Data.gov.hk — KMB、Citybus、NLB 路線/車站/ETA
- MTR API — 到站時間、車站資訊
- Phase 2: 綠色專線小巴、電車、渡輪

---

## 📝 變更歷史

### 2026-06-06 | 項目初始化
- 建立項目目錄 + Git repo
- 整合兩份 Notion 文件（Smart Transfer Assistant + PRD）
- 初始化 Next.js 14 項目架構
