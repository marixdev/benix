/**
 * System Information Benchmark
 * Ported from Marix BenchmarkService.ts
 */

import { exec } from '../utils/exec';
import { colors, printProgress, clearProgress, printInfo } from '../utils/console';

export interface SystemInfo {
  os: string;
  hostname: string;
  kernel: string;
  arch: string;
  cpu: {
    model: string;
    cores: number;
    frequency: string;
  };
  memory: {
    total: string;
    used: string;
    percent: number;
  };
  swap: string;
  disk: string;
  uptime: string;
  loadAverage: string;
  virtualization: string;
  ipv4: boolean;  // IPv4 connectivity
  ipv6: boolean;  // IPv6 connectivity
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Check IPv4/IPv6 connectivity (similar to YABS)
async function checkIPConnectivity(): Promise<{ ipv4: boolean; ipv6: boolean }> {
  let ipv4 = false;
  let ipv6 = false;

  try {
    // Check IPv4 connectivity
    const ipv4Result = await exec('curl -4 -s --max-time 5 https://ipv4.icanhazip.com 2>/dev/null');
    ipv4 = ipv4Result.trim().length > 0 && /^\d{1,3}(\.\d{1,3}){3}$/.test(ipv4Result.trim());
  } catch {
    ipv4 = false;
  }

  try {
    // Check IPv6 connectivity
    const ipv6Result = await exec('curl -6 -s --max-time 5 https://ipv6.icanhazip.com 2>/dev/null');
    ipv6 = ipv6Result.trim().length > 0 && /^[0-9a-f:]+$/i.test(ipv6Result.trim());
  } catch {
    ipv6 = false;
  }

  return { ipv4, ipv6 };
}

async function getOsInfo(): Promise<{ os: string; kernel: string; hostname: string; arch: string }> {
  let os = 'Unknown';
  let kernel = 'Unknown';
  let hostname = 'Unknown';
  let arch = 'Unknown';

  try {
    // Get OS info
    const osRelease = await exec('cat /etc/os-release 2>/dev/null || cat /etc/lsb-release 2>/dev/null');
    const prettyName = osRelease.match(/PRETTY_NAME="?([^"\n]+)"?/);
    if (prettyName) os = prettyName[1];
    else {
      const distro = osRelease.match(/DISTRIB_DESCRIPTION="?([^"\n]+)"?/);
      if (distro) os = distro[1];
    }

    // Get kernel
    kernel = (await exec('uname -r')).trim();

    // Get hostname
    hostname = (await exec('hostname')).trim();

    // Get architecture
    arch = (await exec('uname -m')).trim();
  } catch (error) {
    // Ignore errors
  }

  return { os, kernel, hostname, arch };
}

async function getCpuInfo(): Promise<{ model: string; cores: number; frequency: string }> {
  let model = 'Unknown';
  let cores = 0;
  let frequency = 'Unknown';

  try {
    const cpuinfo = await exec('cat /proc/cpuinfo');
    
    // Model
    const modelMatch = cpuinfo.match(/model name\s*:\s*(.+)/);
    if (modelMatch) {
      model = modelMatch[1].trim()
        .replace(/\(R\)/g, '')
        .replace(/\(TM\)/g, '')
        .replace(/CPU @.*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Cores
    const coreMatches = cpuinfo.match(/processor\s*:/g);
    cores = coreMatches ? coreMatches.length : 1;

    // Frequency
    const freqMatch = cpuinfo.match(/cpu MHz\s*:\s*([\d.]+)/);
    if (freqMatch) {
      const mhz = parseFloat(freqMatch[1]);
      frequency = mhz >= 1000 ? `${(mhz / 1000).toFixed(2)} GHz` : `${mhz.toFixed(0)} MHz`;
    } else {
      // Try lscpu
      const lscpu = await exec('lscpu 2>/dev/null || true');
      const maxMhz = lscpu.match(/CPU max MHz:\s*([\d.]+)/);
      if (maxMhz) {
        const mhz = parseFloat(maxMhz[1]);
        frequency = mhz >= 1000 ? `${(mhz / 1000).toFixed(2)} GHz` : `${mhz.toFixed(0)} MHz`;
      }
    }

    // Check for AES-NI
    const aesni = cpuinfo.includes(' aes ');
    if (aesni) model += ' (AES-NI)';
  } catch (error) {
    // Ignore errors
  }

  return { model, cores, frequency };
}

async function getMemoryInfo(): Promise<{ total: string; used: string; percent: number }> {
  let total = 'Unknown';
  let used = 'Unknown';
  let percent = 0;

  try {
    const meminfo = await exec('cat /proc/meminfo');
    
    const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
    const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
    const freeMatch = meminfo.match(/MemFree:\s+(\d+)/);
    const buffersMatch = meminfo.match(/Buffers:\s+(\d+)/);
    const cachedMatch = meminfo.match(/^Cached:\s+(\d+)/m);

    if (totalMatch) {
      const totalKb = parseInt(totalMatch[1]);
      const totalBytes = totalKb * 1024;
      total = formatBytes(totalBytes);

      let usedBytes: number;
      if (availMatch) {
        const availKb = parseInt(availMatch[1]);
        usedBytes = (totalKb - availKb) * 1024;
      } else {
        const freeKb = parseInt(freeMatch?.[1] || '0');
        const buffersKb = parseInt(buffersMatch?.[1] || '0');
        const cachedKb = parseInt(cachedMatch?.[1] || '0');
        usedBytes = (totalKb - freeKb - buffersKb - cachedKb) * 1024;
      }

      used = formatBytes(usedBytes);
      percent = Math.round((usedBytes / totalBytes) * 100);
    }
  } catch (error) {
    // Ignore errors
  }

  return { total, used, percent };
}

async function getSwapInfo(): Promise<string> {
  try {
    const meminfo = await exec('cat /proc/meminfo');
    const totalMatch = meminfo.match(/SwapTotal:\s+(\d+)/);
    const freeMatch = meminfo.match(/SwapFree:\s+(\d+)/);

    if (totalMatch && freeMatch) {
      const total = parseInt(totalMatch[1]) * 1024;
      const free = parseInt(freeMatch[1]) * 1024;
      const used = total - free;

      if (total === 0) return 'Disabled';
      const percent = Math.round((used / total) * 100);
      return `${formatBytes(used)} / ${formatBytes(total)} (${percent}%)`;
    }
  } catch (error) {
    // Ignore errors
  }

  return 'Unknown';
}

async function getDiskInfo(): Promise<string> {
  try {
    const df = await exec("df -B1 / 2>/dev/null | tail -1");
    const parts = df.trim().split(/\s+/);
    
    if (parts.length >= 4) {
      const total = parseInt(parts[1]);
      const used = parseInt(parts[2]);
      const percent = Math.round((used / total) * 100);
      return `${formatBytes(used)} / ${formatBytes(total)} (${percent}%)`;
    }
  } catch (error) {
    // Ignore errors
  }

  return 'Unknown';
}

async function getUptime(): Promise<string> {
  try {
    const uptime = await exec('cat /proc/uptime');
    const seconds = parseInt(uptime.split(' ')[0]);
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.join(' ') || '< 1m';
  } catch (error) {
    return 'Unknown';
  }
}

async function getLoadAverage(): Promise<string> {
  try {
    const loadavg = await exec('cat /proc/loadavg');
    const parts = loadavg.trim().split(' ');
    return `${parts[0]}, ${parts[1]}, ${parts[2]}`;
  } catch (error) {
    return 'Unknown';
  }
}

async function getVirtualization(): Promise<string> {
  try {
    // Check systemd-detect-virt
    const detectVirt = await exec('systemd-detect-virt 2>/dev/null || true');
    const virt = detectVirt.trim();
    
    if (virt && virt !== 'none' && virt !== '') {
      const virtNames: Record<string, string> = {
        'kvm': 'KVM',
        'qemu': 'QEMU',
        'vmware': 'VMware',
        'microsoft': 'Hyper-V',
        'xen': 'Xen',
        'lxc': 'LXC',
        'openvz': 'OpenVZ',
        'docker': 'Docker',
        'podman': 'Podman',
        'oracle': 'VirtualBox',
        'parallels': 'Parallels',
        'bhyve': 'bhyve',
        'amazon': 'AWS EC2',
        'google': 'Google Cloud',
        'azure': 'Microsoft Azure'
      };
      return virtNames[virt] || virt.charAt(0).toUpperCase() + virt.slice(1);
    }

    // Check /proc/cpuinfo for hypervisor
    const cpuinfo = await exec('cat /proc/cpuinfo');
    if (cpuinfo.includes('hypervisor')) {
      return 'VM (Unknown)';
    }

    // Check DMI
    try {
      const dmi = await exec('cat /sys/class/dmi/id/product_name 2>/dev/null || true');
      if (dmi.includes('VirtualBox')) return 'VirtualBox';
      if (dmi.includes('VMware')) return 'VMware';
      if (dmi.includes('KVM')) return 'KVM';
      if (dmi.includes('QEMU')) return 'QEMU';
    } catch {}

    return 'Dedicated';
  } catch (error) {
    return 'Unknown';
  }
}

export async function collectSystemInfo(): Promise<SystemInfo> {
  printProgress('Collecting system information');

  const [osInfo, cpuInfo, memoryInfo, swap, disk, uptime, loadAvg, virt, ipConn] = await Promise.all([
    getOsInfo(),
    getCpuInfo(),
    getMemoryInfo(),
    getSwapInfo(),
    getDiskInfo(),
    getUptime(),
    getLoadAverage(),
    getVirtualization(),
    checkIPConnectivity()
  ]);

  clearProgress();

  const result: SystemInfo = {
    os: osInfo.os,
    hostname: osInfo.hostname,
    kernel: osInfo.kernel,
    arch: osInfo.arch,
    cpu: cpuInfo,
    memory: memoryInfo,
    swap,
    disk,
    uptime,
    loadAverage: loadAvg,
    virtualization: virt,
    ipv4: ipConn.ipv4,
    ipv6: ipConn.ipv6
  };

  return result;
}

export function printSystemInfo(info: SystemInfo): void {
  const c = colors;
  
  // IPv4/IPv6 connectivity status (like YABS)
  const ipv4Status = info.ipv4 ? `${c.green}✔ Online${c.reset}` : `${c.red}✘ Offline${c.reset}`;
  const ipv6Status = info.ipv6 ? `${c.green}✔ Online${c.reset}` : `${c.red}✘ Offline${c.reset}`;
  
  console.log(`  ${c.dim}OS${c.reset}              ${c.white}${info.os}${c.reset}`);
  console.log(`  ${c.dim}Hostname${c.reset}        ${c.white}${info.hostname}${c.reset}`);
  console.log(`  ${c.dim}Kernel${c.reset}          ${c.white}${info.kernel}${c.reset}`);
  console.log(`  ${c.dim}Architecture${c.reset}    ${c.white}${info.arch}${c.reset}`);
  console.log(`  ${c.dim}Virtualization${c.reset}  ${c.white}${info.virtualization}${c.reset}`);
  console.log(`  ${c.dim}IPv4/IPv6${c.reset}       ${ipv4Status} / ${ipv6Status}`);
  console.log('');
  console.log(`  ${c.dim}CPU Model${c.reset}       ${c.white}${info.cpu.model}${c.reset}`);
  console.log(`  ${c.dim}CPU Cores${c.reset}       ${c.white}${info.cpu.cores}${c.reset}`);
  console.log(`  ${c.dim}CPU Frequency${c.reset}   ${c.white}${info.cpu.frequency}${c.reset}`);
  console.log('');
  console.log(`  ${c.dim}Memory${c.reset}          ${c.cyan}${info.memory.used}${c.reset} / ${c.white}${info.memory.total}${c.reset} (${info.memory.percent}%)`);
  console.log(`  ${c.dim}Swap${c.reset}            ${c.white}${info.swap}${c.reset}`);
  console.log(`  ${c.dim}Disk${c.reset}            ${c.white}${info.disk}${c.reset}`);
  console.log('');
  console.log(`  ${c.dim}Uptime${c.reset}          ${c.white}${info.uptime}${c.reset}`);
  console.log(`  ${c.dim}Load Average${c.reset}    ${c.white}${info.loadAverage}${c.reset}`);
}
