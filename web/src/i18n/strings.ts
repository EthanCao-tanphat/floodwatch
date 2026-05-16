/**
 * All UI strings, Vietnamese + English.
 * Add a key to `vi`, add same key to `en`. TS will complain if you forget.
 */
export const vi = {
  // ---- App-wide ----
  appTitle: 'FloodWatch',
  appTagline: 'Dự báo ngập đường theo lộ trình',

  // ---- Landing screen ----
  landingCoreLabel: 'FloodWatch',
  landingCoreSubtitle: 'CORE',
  landingCharging: 'Đang khởi động hệ thống…',
  landingReady: 'Hệ thống sẵn sàng',
  landingContinue: 'Tiếp tục →',
  landingDataSourcesTitle: 'Nguồn dữ liệu',

  // ---- Sidebar (dashboard) ----
  navMap: 'Bản đồ',
  navReports: 'Báo cáo',
  navRoutes: 'Lộ trình',
  navAlerts: 'Cảnh báo',
  navLayers: 'Lớp dữ liệu',
  navSettings: 'Cài đặt',

  statsTitle: 'Tình trạng hệ thống',
  statActiveReports: 'Báo cáo đang hoạt động',
  statHotspots: 'Điểm ngập',
  statRainNow: 'Mưa hiện tại',
  statTideLevel: 'Mực thủy triều',
  statCoverage: 'Vùng phủ',

  alertsTitle: 'Cảnh báo gần đây',
  alertsEmpty: 'Chưa có cảnh báo',

  // ---- Risk levels ----
  riskLow: 'An toàn',
  riskModerate: 'Cẩn thận',
  riskHigh: 'Nguy hiểm',
  riskSevere: 'Rất nguy hiểm',

  // ---- Route input ----
  fromLabel: 'Điểm đi',
  toLabel: 'Điểm đến',
  notSelected: 'Chưa chọn',
  pick: 'Chọn',
  useCurrentLocation: '📍 Vị trí hiện tại',
  checkFlood: 'Kiểm tra ngập',
  checking: 'Đang tính…',
  tapMapToPickFrom: 'Chạm vào bản đồ để chọn điểm đi',
  tapMapToPickTo: 'Chạm vào bản đồ để chọn điểm đến',

  // ---- Results ----
  resultsTitle: 'Tình trạng tuyến đường',
  routeDistance: 'km',
  routeEta: 'phút',
  segmentDetails: 'Chi tiết theo đoạn',
  segmentLabel: 'Đoạn',

  // ---- Recommendations ----
  recSevere: 'Khuyến nghị hoãn chuyến hoặc tìm tuyến khác. Ngập nặng có khả năng xảy ra.',
  recHigh: 'Tuyến có đoạn dễ ngập. Nên chọn tuyến thay thế.',
  recModerate: 'Đường thông thoáng phần lớn. Lưu ý các đoạn được tô màu.',
  recLow: 'Tuyen duong co the di bang xe may trong 30-60 phut toi.',

  // ---- Photo report ----
  photoTitle: 'Báo cáo ngập',
  photoSubtitle: 'Chup anh duong ngap, AI se kiem tra xe may co the di qua khong',
  photoTakePhoto: '📷 Chụp ảnh',
  photoAnalyzing: 'Đang phân tích ảnh với Qwen-VL…',
  photoConfidence: 'Độ tin cậy',
  photoReportAnother: 'Báo cáo ảnh khác',
  photoUnknownError: 'Lỗi không xác định',

  depthDry: 'Đường khô',
  depthAnkle: 'Ngập cổ chân',
  depthKnee: 'Ngập đầu gối',
  depthImpassable: 'Không thể đi',
  passabilitySafe: 'An toan cho xe may',
  passabilitySlowPass: 'Di cham',
  passabilityAvoid: 'Nen tranh cho xe may',
  passabilityImpassable: 'Khong the di qua',
  passabilityUnknown: 'Chua ro',
  confidenceLow: 'Thap',
  confidenceMedium: 'Trung binh',
  confidenceHigh: 'Cao',
  rainEvidence: 'Mua',

  // ---- Status ----
  apiOffline: 'Mất kết nối API',
  geolocationFailed: 'Không lấy được vị trí. Hãy chọn thủ công trên bản đồ.',
  apiCallFailed: 'Lỗi gọi API',

  brandTagline: 'Hệ thống dự báo lũ lụt cho Việt Nam',
} as const

export type Strings = { [K in keyof typeof vi]: string }

export const en: Strings = {
  appTitle: 'FloodWatch',
  appTagline: 'Predictive flood-routing',

  landingCoreLabel: 'FloodWatch',
  landingCoreSubtitle: 'CORE',
  landingCharging: 'Initializing system…',
  landingReady: 'System ready',
  landingContinue: 'Continue →',
  landingDataSourcesTitle: 'Data sources',

  navMap: 'Map',
  navReports: 'Reports',
  navRoutes: 'Routes',
  navAlerts: 'Alerts',
  navLayers: 'Layers',
  navSettings: 'Settings',

  statsTitle: 'System status',
  statActiveReports: 'Active reports',
  statHotspots: 'Flood hotspots',
  statRainNow: 'Rain now',
  statTideLevel: 'Tide level',
  statCoverage: 'Coverage',

  alertsTitle: 'Recent alerts',
  alertsEmpty: 'No alerts yet',

  riskLow: 'Safe',
  riskModerate: 'Caution',
  riskHigh: 'High risk',
  riskSevere: 'Severe',

  fromLabel: 'From',
  toLabel: 'To',
  notSelected: 'Not picked',
  pick: 'Pick',
  useCurrentLocation: '📍 Current location',
  checkFlood: 'Check route',
  checking: 'Calculating…',
  tapMapToPickFrom: 'Tap the map to pick your start point',
  tapMapToPickTo: 'Tap the map to pick your destination',

  resultsTitle: 'Route status',
  routeDistance: 'km',
  routeEta: 'min',
  segmentDetails: 'Per-segment risk',
  segmentLabel: 'Segment',

  recSevere: 'Strongly recommend delaying or finding an alternate route. Heavy flooding likely.',
  recHigh: 'Route has flood-prone segments. Consider an alternate.',
  recModerate: 'Mostly clear. Watch the highlighted segments.',
  recLow: 'Route looks passable for motorbikes in the next 30-60 minutes.',

  photoTitle: 'Report flooding',
  photoSubtitle: 'Snap a flooded-road photo; AI checks motorbike passability',
  photoTakePhoto: '📷 Take photo',
  photoAnalyzing: 'Analyzing with Qwen-VL…',
  photoConfidence: 'Confidence',
  photoReportAnother: 'Report another photo',
  photoUnknownError: 'Unknown error',

  depthDry: 'Dry road',
  depthAnkle: 'Ankle deep',
  depthKnee: 'Knee deep',
  depthImpassable: 'Impassable',
  passabilitySafe: 'Motorbike-passable',
  passabilitySlowPass: 'Pass slowly',
  passabilityAvoid: 'Avoid for motorbikes',
  passabilityImpassable: 'Impassable',
  passabilityUnknown: 'Unknown passability',
  confidenceLow: 'Low',
  confidenceMedium: 'Medium',
  confidenceHigh: 'High',
  rainEvidence: 'Rain',

  apiOffline: 'API offline',
  geolocationFailed: 'Could not get your location. Pick manually on the map.',
  apiCallFailed: 'API call failed',

  brandTagline: 'Flood prediction system for Vietnam',
}

export const dictionaries = { vi, en } as const
export type Lang = keyof typeof dictionaries
