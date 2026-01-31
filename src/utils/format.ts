/**
 * Format utilities
 */

export function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) {
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  } else if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(2)} MB`;
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

export function formatSpeed(bytesPerSec: number): string {
  const mbps = bytesPerSec / 1048576; // Convert to MB/s
  
  // If >= 1000 MB/s, show as GB/s
  if (mbps >= 1000) {
    return `${(mbps / 1024).toFixed(1)} GB/s`;
  }
  // If >= 100 MB/s, show rounded
  if (mbps >= 100) {
    return `${Math.round(mbps)} MB/s`;
  }
  // If >= 1 MB/s, show with 1 decimal
  if (mbps >= 1) {
    return `${mbps.toFixed(1)} MB/s`;
  }
  // Otherwise show KB/s
  return `${Math.round(bytesPerSec / 1024)} KB/s`;
}

export function formatIops(iops: number): string {
  if (iops >= 1000) {
    return `${(iops / 1000).toFixed(1)}k`;
  }
  return iops.toString();
}

export function formatSpeedMbps(bytesPerSec: number): string {
  const mbps = (bytesPerSec * 8) / 1000000;
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(2)} Gbps`;
  }
  return `${Math.round(mbps)} Mbps`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function parseSpeedString(speedStr: string): number {
  const match = speedStr.trim().match(/^([\d.]+)\s*(GB|MB|KB)\/s$/i);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  switch (unit) {
    case 'GB': return value * 1024;
    case 'MB': return value;
    case 'KB': return value / 1024;
    default: return value;
  }
}
