/**
 * Memory Benchmark
 * Native implementation using ArrayBuffer operations
 * Tests: Read, Write, Copy, Latency
 * 
 * Methodology: Run multiple iterations and average results
 */

import { colors, printProgress, clearProgress } from '../utils/console';

export interface MemoryBenchmark {
  // Info
  total: string;
  used: string;

  // Performance
  read: number;       // GB/s
  write: number;      // GB/s
  copy: number;       // GB/s
  latency: number;    // nanoseconds
}

const ITERATIONS = 3;           // Number of iterations for averaging
const BLOCK_SIZE = 64 * 1024 * 1024; // 64 MB blocks for bandwidth tests
const LATENCY_ARRAY_SIZE = 16 * 1024 * 1024; // 16M elements for latency test
const LATENCY_ACCESSES = 1000000; // 1M random accesses

/**
 * Get memory info from /proc/meminfo
 */
async function getMemoryInfo(): Promise<{ total: string; used: string }> {
  try {
    const file = Bun.file('/proc/meminfo');
    const meminfo = await file.text();

    const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
    const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);

    if (totalMatch) {
      const totalKb = parseInt(totalMatch[1]);
      const totalBytes = totalKb * 1024;
      const totalGb = (totalBytes / (1024 ** 3)).toFixed(2);

      let usedStr = 'N/A';
      if (availMatch) {
        const availKb = parseInt(availMatch[1]);
        const usedBytes = (totalKb - availKb) * 1024;
        const usedGb = (usedBytes / (1024 ** 3)).toFixed(2);
        usedStr = `${usedGb} GB`;
      }

      return {
        total: `${totalGb} GB`,
        used: usedStr,
      };
    }
  } catch {
    // Ignore errors
  }

  return { total: 'N/A', used: 'N/A' };
}

/**
 * Memory write benchmark
 * Measures how fast we can fill memory
 */
function benchmarkWrite(sizeBytes: number): number {
  const buffer = new Uint8Array(sizeBytes);
  const iterations = 3;
  const results: number[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    const start = performance.now();

    // Fill with sequential values (forces actual writes)
    for (let i = 0; i < sizeBytes; i++) {
      buffer[i] = i & 0xFF;
    }

    const elapsed = (performance.now() - start) / 1000; // seconds
    const gbPerSec = (sizeBytes / (1024 ** 3)) / elapsed;
    results.push(gbPerSec);
  }

  // Average
  return results.reduce((a, b) => a + b, 0) / results.length;
}

/**
 * Memory read benchmark
 * Measures how fast we can read from memory
 */
function benchmarkRead(sizeBytes: number): number {
  const buffer = new Uint8Array(sizeBytes);
  // Pre-fill buffer
  for (let i = 0; i < sizeBytes; i++) {
    buffer[i] = i & 0xFF;
  }

  const iterations = 3;
  const results: number[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    let sum = 0;
    const start = performance.now();

    // Read all values
    for (let i = 0; i < sizeBytes; i++) {
      sum += buffer[i];
    }

    const elapsed = (performance.now() - start) / 1000; // seconds
    const gbPerSec = (sizeBytes / (1024 ** 3)) / elapsed;
    results.push(gbPerSec);

    // Use sum to prevent optimization
    if (sum < 0) console.log('');
  }

  // Average
  return results.reduce((a, b) => a + b, 0) / results.length;
}

/**
 * Memory copy benchmark
 * Measures how fast we can copy memory
 */
function benchmarkCopy(sizeBytes: number): number {
  const src = new Uint8Array(sizeBytes);
  const dst = new Uint8Array(sizeBytes);

  // Pre-fill source
  for (let i = 0; i < sizeBytes; i++) {
    src[i] = i & 0xFF;
  }

  const iterations = 3;
  const results: number[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    const start = performance.now();

    // Copy
    dst.set(src);

    const elapsed = (performance.now() - start) / 1000; // seconds
    const gbPerSec = (sizeBytes / (1024 ** 3)) / elapsed;
    results.push(gbPerSec);
  }

  // Average
  return results.reduce((a, b) => a + b, 0) / results.length;
}

/**
 * Memory latency benchmark
 * Measures random access latency using pointer chasing
 */
function benchmarkLatency(): number {
  // Create array with shuffled indices (pointer chasing)
  const size = LATENCY_ARRAY_SIZE;
  const indices = new Uint32Array(size);

  // Initialize with sequential indices
  for (let i = 0; i < size; i++) {
    indices[i] = i;
  }

  // Shuffle to create random access pattern
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const iterations = 3;
  const results: number[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    let idx = 0;
    const accesses = LATENCY_ACCESSES;

    const start = performance.now();

    // Pointer chasing - follow the chain
    for (let i = 0; i < accesses; i++) {
      idx = indices[idx % size];
    }

    const elapsed = (performance.now() - start) * 1e6; // nanoseconds
    const nsPerAccess = elapsed / accesses;
    results.push(nsPerAccess);

    // Use idx to prevent optimization
    if (idx < 0) console.log('');
  }

  // Average
  return results.reduce((a, b) => a + b, 0) / results.length;
}

/**
 * Main memory benchmark function
 */
export async function runMemoryBenchmark(): Promise<MemoryBenchmark> {
  // Get memory info
  const memInfo = await getMemoryInfo();

  printProgress('Testing memory write speed');
  const writeSpeed = benchmarkWrite(BLOCK_SIZE);

  clearProgress();
  printProgress('Testing memory read speed');
  const readSpeed = benchmarkRead(BLOCK_SIZE);

  clearProgress();
  printProgress('Testing memory copy speed');
  const copySpeed = benchmarkCopy(BLOCK_SIZE);

  clearProgress();
  printProgress('Testing memory latency');
  const latency = benchmarkLatency();

  clearProgress();

  return {
    total: memInfo.total,
    used: memInfo.used,
    read: Math.round(readSpeed * 100) / 100,
    write: Math.round(writeSpeed * 100) / 100,
    copy: Math.round(copySpeed * 100) / 100,
    latency: Math.round(latency * 10) / 10,
  };
}

/**
 * Print memory benchmark results
 */
export function printMemoryResult(result: MemoryBenchmark): void {
  const c = colors;

  console.log(`  ${c.dim}Total${c.reset}           ${c.white}${result.total}${c.reset}`);
  console.log(`  ${c.dim}Used${c.reset}            ${c.white}${result.used}${c.reset}`);
  console.log('');
  console.log(`  ${c.dim}Read${c.reset}            ${c.cyan}${result.read.toFixed(2)} GB/s${c.reset}`);
  console.log(`  ${c.dim}Write${c.reset}           ${c.cyan}${result.write.toFixed(2)} GB/s${c.reset}`);
  console.log(`  ${c.dim}Copy${c.reset}            ${c.cyan}${result.copy.toFixed(2)} GB/s${c.reset}`);
  console.log(`  ${c.dim}Latency${c.reset}         ${c.cyan}${result.latency.toFixed(1)} ns${c.reset}`);
}
