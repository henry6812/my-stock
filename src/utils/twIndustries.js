// TWSE 上市產業別 (t187ap03_L「產業別」) → short names for the screener.
// Unknown codes read as 其他 rather than failing.
export const TW_INDUSTRIES = {
  '01': '水泥',
  '02': '食品',
  '03': '塑膠',
  '04': '紡織纖維',
  '05': '電機機械',
  '06': '電器電纜',
  '08': '玻璃陶瓷',
  '09': '造紙',
  '10': '鋼鐵',
  '11': '橡膠',
  '12': '汽車',
  '14': '建材營造',
  '15': '航運',
  '16': '觀光餐旅',
  '17': '金融保險',
  '18': '貿易百貨',
  '20': '其他',
  '21': '化學',
  '22': '生技醫療',
  '23': '油電燃氣',
  '24': '半導體',
  '25': '電腦及週邊',
  '26': '光電',
  '27': '通信網路',
  '28': '電子零組件',
  '29': '電子通路',
  '30': '資訊服務',
  '31': '其他電子',
  '35': '綠能環保',
  '36': '數位雲端',
  '37': '運動休閒',
  '38': '居家生活',
  '91': '存託憑證',
}

export const TW_INDUSTRY_CODES = Object.keys(TW_INDUSTRIES).sort()

export const CONSTRUCTION_INDUSTRY = '14'

export const industryName = (code) => TW_INDUSTRIES[code] ?? '其他'
