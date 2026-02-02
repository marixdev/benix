/**
 * Network Benchmark
 * Uses Speedtest.net API for dynamic server discovery
 * Ported from Marix BenchmarkService.ts
 */

import { exec } from '../utils/exec';
import { colors, printProgress, clearProgress, printWarning } from '../utils/console';

export interface NetworkResult {
  publicIp: string;
  provider: string;
  location: string;
  tests: SpeedTestResult[];
}

export interface SpeedTestResult {
  server: string;
  location: string;
  download: string;
  upload: string;
  latency: string;
}

interface SpeedtestServer {
  id: string;
  host: string;
  name: string;
  country: string;
  sponsor: string;
  url: string;
  lat: string;
  lon: string;
  region: string;
}

// Search regions for multi-region coverage (40+ regions like Marix)
const SEARCH_REGIONS = [
  // Vietnam
  'Hanoi', 'Ho Chi Minh', 'Da Nang',
  // Southeast Asia
  'Singapore', 'Bangkok', 'Jakarta', 'Kuala Lumpur', 'Manila', 'Phnom Penh',
  // East Asia
  'Tokyo', 'Hong Kong', 'Seoul', 'Taipei', 'Shanghai',
  // South Asia
  'Mumbai', 'Delhi', 'Bangalore',
  // Oceania
  'Sydney', 'Melbourne', 'Auckland', 'Brisbane',
  // Europe
  'London', 'Frankfurt', 'Paris', 'Amsterdam', 'Stockholm', 'Madrid', 'Milan',
  // North America
  'Los Angeles', 'New York', 'Chicago', 'Toronto', 'Dallas', 'Miami', 'Seattle',
  // South America (use country names for better results)
  'Brazil', 'Argentina', 'Chile', 'Peru',
  // Africa
  'South Africa', 'Egypt', 'Nigeria', 'Kenya',
  // Middle East
  'Dubai', 'Israel', 'Saudi Arabia', 'Turkey',
  // Russia
  'Russia', 'Moscow',
];

// Map countries to geographic regions (for proper grouping)
const COUNTRY_TO_REGION: { [key: string]: string } = {
  // Vietnam
  'Vietnam': 'Vietnam',
  // Southeast Asia
  'Singapore': 'Southeast Asia', 'Thailand': 'Southeast Asia', 'Indonesia': 'Southeast Asia',
  'Malaysia': 'Southeast Asia', 'Philippines': 'Southeast Asia', 'Cambodia': 'Southeast Asia',
  'Myanmar': 'Southeast Asia', 'Laos': 'Southeast Asia', 'Brunei': 'Southeast Asia',
  // East Asia
  'Japan': 'East Asia', 'Hong Kong': 'East Asia', 'South Korea': 'East Asia',
  'Taiwan': 'East Asia', 'China': 'East Asia', 'Macau': 'East Asia', 'Mongolia': 'East Asia',
  // South Asia
  'India': 'South Asia', 'Pakistan': 'South Asia', 'Bangladesh': 'South Asia',
  'Sri Lanka': 'South Asia', 'Nepal': 'South Asia',
  // Oceania
  'Australia': 'Oceania', 'New Zealand': 'Oceania', 'Fiji': 'Oceania',
  'Papua New Guinea': 'Oceania',
  // Europe
  'United Kingdom': 'Europe', 'Germany': 'Europe', 'France': 'Europe',
  'Netherlands': 'Europe', 'Sweden': 'Europe', 'Spain': 'Europe', 'Italy': 'Europe',
  'Poland': 'Europe', 'Belgium': 'Europe', 'Switzerland': 'Europe', 'Austria': 'Europe',
  'Norway': 'Europe', 'Denmark': 'Europe', 'Finland': 'Europe', 'Ireland': 'Europe',
  'Portugal': 'Europe', 'Czech Republic': 'Europe', 'Romania': 'Europe', 'Greece': 'Europe',
  'Hungary': 'Europe', 'Ukraine': 'Europe',
  // North America
  'United States': 'North America', 'Canada': 'North America', 'Mexico': 'North America',
  // South America
  'Brazil': 'South America', 'Argentina': 'South America', 'Chile': 'South America',
  'Peru': 'South America', 'Colombia': 'South America', 'Venezuela': 'South America',
  'Ecuador': 'South America', 'Uruguay': 'South America', 'Paraguay': 'South America',
  // Africa
  'South Africa': 'Africa', 'Egypt': 'Africa', 'Nigeria': 'Africa', 'Kenya': 'Africa',
  'Morocco': 'Africa', 'Ghana': 'Africa', 'Tanzania': 'Africa', 'Algeria': 'Africa',
  // Middle East
  'United Arab Emirates': 'Middle East', 'Israel': 'Middle East', 'Saudi Arabia': 'Middle East',
  'Turkey': 'Middle East', 'Qatar': 'Middle East', 'Kuwait': 'Middle East', 'Bahrain': 'Middle East',
  'Oman': 'Middle East', 'Jordan': 'Middle East', 'Lebanon': 'Middle East',
  // Russia & CIS
  'Russia': 'Russia', 'Kazakhstan': 'Russia', 'Belarus': 'Russia',
};

// Helper function to get region from country
function getRegionFromCountry(country: string): string {
  return COUNTRY_TO_REGION[country] || 'Other';
}

async function getPublicIp(): Promise<{ ip: string; provider: string; location: string }> {
  let ip = 'Unknown';
  let provider = 'Unknown';
  let location = 'Unknown';

  try {
    // Try multiple services
    const result = await exec('curl -s -4 -m 5 ifconfig.me 2>/dev/null || curl -s -4 -m 5 icanhazip.com 2>/dev/null');
    const trimmed = result.trim();
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
      ip = trimmed;
    }

    // Get provider info
    if (ip !== 'Unknown') {
      try {
        const info = await exec(`curl -s -m 5 "http://ip-api.com/json/${ip}" 2>/dev/null`);
        const json = JSON.parse(info);
        provider = json.org || json.isp || 'Unknown';
        location = [json.city, json.regionName, json.country].filter(Boolean).join(', ') || 'Unknown';
      } catch {
        // Try ipinfo.io as fallback
        try {
          const info = await exec(`curl -s -m 5 "https://ipinfo.io/${ip}/json" 2>/dev/null`);
          const json = JSON.parse(info);
          provider = json.org || 'Unknown';
          location = [json.city, json.region, json.country].filter(Boolean).join(', ') || 'Unknown';
        } catch {}
      }
    }
  } catch {}

  return { ip, provider, location };
}

async function fetchSpeedtestServers(regions: string[]): Promise<SpeedtestServer[]> {
  const servers: SpeedtestServer[] = [];
  const seenIds = new Set<string>();

  // Fetch servers from multiple regions in parallel (batch of 5)
  const batchSize = 5;
  
  for (let i = 0; i < regions.length; i += batchSize) {
    const batch = regions.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (region): Promise<SpeedtestServer[]> => {
      try {
        const searchParam = encodeURIComponent(region);
        const result = await exec(
          `curl -s --connect-timeout 3 --max-time 5 'https://www.speedtest.net/api/js/servers?engine=js&limit=3&search=${searchParam}' 2>/dev/null`
        );
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) {
          return parsed.map(server => ({
            ...server,
            region: region
          }));
        }
      } catch {}
      return [];
    });

    const results = await Promise.all(batchPromises);
    for (const regionServers of results) {
      for (const server of regionServers) {
        if (!seenIds.has(server.id)) {
          seenIds.add(server.id);
          servers.push(server);
        }
      }
    }
  }

  return servers;
}

async function testLatency(server: SpeedtestServer): Promise<number> {
  try {
    // Extract hostname from URL
    let hostname = '';
    let baseUrl = '';
    try {
      const urlObj = new URL(server.url);
      hostname = urlObj.hostname;
      baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    } catch {
      hostname = (server.host || '').split(':')[0];
      baseUrl = server.url.replace(/\/upload.*$/, '');
    }

    if (!hostname) return -1;

    // Try ping first (increased timeout to 5 seconds for far regions)
    try {
      const pingResult = await exec(`ping -c 1 -W 5 ${hostname} 2>/dev/null | grep 'time=' | sed 's/.*time=\\([0-9.]*\\).*/\\1/'`);
      const latency = parseFloat(pingResult.trim());
      if (!isNaN(latency) && latency > 0) {
        return latency;
      }
    } catch {}

    // Fallback: use HTTP timing if ping fails (some servers block ICMP)
    try {
      const httpResult = await exec(
        `curl -o /dev/null -s -w '%{time_connect}' --connect-timeout 5 '${baseUrl}/latency.txt?x=${Date.now()}' 2>/dev/null || curl -o /dev/null -s -w '%{time_connect}' --connect-timeout 5 '${baseUrl}/' 2>/dev/null`
      );
      const connectTime = parseFloat(httpResult.trim());
      if (!isNaN(connectTime) && connectTime > 0) {
        return connectTime * 1000; // Convert to ms
      }
    } catch {}

    return -1;
  } catch {
    return -1;
  }
}

async function testDownload(server: SpeedtestServer): Promise<{ speed: number; mbps: string }> {
  try {
    // Build download URL - Speedtest uses /random4000x4000.jpg (~30MB image)
    const baseUrl = server.url.replace(/\/upload.*$/, '');
    const downloadUrl = `${baseUrl}/random4000x4000.jpg`;

    // Use curl with speed output
    const result = await exec(
      `curl -o /dev/null -w '%{speed_download}' -s --connect-timeout 5 --max-time 15 '${downloadUrl}' 2>/dev/null`
    );
    const speedBps = parseFloat(result.trim());

    if (!isNaN(speedBps) && speedBps > 0) {
      const mbps = (speedBps * 8 / 1000000);
      return {
        speed: speedBps,
        mbps: `${mbps.toFixed(0)} Mbps`
      };
    }
  } catch {}

  return { speed: 0, mbps: 'N/A' };
}

async function testUpload(server: SpeedtestServer): Promise<string> {
  try {
    // Upload test using random data (1MB)
    const result = await exec(
      `dd if=/dev/urandom bs=256K count=4 2>/dev/null | curl -o /dev/null -w '%{speed_upload}' -s --connect-timeout 5 --max-time 15 -X POST -F "content0=<-" '${server.url}' 2>/dev/null`
    );
    const speedBps = parseFloat(result.trim());

    if (!isNaN(speedBps) && speedBps > 0) {
      const mbps = (speedBps * 8 / 1000000);
      return `${mbps.toFixed(0)} Mbps`;
    }
  } catch {}

  return 'N/A';
}

export async function runNetworkBenchmark(
  maxServers: number = 20
): Promise<NetworkResult> {
  const result: NetworkResult = {
    publicIp: 'Unknown',
    provider: 'Unknown',
    location: 'Unknown',
    tests: []
  };

  // Get public IP
  printProgress('Detecting network');
  const ipInfo = await getPublicIp();
  result.publicIp = ipInfo.ip;
  result.provider = ipInfo.provider;
  result.location = ipInfo.location;

  // Fetch servers from Speedtest.net API
  const servers = await fetchSpeedtestServers(SEARCH_REGIONS);

  if (servers.length === 0) {
    clearProgress();
    printWarning('Could not fetch servers from Speedtest.net API');
    return result;
  }

  // Test latency to pre-selected servers (up to 3 per geographic region)
  const serversToTest: SpeedtestServer[] = [];
  const regionCount: { [region: string]: number } = {};

  for (const server of servers) {
    const geoRegion = getRegionFromCountry(server.country);
    regionCount[geoRegion] = (regionCount[geoRegion] || 0) + 1;
    if (regionCount[geoRegion] <= 3) {
      serversToTest.push(server);
    }
  }

  // Test latency and collect results
  const serverLatencies: Array<{ server: SpeedtestServer; latency: number }> = [];
  const failedServers: SpeedtestServer[] = [];

  for (let i = 0; i < serversToTest.length; i++) {
    const server = serversToTest[i];
    const latency = await testLatency(server);
    if (latency > 0) {
      serverLatencies.push({ server, latency });
    } else {
      // Keep track of failed servers for regions without any successful tests
      failedServers.push(server);
    }
  }
  clearProgress();

  // Sort by latency
  serverLatencies.sort((a, b) => a.latency - b.latency);

  // Group servers by geographic region and select best from each
  const regionGroups: { [region: string]: typeof serverLatencies } = {};
  
  for (const entry of serverLatencies) {
    const geoRegion = getRegionFromCountry(entry.server.country);
    if (!regionGroups[geoRegion]) {
      regionGroups[geoRegion] = [];
    }
    regionGroups[geoRegion].push(entry);
  }

  // Select servers with global coverage (like Marix)
  const selectedServers: typeof serverLatencies = [];
  const selectedIds = new Set<string>();
  const seenCountries = new Set<string>();
  const regionServerCount: { [region: string]: number } = {};

  // All regions in priority order
  const regionOrder = [
    'Vietnam', 'Southeast Asia', 'East Asia', 'South Asia', 'Oceania',
    'Europe', 'North America', 'South America', 'Africa', 'Middle East', 'Russia'
  ];

  // Initialize region counts
  for (const region of regionOrder) {
    regionServerCount[region] = 0;
  }

  // Calculate target servers per region based on maxServers
  // Ensure at least 1 from each available region, max 4 per region
  const availableRegions = regionOrder.filter(r => (regionGroups[r]?.length || 0) > 0);
  const basePerRegion = Math.max(1, Math.floor(maxServers / availableRegions.length));
  const maxPerRegion = Math.min(4, Math.ceil(maxServers / availableRegions.length) + 1);

  // First pass: add exactly 1 server from each region (ensure global coverage first)
  for (const region of regionOrder) {
    const regionServers = regionGroups[region] || [];
    
    for (const entry of regionServers) {
      if (regionServerCount[region] >= 1) break;
      selectedServers.push(entry);
      selectedIds.add(entry.server.id);
      seenCountries.add(entry.server.country);
      regionServerCount[region]++;
    }
    
    // If no servers with successful latency test, try failed servers for this region
    if (regionServerCount[region] === 0) {
      for (const server of failedServers) {
        if (regionServerCount[region] >= 1) break;
        const serverRegion = getRegionFromCountry(server.country);
        if (serverRegion === region && !selectedIds.has(server.id)) {
          // Add with estimated high latency (will be measured during actual test)
          selectedServers.push({ server, latency: 999 });
          selectedIds.add(server.id);
          seenCountries.add(server.country);
          regionServerCount[region]++;
        }
      }
    }
  }

  // Second pass: add more from each region (round-robin to ensure fairness)
  let addedInPass = true;
  while (addedInPass && selectedServers.length < maxServers) {
    addedInPass = false;
    for (const region of regionOrder) {
      if (selectedServers.length >= maxServers) break;
      if (regionServerCount[region] >= maxPerRegion) continue;
      
      const regionServers = regionGroups[region] || [];
      for (const entry of regionServers) {
        if (!selectedIds.has(entry.server.id)) {
          selectedServers.push(entry);
          selectedIds.add(entry.server.id);
          seenCountries.add(entry.server.country);
          regionServerCount[region]++;
          addedInPass = true;
          break; // Move to next region
        }
      }
    }
  }

  // Third pass: fill remaining with best latency (allow same country now)
  for (const entry of serverLatencies) {
    if (selectedServers.length >= maxServers) break;
    if (!selectedIds.has(entry.server.id)) {
      const region = getRegionFromCountry(entry.server.country);
      if (regionServerCount[region] < maxPerRegion) {
        selectedServers.push(entry);
        selectedIds.add(entry.server.id);
        regionServerCount[region]++;
      }
    }
  }

  // Final pass: if still not enough, add any remaining best latency servers
  for (const entry of serverLatencies) {
    if (selectedServers.length >= maxServers) break;
    if (!selectedIds.has(entry.server.id)) {
      selectedServers.push(entry);
      selectedIds.add(entry.server.id);
    }
  }

  // Limit to maxServers
  const finalServers = selectedServers.slice(0, maxServers);

  // Sort servers by region order for consistent display
  // Within each region, sort by country then by latency
  const sortedServers = [...finalServers].sort((a, b) => {
    const regionA = getRegionFromCountry(a.server.country);
    const regionB = getRegionFromCountry(b.server.country);
    const orderA = regionOrder.indexOf(regionA);
    const orderB = regionOrder.indexOf(regionB);
    
    // First by region order
    if (orderA !== orderB) return orderA - orderB;
    
    // Then by country (group same country together)
    if (a.server.country !== b.server.country) {
      return a.server.country.localeCompare(b.server.country);
    }
    
    // Finally by latency within same country
    return a.latency - b.latency;
  });

  // Test download/upload on selected servers
  let successCount = 0;
  let currentRegion = '';
  
  for (let i = 0; i < sortedServers.length; i++) {
    const { server, latency } = sortedServers[i];
    const geoRegion = getRegionFromCountry(server.country);
    
    // Print region header when region changes
    if (geoRegion !== currentRegion) {
      currentRegion = geoRegion;
      const c = colors;
      console.log(`  ${c.dim}── ${geoRegion} ${'─'.repeat(Math.max(0, 60 - geoRegion.length))}${c.reset}`);
    }
    
    printProgress(`Testing ${server.sponsor || server.name} (${i + 1}/${sortedServers.length})`);

    // Download test
    const download = await testDownload(server);
    
    if (download.speed === 0) {
      clearProgress();
      // Server failed - skip silently or show minimal output
      continue;
    }
    successCount++;

    // Upload test
    const upload = await testUpload(server);
    clearProgress();

    const testResult: SpeedTestResult = {
      server: server.sponsor || server.name,
      location: `${server.name}, ${server.country}`,
      download: download.mbps,
      upload: upload,
      latency: `${latency.toFixed(2)} ms`
    };

    result.tests.push(testResult);

    // Print result
    const c = colors;
    console.log(
      `  ${c.white}${testResult.server.substring(0, 20).padEnd(21)}${c.reset} ` +
      `${c.dim}${testResult.location.substring(0, 14).padEnd(15)}${c.reset} ` +
      `${c.green}↓${testResult.download.padStart(10)}${c.reset} ` +
      `${c.cyan}↑${testResult.upload.padStart(10)}${c.reset} ` +
      `${c.yellow}${testResult.latency.padStart(10)}${c.reset}`
    );
  }

  return result;
}

export function printNetworkHeader(): void {
  const c = colors;
  console.log(
    `  ${c.dim}${'Server'.padEnd(21)} ${'Location'.padEnd(15)} ${'Download'.padStart(11)} ${'Upload'.padStart(11)} ${'Latency'.padStart(10)}${c.reset}`
  );
  console.log(`  ${c.dim}${'─'.repeat(70)}${c.reset}`);
}

export function printNetworkInfo(result: NetworkResult): void {
  const c = colors;
  console.log(`  ${c.dim}Public IP${c.reset}   ${c.white}${result.publicIp}${c.reset}`);
  console.log(`  ${c.dim}Provider${c.reset}    ${c.white}${result.provider}${c.reset}`);
  console.log(`  ${c.dim}Location${c.reset}    ${c.white}${result.location}${c.reset}`);
}
