# Benix

<p align="center">
  <img src="https://benix.app/icon.png" alt="Benix Logo" width="120" />
</p>

<p align="center">
  <strong>One Command. Full Insights.</strong>
</p>

<p align="center">
  A comprehensive VPS benchmarking tool that tests CPU, memory, disk, and network performance.
</p>

<p align="center">
  <a href="https://benix.app">Website</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#features">Features</a> •
  <a href="#license">License</a>
</p>

---

## Features

- 🖥️ **System Information** - OS, kernel, CPU, memory, disk, virtualization detection
- ⚡ **CPU Benchmark** - Single & multi-threaded performance, AES-NI, SHA256 throughput
- 🧠 **Memory Benchmark** - Read/write/copy bandwidth, latency measurement
- 💾 **Disk Benchmark** - Sequential read/write, I/O latency, random IOPS (with fio)
- 🌐 **Network Speed** - Multi-server speed tests across 20+ global locations
- 📤 **Upload Results** - Share your benchmark at benix.app
- 🔒 **Private Mode** - Upload without exposing detailed results publicly

## Installation

### Quick Install (Recommended)

```bash
# Download binary
curl -fsSL https://benix.app/benix -o benix

# Make executable
chmod +x benix

# Run
./benix
```

Or one-liner:

```bash
curl -fsSL https://benix.app/benix -o benix && chmod +x benix && ./benix
```

### Install to PATH (Optional)

```bash
sudo mv benix /usr/local/bin/
benix
```

### Build from Source

Requires [Bun](https://bun.sh) v1.0+

```bash
git clone https://github.com/benixapp/benix.git
cd benix
bun install
bun build src/index.ts --compile --outfile benix
./benix
```

## Usage

```bash
# Run full benchmark
benix

# Run and upload results to benix.app
benix -u

# Upload as private (only basic info visible)
benix -u -p

# Test fewer servers (faster)
benix --servers 4

# Quiet mode (minimal output)
benix -q
```

### Options

| Option | Description |
|--------|-------------|
| `-u, --upload` | Upload results to benix.app |
| `-p, --private` | Mark results as private (only basic info visible) |
| `-q, --quiet` | Quiet mode (minimal output) |
| `--skip-fio` | Skip fio random IOPS test |
| `--servers <num>` | Number of speed test servers (default: 20) |
| `-h, --help` | Show help message |
| `-v, --version` | Show version |

## Sample Output

```
   ██████╗ ███████╗███╗   ██╗██╗██╗  ██╗
   ██╔══██╗██╔════╝████╗  ██║██║╚██╗██╔╝
   ██████╔╝█████╗  ██╔██╗ ██║██║ ╚███╔╝
   ██╔══██╗██╔══╝  ██║╚██╗██║██║ ██╔██╗
   ██████╔╝███████╗██║ ╚████║██║██╔╝ ██╗
   ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝

┌────────────────────────────────────────────────────────────────────────────────┐
│  System Information
└────────────────────────────────────────────────────────────────────────────────┘
  OS              Debian GNU/Linux 13
  CPU Model       AMD Ryzen 5 5600H (AES-NI)
  CPU Cores       12 @ 3.39 GHz
  Memory          7.15 GB
  Virtualization  KVM

┌────────────────────────────────────────────────────────────────────────────────┐
│  CPU Benchmark
└────────────────────────────────────────────────────────────────────────────────┘
  Single-thread   630 ops/s
  Multi-thread    7,560 ops/s (12 threads)
  AES-256-GCM     4.98 GB/s
  SHA256          2.12 GB/s

┌────────────────────────────────────────────────────────────────────────────────┐
│  Memory Benchmark
└────────────────────────────────────────────────────────────────────────────────┘
  Read            1.16 GB/s
  Write           1.37 GB/s
  Copy            6.00 GB/s
  Latency         90.7 ns

┌────────────────────────────────────────────────────────────────────────────────┐
│  Disk Performance
└────────────────────────────────────────────────────────────────────────────────┘
  Sequential Write  2.2 GB/s
  Sequential Read   10.1 GB/s

┌────────────────────────────────────────────────────────────────────────────────┐
│  Network Speed
└────────────────────────────────────────────────────────────────────────────────┘
  Server                Location           Download      Upload    Latency
  ──────────────────────────────────────────────────────────────────────
  FPT Telecom           Vietnam         ↓  236 Mbps ↑   20 Mbps   15.60 ms
  SIMBA Telecom         Singapore       ↓  117 Mbps ↑   11 Mbps   42.00 ms
  ...

════════════════════════════════════════════════════════════════════════════════
  ✓ Benchmark completed in 4m 11s
════════════════════════════════════════════════════════════════════════════════
```

## Requirements

- **OS**: Linux (x64, arm64)
- **Optional**: `fio` for random IOPS testing, `ioping` for I/O latency

Install optional dependencies:

```bash
# Debian/Ubuntu
sudo apt install fio ioping

# RHEL/CentOS/Fedora
sudo dnf install fio ioping

# Arch Linux
sudo pacman -S fio ioping
```

## Privacy

- **Public mode** (default): Full benchmark results visible at benix.app
- **Private mode** (`-p`): Only basic info (provider, OS, virtualization) shown publicly

No personal data is collected. Results can be deleted upon request.

## Related Projects

- [Marix](https://github.com/marixdev/marix) - Zero-Knowledge SSH Client with built-in Benix integration

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

---

<p align="center">
  Made with ❤️ by <a href="https://marix.dev">Marix SSH client</a>
</p>
