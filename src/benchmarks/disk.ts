/**
 * Disk Performance Benchmark
 * Ported from Marix BenchmarkService.ts
 */

import { exec, checkCommand } from '../utils/exec';
import { colors, printProgress, clearProgress, printWarning, printInfo } from '../utils/console';
import { formatSpeed, formatIops } from '../utils/format';

export interface DiskResult {
  sequentialWrite: string;
  sequentialRead: string;
  ioLatency: string;
  fio?: {
    '4k': FioResult;
    '64k': FioResult;
    '512k': FioResult;
    '1m': FioResult;
  };
}

interface FioResult {
  readBw: string;
  writeBw: string;
  readIops: string;
  writeIops: string;
}

async function runDdWrite(testFile: string, bs: string = '1M', count: number = 256): Promise<number> {
  try {
    // Write test
    const result = await exec(
      `dd if=/dev/zero of=${testFile} bs=${bs} count=${count} oflag=direct 2>&1`
    );
    
    // Parse speed
    const match = result.match(/([\d.]+)\s*(GB|MB|kB|B)\/s/);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2];
      
      const multipliers: Record<string, number> = {
        'B': 1,
        'kB': 1024,
        'MB': 1024 * 1024,
        'GB': 1024 * 1024 * 1024
      };
      
      return value * (multipliers[unit] || 1);
    }
    
    // Try alternative format (bytes, seconds)
    const bytesMatch = result.match(/([\d,]+)\s+bytes/);
    const timeMatch = result.match(/([\d.]+)\s*s(?:econds)?/);
    
    if (bytesMatch && timeMatch) {
      const bytes = parseInt(bytesMatch[1].replace(/,/g, ''));
      const seconds = parseFloat(timeMatch[1]);
      return bytes / seconds;
    }
  } catch (error) {
    // Ignore errors
  }
  
  return 0;
}

async function runDdRead(testFile: string, bs: string = '1M', count: number = 256): Promise<number> {
  try {
    // Clear cache
    await exec('sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true');
    
    // Read test
    const result = await exec(
      `dd if=${testFile} of=/dev/null bs=${bs} count=${count} iflag=direct 2>&1`
    );
    
    // Parse speed
    const match = result.match(/([\d.]+)\s*(GB|MB|kB|B)\/s/);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2];
      
      const multipliers: Record<string, number> = {
        'B': 1,
        'kB': 1024,
        'MB': 1024 * 1024,
        'GB': 1024 * 1024 * 1024
      };
      
      return value * (multipliers[unit] || 1);
    }
    
    // Try alternative format
    const bytesMatch = result.match(/([\d,]+)\s+bytes/);
    const timeMatch = result.match(/([\d.]+)\s*s(?:econds)?/);
    
    if (bytesMatch && timeMatch) {
      const bytes = parseInt(bytesMatch[1].replace(/,/g, ''));
      const seconds = parseFloat(timeMatch[1]);
      return bytes / seconds;
    }
  } catch (error) {
    // Ignore errors
  }
  
  return 0;
}

async function runIoping(testDir: string): Promise<string> {
  if (!await checkCommand('ioping')) {
    return 'N/A (ioping not installed)';
  }

  try {
    const result = await exec(`ioping -c 10 ${testDir} 2>&1`);
    
    // Parse average latency
    const match = result.match(/min\/avg\/max\/mdev = ([\d.]+)\s*(\w+)\s*\/\s*([\d.]+)\s*(\w+)/);
    if (match) {
      return `${match[3]} ${match[4]}`;
    }
    
    // Alternative format
    const avgMatch = result.match(/avg[^=]*=\s*([\d.]+)\s*(\w+)/i);
    if (avgMatch) {
      return `${avgMatch[1]} ${avgMatch[2]}`;
    }
  } catch (error) {
    // Ignore errors
  }
  
  return 'N/A';
}

async function runFio(testFile: string, bs: string, runtime: number = 30): Promise<FioResult | null> {
  if (!await checkCommand('fio')) {
    return null;
  }

  try {
    const result = await exec(
      `fio --name=test --filename=${testFile} --size=256M --bs=${bs} --ioengine=libaio ` +
      `--iodepth=64 --rw=randrw --rwmixread=50 --direct=1 --runtime=${runtime} ` +
      `--time_based --group_reporting --output-format=json 2>/dev/null`
    );
    
    const json = JSON.parse(result);
    const job = json.jobs?.[0];
    
    if (job) {
      return {
        readBw: formatSpeed(job.read?.bw * 1024 || 0),
        writeBw: formatSpeed(job.write?.bw * 1024 || 0),
        readIops: formatIops(Math.round(job.read?.iops || 0)),
        writeIops: formatIops(Math.round(job.write?.iops || 0))
      };
    }
  } catch (error) {
    // Ignore errors
  }
  
  return null;
}

export async function runDiskBenchmark(skipFio: boolean = false): Promise<DiskResult> {
  const testDir = '/tmp';
  const testFile = `${testDir}/benix_disk_test_${Date.now()}`;
  
  let result: DiskResult = {
    sequentialWrite: 'N/A',
    sequentialRead: 'N/A',
    ioLatency: 'N/A'
  };

  // Check and auto-install tools if needed
  let hasIoping = await checkCommand('ioping');
  let hasFio = await checkCommand('fio');
  
  // Try to install missing tools
  if (!hasIoping || (!hasFio && !skipFio)) {
    // Detect package manager
    const hasApt = await checkCommand('apt-get');
    const hasYum = await checkCommand('yum');
    const hasDnf = await checkCommand('dnf');
    const hasApk = await checkCommand('apk');
    
    if (hasApt) {
      // Debian/Ubuntu
      if (!hasIoping) {
        printProgress('Installing ioping');
        await exec('apt-get update -qq && apt-get install -y -qq ioping 2>/dev/null');
        clearProgress();
        hasIoping = await checkCommand('ioping');
      }
      if (!hasFio && !skipFio) {
        printProgress('Installing fio');
        await exec('apt-get install -y -qq fio 2>/dev/null');
        clearProgress();
        hasFio = await checkCommand('fio');
      }
    } else if (hasYum) {
      // CentOS/RHEL
      if (!hasIoping) {
        printProgress('Installing ioping');
        await exec('yum install -y -q epel-release 2>/dev/null && yum install -y -q ioping 2>/dev/null');
        clearProgress();
        hasIoping = await checkCommand('ioping');
      }
      if (!hasFio && !skipFio) {
        printProgress('Installing fio');
        await exec('yum install -y -q fio 2>/dev/null');
        clearProgress();
        hasFio = await checkCommand('fio');
      }
    } else if (hasDnf) {
      // Fedora
      if (!hasIoping) {
        printProgress('Installing ioping');
        await exec('dnf install -y -q ioping 2>/dev/null');
        clearProgress();
        hasIoping = await checkCommand('ioping');
      }
      if (!hasFio && !skipFio) {
        printProgress('Installing fio');
        await exec('dnf install -y -q fio 2>/dev/null');
        clearProgress();
        hasFio = await checkCommand('fio');
      }
    } else if (hasApk) {
      // Alpine
      if (!hasIoping) {
        printProgress('Installing ioping');
        await exec('apk add --quiet ioping 2>/dev/null');
        clearProgress();
        hasIoping = await checkCommand('ioping');
      }
      if (!hasFio && !skipFio) {
        printProgress('Installing fio');
        await exec('apk add --quiet fio 2>/dev/null');
        clearProgress();
        hasFio = await checkCommand('fio');
      }
    }
  }
  
  // Warn if still not installed
  if (!hasIoping) {
    printWarning('ioping not available - I/O latency test will be skipped');
  }
  if (!hasFio && !skipFio) {
    printWarning('fio not available - random IOPS test will be skipped');
  }

  try {
    // Sequential Write
    printProgress('Testing sequential write speed');
    const writeSpeed = await runDdWrite(testFile);
    result.sequentialWrite = writeSpeed > 0 ? formatSpeed(writeSpeed) : 'N/A';
    clearProgress();

    // Sequential Read
    printProgress('Testing sequential read speed');
    const readSpeed = await runDdRead(testFile);
    result.sequentialRead = readSpeed > 0 ? formatSpeed(readSpeed) : 'N/A';
    clearProgress();

    // Clean up test file
    await exec(`rm -f ${testFile}`);

    // I/O Latency
    if (hasIoping) {
      printProgress('Testing I/O latency');
      result.ioLatency = await runIoping(testDir);
      clearProgress();
    } else {
      result.ioLatency = 'N/A (ioping not installed)';
    }

    // FIO Random IOPS
    if (!skipFio && hasFio) {
      const blockSizes = ['4k', '64k', '512k', '1m'] as const;
      const fioResults: Partial<DiskResult['fio']> = {};

      for (const bs of blockSizes) {
        printProgress(`Testing random IOPS (${bs})`);
        const fioResult = await runFio(`${testFile}_fio`, bs, 15);
        if (fioResult) {
          fioResults[bs] = fioResult;
        }
        clearProgress();
      }

      // Clean up fio test file
      await exec(`rm -f ${testFile}_fio`);

      if (Object.keys(fioResults).length === 4) {
        result.fio = fioResults as DiskResult['fio'];
      }
    }
  } catch (error) {
    clearProgress();
    // Clean up on error
    await exec(`rm -f ${testFile} ${testFile}_fio 2>/dev/null || true`);
  }

  return result;
}

export function printDiskResult(result: DiskResult): void {
  const c = colors;
  
  console.log(`  ${c.dim}Sequential Write${c.reset}  ${c.green}${result.sequentialWrite}${c.reset}`);
  console.log(`  ${c.dim}Sequential Read${c.reset}   ${c.green}${result.sequentialRead}${c.reset}`);
  console.log(`  ${c.dim}I/O Latency${c.reset}       ${c.yellow}${result.ioLatency}${c.reset}`);
  
  if (result.fio) {
    console.log('');
    console.log(`  ${c.cyan}Random IOPS (fio):${c.reset}`);
    console.log(`  ${c.dim}Block   Read BW     Write BW    Read IOPS   Write IOPS${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(60)}${c.reset}`);
    
    for (const [bs, data] of Object.entries(result.fio)) {
      console.log(
        `  ${c.white}${bs.toUpperCase().padEnd(6)}${c.reset}  ` +
        `${c.green}${data.readBw.padEnd(10)}${c.reset}  ` +
        `${c.green}${data.writeBw.padEnd(10)}${c.reset}  ` +
        `${c.cyan}${data.readIops.padEnd(10)}${c.reset}  ` +
        `${c.cyan}${data.writeIops}${c.reset}`
      );
    }
  }
}
