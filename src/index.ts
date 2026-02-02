/**
 * Benix CLI - VPS Benchmark Tool
 * One Command. Full Insights.
 * https://benix.app
 */

import { collectSystemInfo, printSystemInfo, type SystemInfo } from './benchmarks/system';
import { runCPUBenchmark, printCPUResult, type CPUBenchmark } from './benchmarks/cpu';
import { runMemoryBenchmark, printMemoryResult, type MemoryBenchmark } from './benchmarks/memory';
import { runDiskBenchmark, printDiskResult, type DiskResult } from './benchmarks/disk';
import { runNetworkBenchmark, printNetworkInfo, printNetworkHeader, type NetworkResult } from './benchmarks/network';
import { printBanner, printSection, printInfo, printSuccess, printError, colors } from './utils/console';
import { formatDuration } from './utils/format';
import { uploadResults } from './utils/output';
import { parseArgs } from './utils/args';
import { isRoot } from './utils/exec';

// Re-export types
export type { SystemInfo, CPUBenchmark, MemoryBenchmark, DiskResult, NetworkResult };

export interface BenchmarkResult {
  version: string;
  timestamp: string;
  duration: number;
  system: SystemInfo | null;
  cpu: CPUBenchmark | null;
  memory: MemoryBenchmark | null;
  disk: DiskResult | null;
  network: NetworkResult | null;
}

const VERSION = '1.0.0';
// Use local API for development, production API for release
const BENIX_API = process.env.BENIX_API || 'https://api.benix.app';

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    console.log(`Benix CLI v${VERSION}`);
    process.exit(0);
  }

  // Clear screen for clean start
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[2J\x1b[H');
  }

  // Print banner
  printBanner();

  // Check root for disk tests
  const root = isRoot();
  if (!root) {
    console.log(`  ${colors.yellow}⚠${colors.reset} Running without root. Some disk tests may be limited.`);
    console.log('');
  }

  // Determine upload mode:
  // -p = private mode (save to file only, no upload)
  // -u = auto upload public (no prompt)
  // neither = ask user at start
  let uploadMode: 'public' | 'private' | 'none' = 'none';
  
  if (args.private) {
    uploadMode = 'private';
  } else if (args.upload) {
    uploadMode = 'public';
  } else if (!args.quiet) {
    // Ask at the beginning like tocdo.io
    uploadMode = await askUploadMode();
  }

  // Initialize session for temporal validation (anti-spam)
  let sessionId: string | undefined;
  try {
    const initRes = await fetch(`${BENIX_API}/api/benchmarks/init`, { method: 'POST' });
    if (initRes.ok) {
      const initData = await initRes.json() as { session_id: string };
      sessionId = initData.session_id;
    }
  } catch {
    // Silent fail - session is optional for backward compatibility
  }

  const startTime = Date.now();
  let systemInfo: SystemInfo | null = null;
  let cpuResult: CPUBenchmark | null = null;
  let memoryResult: MemoryBenchmark | null = null;
  let diskResult: DiskResult | null = null;
  let networkResult: NetworkResult | null = null;

  // Phase 1: System Information
  printSection('System Information');
  systemInfo = await collectSystemInfo();
  printSystemInfo(systemInfo);
  console.log('');

  // Phase 2: CPU Benchmark
  printSection('CPU Benchmark');
  cpuResult = await runCPUBenchmark();
  printCPUResult(cpuResult);
  console.log('');

  // Phase 3: Memory Benchmark
  printSection('Memory Benchmark');
  memoryResult = await runMemoryBenchmark();
  printMemoryResult(memoryResult);
  console.log('');

  // Phase 4: Disk Benchmark
  printSection('Disk Performance');
  diskResult = await runDiskBenchmark(args.skipFio);
  printDiskResult(diskResult);
  console.log('');

  // Phase 5: Network Benchmark
  printSection('Network Speed');
  printNetworkHeader();
  networkResult = await runNetworkBenchmark(args.servers || 15);
  console.log('');
  printNetworkInfo(networkResult);
  console.log('');

  const endTime = Date.now();
  const duration = endTime - startTime;

  // Generate results
  const result: BenchmarkResult = {
    version: VERSION,
    timestamp: new Date().toISOString(),
    duration,
    system: systemInfo,
    cpu: cpuResult,
    memory: memoryResult,
    disk: diskResult,
    network: networkResult,
  };

  // Print summary
  printSummary(duration);

  // Handle output based on mode
  const hostname = systemInfo?.hostname || 'server';
  const { generateTxtResult } = await import('./utils/output');
  
  if (uploadMode === 'public') {
    // Upload to benix.app (public)
    const url = await uploadResults(result, BENIX_API, false, sessionId);
    if (url) {
      console.log('');
      console.log(`  ${colors.white}View your results at:${colors.reset}`);
      console.log(`  ${colors.cyan}${colors.bold}${url}${colors.reset}`);
      console.log('');
    }
  } else {
    // Private mode: upload basic info + save to file
    // Upload basic info to server (private flag)
    await uploadResults(result, BENIX_API, true, sessionId);
    
    // Also save full results to local file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    
    // Determine save directory: /root for root user, else $HOME
    let saveDir = process.env.HOME || '/tmp';
    if (root) {
      saveDir = '/root';
    }
    
    const filename = `${saveDir}/benix-${hostname}-${timestamp}.txt`;
    const txtContent = generateTxtResult(result, hostname);
    await Bun.write(filename, txtContent);
    
    console.log('');
    console.log(`  ${colors.green}✓${colors.reset} Results exported to ${colors.white}${filename}${colors.reset}`);
  }

  // Footer
  console.log(`  ${colors.dim}benix.app | One Command. Full Insights.${colors.reset}`);
  console.log(`  ${colors.dim}Generated by Benix v${VERSION}${colors.reset}`);
  console.log('');
}

async function askUploadMode(): Promise<'public' | 'private' | 'none'> {
  console.log('');
  console.log(`  ${colors.white}Share your benchmark results?${colors.reset}`);
  console.log(`  ${colors.dim}1. Yes, upload to benix.app (public)${colors.reset}`);
  console.log(`  ${colors.dim}2. No, save to file only (private)${colors.reset}`);
  console.log('');

  process.stdout.write(`  Choice [1/2]: `);
  
  const response = await new Promise<string>((resolve) => {
    let input = '';
    if (process.stdin.isTTY) {
      process.stdin.setRawMode?.(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data) => {
      input = data.toString().trim().toLowerCase();
      if (process.stdin.isTTY) {
        process.stdin.setRawMode?.(false);
      }
      process.stdin.pause();
      resolve(input);
    });
  });

  // Clear the entire prompt section
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[5A\x1b[J');
  }

  // Determine mode
  const mode = response === '1' || response === 'y' || response === 'yes' ? 'public' : 'private';
  
  // Show appropriate message
  if (mode === 'public') {
    process.stdout.write(`  ${colors.green}✓${colors.reset} Results will be uploaded to benix.app\n`);
  } else {
    process.stdout.write(`  ${colors.dim}○${colors.reset} Results will be saved to file only\n`);
  }
  
  // Wait then clear the message
  await new Promise(resolve => setTimeout(resolve, 1500));
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[1A\x1b[J');
  }

  return mode;
}

function printSummary(duration: number) {
  console.log('');
  console.log(`${colors.cyan}════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`  ${colors.green}✓${colors.reset} Benchmark completed in ${colors.white}${formatDuration(duration)}${colors.reset}`);
  console.log(`${colors.cyan}════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
}

function printHelp() {
  console.log(`
${colors.cyan}Benix${colors.reset} - VPS Benchmark Tool v${VERSION}
${colors.dim}One Command. Full Insights.${colors.reset}

${colors.white}Usage:${colors.reset} benix [OPTIONS]

${colors.white}Options:${colors.reset}
  -u, --upload       Upload results to benix.app (public)
  -p, --private      Save results to file only (no upload)
  -q, --quiet        Quiet mode (minimal output)
  --skip-fio         Skip fio random IOPS test (if fio not installed)
  --servers <num>    Number of speed test servers (default: 20)
  -h, --help         Show this help message
  -v, --version      Show version

${colors.white}Examples:${colors.reset}
  ${colors.dim}$${colors.reset} benix              ${colors.dim}# Run benchmark (will ask to share)${colors.reset}
  ${colors.dim}$${colors.reset} benix -u           ${colors.dim}# Run and upload results (public)${colors.reset}
  ${colors.dim}$${colors.reset} benix -p           ${colors.dim}# Run and save to file only${colors.reset}
  ${colors.dim}$${colors.reset} benix --servers 4  ${colors.dim}# Test only 4 servers${colors.reset}

${colors.white}Website:${colors.reset}  ${colors.cyan}https://benix.app${colors.reset}
${colors.white}GitHub:${colors.reset}   ${colors.cyan}https://github.com/benixapp/benix${colors.reset}
`);
}

// Run
main().catch((err) => {
  printError(err.message);
  process.exit(1);
});
