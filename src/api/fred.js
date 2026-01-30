/**
 * FRED (FEDERAL RESERVE ECONOMIC DATA) MODULE
 * Fetches macroeconomic indicators
 * 
 * CONSTRAINTS:
 * - Must accept env parameter for secrets
 * - Must wrap ALL fetch in try/catch
 * - Must return null on failure
 * - Must focus on analysis-ready data, not raw series
 */

// FRED series IDs for key indicators
const SERIES_IDS = {
  GDP: 'GDP',                    // Real Gross Domestic Product
  CPI: 'CPIAUCSL',               // Consumer Price Index
  UNEMPLOYMENT: 'UNRATE',        // Unemployment Rate
  FED_FUNDS: 'FEDFUNDS',         // Effective Federal Funds Rate
  RETAIL_SALES: 'RSAFS',         // Retail Sales
  INDUSTRIAL_PROD: 'INDPRO'      // Industrial Production
};

/**
 * Fetch key macroeconomic indicators
 * @param {Object} env - Cloudflare environment with secrets
 * @returns {Object|null} Structured macro data or null
 */
export async function fetchMacroIndicators(env) {
  try {
    const apiKey = env.FRED_API_KEY;
    if (!apiKey) {
      console.warn('FRED_API_KEY not configured');
      return null;
    }
    
    // Fetch all series in parallel
    const promises = Object.entries(SERIES_IDS).map(([key, seriesId]) =>
      fetchSeries(seriesId, apiKey).then(data => ({ key, data }))
    );
    
    const results = await Promise.allSettled(promises);
    
    // Structure successful results
    const indicators = {};
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.data) {
        indicators[result.value.key] = result.value.data;
      }
    });
    
    if (Object.keys(indicators).length === 0) {
      return null; // All fetches failed
    }
    
    return {
      indicators: indicators,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('FRED fetch failed:', error.message);
    return null;
  }
}

/**
 * Fetch single FRED series
 */
async function fetchSeries(seriesId, apiKey) {
  try {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: apiKey,
      file_type: 'json',
      observation_start: getObservationStart(), // Last 2 years
      sort_order: 'desc',
      limit: 24 // Last 24 observations
    });
    
    const response = await fetch(`https://api.stlouisfed.org/fred/series/observations?${params}`);
    
    if (!response.ok) {
      console.warn(`FRED series ${seriesId} returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.observations || data.observations.length === 0) {
      return null;
    }
    
    return structureSeriesData(data.observations, seriesId);
    
  } catch (error) {
    console.warn(`FRED series ${seriesId} fetch failed:`, error.message);
    return null;
  }
}

/**
 * Structure series data for analysis
 */
function structureSeriesData(observations, seriesId) {
  const latest = observations[0];
  const previous = observations[1];
  
  if (!latest || !latest.value || latest.value === '.') {
    return null;
  }
  
  const currentValue = parseFloat(latest.value);
  const previousValue = previous && previous.value !== '.' ? parseFloat(previous.value) : null;
  
  // Calculate change if we have previous value
  let change = null;
  let changePercent = null;
  
  if (previousValue && previousValue !== 0) {
    change = currentValue - previousValue;
    changePercent = (change / previousValue) * 100;
  }
  
  return {
    seriesId: seriesId,
    value: currentValue,
    date: latest.date,
    previousValue: previousValue,
    change: change,
    changePercent: changePercent,
    unit: getSeriesUnit(seriesId)
  };
}

/**
 * Get observation start date (2 years ago)
 */
function getObservationStart() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 2);
  return date.toISOString().split('T')[0];
}

/**
 * Get unit label for series
 */
function getSeriesUnit(seriesId) {
  const units = {
    GDP: 'Bil. Chained 2017 USD',
    CPI: 'Index 1982-84=100',
    UNEMPLOYMENT: 'Percent',
    FED_FUNDS: 'Percent',
    RETAIL_SALES: 'Mil. USD',
    INDUSTRIAL_PROD: 'Index 2017=100'
  };
  return units[seriesId] || '';
  }
