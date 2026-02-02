/**
 * Output utilities - JSON, TXT, Upload
 */

import type { BenchmarkResult } from '../index';
import { colors, printProgress, clearProgress, printSuccess, printError } from './console';

export function generateJsonResult(result: BenchmarkResult): string {
  return JSON.stringify(result, null, 2);
}

export function generateTxtResult(result: BenchmarkResult, hostname: string): string {
  const lines: string[] = [];
  const divider = '═'.repeat(80);
  
  lines.push(divider);
  lines.push(`  BENIX SERVER BENCHMARK - ${hostname}`);
  lines.push(`  ${new Date().toLocaleString()}`);
  lines.push(divider);
  lines.push('');

  if (result.system) {
    lines.push('┌────────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                            SYSTEM INFORMATION                                  │');
    lines.push('└────────────────────────────────────────────────────────────────────────────────┘');
    lines.push(`  OS              : ${result.system.os}`);
    lines.push(`  Hostname        : ${result.system.hostname}`);
    lines.push(`  Kernel          : ${result.system.kernel}`);
    lines.push(`  Arch            : ${result.system.arch}`);
    lines.push(`  CPU             : ${result.system.cpu.model}`);
    lines.push(`  CPU Cores       : ${result.system.cpu.cores}`);
    lines.push(`  CPU Freq        : ${result.system.cpu.frequency}`);
    lines.push(`  Memory          : ${result.system.memory.used} / ${result.system.memory.total} (${result.system.memory.percent}%)`);
    lines.push(`  Swap            : ${result.system.swap}`);
    lines.push(`  Disk            : ${result.system.disk}`);
    lines.push(`  Uptime          : ${result.system.uptime}`);
    lines.push(`  Load Average    : ${result.system.loadAverage}`);
    lines.push(`  Virtualization  : ${result.system.virtualization}`);
    // IPv4/IPv6 connectivity
    const ipv4 = result.system.ipv4 ? '✔ Online' : '✘ Offline';
    const ipv6 = result.system.ipv6 ? '✔ Online' : '✘ Offline';
    lines.push(`  IPv4/IPv6       : ${ipv4} / ${ipv6}`);
    lines.push('');
  }

  if (result.cpu) {
    lines.push('┌────────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                            CPU BENCHMARK                                       │');
    lines.push('└────────────────────────────────────────────────────────────────────────────────┘');
    lines.push(`  Model           : ${result.cpu.model}`);
    lines.push(`  Cores/Threads   : ${result.cpu.cores} / ${result.cpu.threads}`);
    const freqStr = result.cpu.frequency.max
      ? `${result.cpu.frequency.base} MHz (Max: ${result.cpu.frequency.max} MHz)`
      : `${result.cpu.frequency.base} MHz`;
    lines.push(`  Frequency       : ${freqStr}`);
    lines.push(`  Cache           : L2: ${result.cpu.cache.l2}, L3: ${result.cpu.cache.l3}`);
    lines.push(`  AES-NI          : ${result.cpu.hasAESNI ? 'Yes' : 'No'}`);
    lines.push('');
    lines.push(`  Single-thread   : ${result.cpu.benchmark.singleThread.toLocaleString()} ops/s`);
    lines.push(`  Multi-thread    : ${result.cpu.benchmark.multiThread.toLocaleString()} ops/s`);
    lines.push(`  Scaling         : ${result.cpu.benchmark.scaling}%`);
    lines.push('');
    const formatBytes = (b: number) => b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB/s` : b >= 1e6 ? `${(b / 1e6).toFixed(2)} MB/s` : `${b} B/s`;
    lines.push(`  AES-256-GCM     : ${formatBytes(result.cpu.crypto.aes256gcm)}`);
    lines.push(`  SHA256          : ${formatBytes(result.cpu.crypto.sha256)}`);
    if (result.cpu.isVirtual && result.cpu.cpuSteal !== undefined) {
      lines.push(`  CPU Steal       : ${result.cpu.cpuSteal}% (${result.cpu.stealRating})`);
    }
    lines.push('');
  }

  if (result.memory) {
    lines.push('┌────────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                            MEMORY BENCHMARK                                    │');
    lines.push('└────────────────────────────────────────────────────────────────────────────────┘');
    lines.push(`  Total           : ${result.memory.total}`);
    lines.push(`  Used            : ${result.memory.used}`);
    lines.push('');
    lines.push(`  Read            : ${result.memory.read.toFixed(2)} GB/s`);
    lines.push(`  Write           : ${result.memory.write.toFixed(2)} GB/s`);
    lines.push(`  Copy            : ${result.memory.copy.toFixed(2)} GB/s`);
    lines.push(`  Latency         : ${result.memory.latency.toFixed(1)} ns`);
    lines.push('');
  }

  if (result.disk) {
    lines.push('┌────────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                            DISK PERFORMANCE                                    │');
    lines.push('└────────────────────────────────────────────────────────────────────────────────┘');
    
    // Show table format if rounds available
    if (result.disk.writeRounds?.length || result.disk.readRounds?.length) {
      lines.push('  Test                 Average        Run 1        Run 2        Run 3');
      lines.push('  ' + '─'.repeat(72));
      
      const padVal = (v: string | undefined, len: number) => (v || '-').padEnd(len);
      
      // Write row
      lines.push(`  Sequential Write     ${padVal(result.disk.sequentialWrite, 13)} ${padVal(result.disk.writeRounds?.[0], 12)} ${padVal(result.disk.writeRounds?.[1], 12)} ${result.disk.writeRounds?.[2] || '-'}`);
      
      // Read row
      lines.push(`  Sequential Read      ${padVal(result.disk.sequentialRead, 13)} ${padVal(result.disk.readRounds?.[0], 12)} ${padVal(result.disk.readRounds?.[1], 12)} ${result.disk.readRounds?.[2] || '-'}`);
    } else {
      lines.push(`  Sequential Write  : ${result.disk.sequentialWrite}`);
      lines.push(`  Sequential Read   : ${result.disk.sequentialRead}`);
    }
    
    lines.push(`  I/O Latency       : ${result.disk.ioLatency}`);
    
    if (result.disk.fio) {
      lines.push('');
      lines.push('  Random IOPS (fio):');
      lines.push('  ┌───────────┬────────────┬────────────┬────────────┬────────────┐');
      lines.push('  │ Block     │   Read BW  │  Write BW  │  Read IOPS │ Write IOPS │');
      lines.push('  ├───────────┼────────────┼────────────┼────────────┼────────────┤');
      
      for (const [bs, data] of Object.entries(result.disk.fio)) {
        const d = data as { readBw: string; writeBw: string; readIops: string; writeIops: string };
        lines.push(`  │ ${bs.toUpperCase().padEnd(9)} │ ${d.readBw.padEnd(10)} │ ${d.writeBw.padEnd(10)} │ ${d.readIops.padEnd(10)} │ ${d.writeIops.padEnd(10)} │`);
      }
      
      lines.push('  └───────────┴────────────┴────────────┴────────────┴────────────┘');
    }
    lines.push('');
  }

  if (result.network) {
    lines.push('┌────────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                            NETWORK SPEED                                       │');
    lines.push('└────────────────────────────────────────────────────────────────────────────────┘');
    lines.push(`  Public IP : ${result.network.publicIp}`);
    lines.push(`  Provider  : ${result.network.provider}`);
    lines.push(`  Location  : ${result.network.location}`);
    lines.push('');
    lines.push(`  ${'Server'.padEnd(22)} ${'Location'.padEnd(18)} ${'Down'.padEnd(12)} ${'Up'.padEnd(12)} Latency`);
    lines.push('  ' + '─'.repeat(76));
    
    for (const test of result.network.tests) {
      lines.push(`  ${test.server.substring(0, 21).padEnd(22)} ${test.location.substring(0, 17).padEnd(18)} ${test.download.padEnd(12)} ${test.upload.padEnd(12)} ${test.latency}`);
    }
    lines.push('');
  }

  lines.push(divider);
  lines.push(`  Duration: ${Math.round(result.duration / 1000)}s`);
  lines.push('');
  lines.push('  Website : https://benix.app');
  lines.push('  GitHub  : https://github.com/benixapp/benix');
  lines.push('  Generated by Benix v' + result.version);
  lines.push(divider);

  return lines.join('\n');
}

export async function uploadResults(result: BenchmarkResult, apiUrl: string, isPrivate: boolean = false, sessionId?: string): Promise<string | null> {
  // Only show progress for public uploads
  if (!isPrivate) {
    printProgress('Uploading results to benix.app');
  }
  
  // Mask IP address before upload (e.g., 103.22.103.33 → 103.22.**.33)
  const maskIp = (ip: string): string => {
    if (!ip) return ip;
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.**.${parts[3]}`;
    }
    return ip;
  };
  
  try {
    // Transform result to match API expected format
    const payload = {
      data: {
        system: result.system ? {
          hostname: result.system.hostname,
          os: result.system.os,
          kernel: result.system.kernel,
          cpu: result.system.cpu.model,
          cores: result.system.cpu.cores,
          frequency: result.system.cpu.frequency,
          memory: result.system.memory,
          swap: result.system.swap ? {
            used: result.system.swap.split('/')[0]?.trim() || '',
            total: result.system.swap.split('/')[1]?.trim() || '',
            percent: parseInt(result.system.swap.match(/(\d+)%/)?.[1] || '0'),
          } : undefined,
          disk: {
            used: result.system.disk.split('/')[0]?.trim() || '',
            total: result.system.disk.split('/')[1]?.trim() || '',
            percent: parseInt(result.system.disk.match(/\((\d+)/)?.[1] || '0'),
          },
          virtualization: result.system.virtualization,
          uptime: result.system.uptime,
          loadAverage: result.system.loadAverage,
          ipv4: result.system.ipv4,
          ipv6: result.system.ipv6,
        } : null,
        cpu: result.cpu ? {
          model: result.cpu.model,
          cores: result.cpu.cores,
          threads: result.cpu.threads,
          frequency: result.cpu.frequency,
          cache: result.cpu.cache,
          virtualization: result.cpu.virtualization,
          isVirtual: result.cpu.isVirtual,
          hasAESNI: result.cpu.hasAESNI,
          benchmark: result.cpu.benchmark,
          crypto: result.cpu.crypto,
          cpuSteal: result.cpu.cpuSteal,
          stealRating: result.cpu.stealRating,
        } : null,
        memory: result.memory ? {
          total: result.memory.total,
          used: result.memory.used,
          read: result.memory.read,
          write: result.memory.write,
          copy: result.memory.copy,
          latency: result.memory.latency,
        } : null,
        disk: result.disk ? {
          seqWrite: result.disk.sequentialWrite,
          seqRead: result.disk.sequentialRead,
          writeRounds: result.disk.writeRounds,
          readRounds: result.disk.readRounds,
          ioLatency: result.disk.ioLatency,
          fio: result.disk.fio,
        } : null,
        network: result.network ? {
          publicIp: maskIp(result.network.publicIp),
          provider: result.network.provider,
          location: result.network.location,
          tests: result.network.tests.map(t => ({
            server: t.server,
            location: t.location,
            download: parseFloat(t.download) || 0,
            upload: parseFloat(t.upload) || 0,
            latency: parseFloat(t.latency) || 0,
          })),
        } : null,
        duration: Math.round(result.duration / 1000),
      },
      source: 'benix',
      is_private: isPrivate,
      session_id: sessionId,
    };

    const response = await fetch(`${apiUrl}/api/benchmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!isPrivate) {
      clearProgress();
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (!isPrivate) {
        console.error('Upload error:', errorText);
        printError('Failed to upload results');
      }
      // Silent fail for private - still save to file
      return null;
    }

    const data = await response.json() as { success?: boolean; id?: string; url?: string };
    
    if (data.success && data.id) {
      if (!isPrivate) {
        printSuccess('Results uploaded!');
      }
      // Use localhost URL for local testing, production URL otherwise
      const baseUrl = apiUrl.includes('localhost') ? 'http://localhost:8081' : 'https://benix.app';
      return `${baseUrl}/b/${data.id}`;
    }

    if (!isPrivate) {
      printError('Failed to get result ID');
    }
    return null;
  } catch (error) {
    if (!isPrivate) {
      clearProgress();
      printError(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    return null;
  }
}