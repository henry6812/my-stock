// One watched stock per market + symbol: the cloud doc id, so two devices
// adding the same stock land on the same doc.
export const buildWatchlistRemoteKey = ({ market, symbol }) => `${market}_${symbol}`
