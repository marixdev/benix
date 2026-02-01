// Shared types for benchmark data - matches CLI output structure
// This will be used by both Benix and Marix

export interface SystemInfo {
  hostname: string;
  os: string;
  kernel: string;
  cpu: string;
  cores: number;
  frequency: string;
  memory: {
    used: string;
    total: string;
    percent: number;
  };
  swap?: {
    used: string;
    total: string;
    percent: number;
  };
  disk: {
    used: string;
    total: string;
    percent: number;
  };
  virtualization: string;
  uptime: string;
  loadAverage: string;
}

export interface CPUBenchmark {
  // Info
  model: string;
  cores: number;
  threads: number;
  frequency: {
    base: number;    // MHz
    max?: number;    // MHz
  };
  cache: {
    l2: string;
    l3: string;
  };

  // Environment
  virtualization: string;
  isVirtual: boolean;
  hasAESNI: boolean;

  // Performance
  benchmark: {
    singleThread: number;   // ops/s
    multiThread: number;    // ops/s
    scaling: number;        // percentage
  };

  // Crypto (OpenSSL)
  crypto: {
    aes256gcm: number;      // bytes/s
    sha256: number;         // bytes/s
  };

  // vCPU Health
  cpuSteal?: number;        // percentage
  stealRating?: 'excellent' | 'good' | 'warning' | 'critical';
}

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

export interface DiskPerformance {
  seqWrite: string;
  seqRead: string;
  ioLatency: string;
  fio: {
    [blockSize: string]: {
      readIops: string;
      writeIops: string;
      readBw: string;
      writeBw: string;
    };
  };
}

export interface NetworkResult {
  location: string;
  server: string;
  download: number; // Mbps
  upload: number;   // Mbps
  latency: number;  // ms
}

export interface NetworkInfo {
  publicIp: string;
  provider: string;
  location: string;
  tests: NetworkResult[];
}

export interface BenchmarkData {
  system: SystemInfo;
  cpu?: CPUBenchmark;
  memory?: MemoryBenchmark;
  disk: DiskPerformance;
  network: NetworkInfo | NetworkResult[];  // Support both formats
  duration: number; // seconds
}

export interface BenchmarkRecord {
  id: string;
  hostname: string;
  data: BenchmarkData;
  createdAt: string;
  source: 'benix' | 'marix';
  ip?: string;
}

export interface CreateBenchmarkRequest {
  data: BenchmarkData;
  source?: 'benix' | 'marix';
  is_private?: boolean;
}

export interface BenchmarkListItem {
  id: string;
  hostname: string;
  os: string;
  cpu: string;
  cores: number;
  frequency: string;
  ram: string;
  disk: string;
  virtualization: string;
  provider: string;
  location: string;
  createdAt: string;
  source: 'benix' | 'marix';
  isPrivate?: boolean;
}
