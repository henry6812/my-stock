const FX_URL = 'https://open.er-api.com/v6/latest/USD'

export const getUsdTwdRate = async () => {
  let response
  try {
    response = await fetch(FX_URL)
  } catch {
    throw new Error('Failed to fetch FX API. Please check your network.')
  }

  if (!response.ok) {
    throw new Error(`FX API error: ${response.status}`)
  }

  const data = await response.json()
  const rate = Number(data?.rates?.TWD)

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Unable to get USD/TWD rate from FX API')
  }

  return {
    rate,
    fetchedAt: new Date().toISOString(),
  }
}
