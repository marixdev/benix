/**
 * Console utilities - Colors and printing helpers
 */

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

export function printBanner() {
  const c = colors;
  console.log('');
  console.log(`${c.cyan}   ██████╗ ███████╗███╗   ██╗██╗██╗  ██╗${c.reset}`);
  console.log(`${c.cyan}   ██╔══██╗██╔════╝████╗  ██║██║╚██╗██╔╝${c.reset}`);
  console.log(`${c.cyan}   ██████╔╝█████╗  ██╔██╗ ██║██║ ╚███╔╝${c.reset}`);
  console.log(`${c.cyan}   ██╔══██╗██╔══╝  ██║╚██╗██║██║ ██╔██╗${c.reset}`);
  console.log(`${c.cyan}   ██████╔╝███████╗██║ ╚████║██║██╔╝ ██╗${c.reset}`);
  console.log(`${c.cyan}   ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝${c.reset}`);
  console.log('');
  console.log(`   ${c.white}One Command. Full Insights.${c.reset}`);
  console.log(`   ${c.dim}Part of Marix Zero-Knowledge SSH Client${c.reset}`);
  console.log(`   ${c.dim}https://benix.app${c.reset}`);
  console.log('');
}

export function printSection(title: string) {
  console.log('');
  console.log(`${colors.cyan}┌────────────────────────────────────────────────────────────────────────────────┐${colors.reset}`);
  console.log(`${colors.cyan}│${colors.white}${colors.bold}  ${title}${colors.reset}`);
  console.log(`${colors.cyan}└────────────────────────────────────────────────────────────────────────────────┘${colors.reset}`);
}

export function printInfo(label: string, value: string) {
  const paddedLabel = label.padEnd(16);
  console.log(`  ${colors.gray}${paddedLabel}${colors.reset}: ${colors.white}${value}${colors.reset}`);
}

export function printResult(label: string, value: string, color: string = colors.green) {
  const paddedLabel = label.padEnd(18);
  console.log(`  ${colors.gray}${paddedLabel}${colors.reset} ${color}${value}${colors.reset}`);
}

export function printProgress(message: string) {
  // Use \r for TTY, otherwise just print
  if (process.stdout.isTTY) {
    process.stdout.write(`\r  ${colors.yellow}⏳${colors.reset} ${message}...`.padEnd(80));
  }
}

export function clearProgress() {
  if (process.stdout.isTTY) {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }
}

export function printSuccess(message: string) {
  console.log(`  ${colors.green}✓${colors.reset} ${message}`);
}

export function printError(message: string) {
  console.log(`  ${colors.red}✗${colors.reset} ${message}`);
}

export function printWarning(message: string) {
  console.log(`  ${colors.yellow}⚠${colors.reset} ${message}`);
}

export function printDim(message: string) {
  console.log(`  ${colors.gray}○${colors.reset} ${message}`);
}

// Table printing
export function printTableHeader(columns: string[]) {
  const header = columns.map((col, i) => col.padEnd(i === 0 ? 22 : 12)).join(' ');
  console.log(`  ${colors.gray}${header}${colors.reset}`);
  console.log(`  ${colors.gray}${'─'.repeat(70)}${colors.reset}`);
}

export function printTableRow(cells: string[], cellColors?: string[]) {
  const row = cells.map((cell, i) => {
    const padded = cell.padEnd(i === 0 ? 22 : 12);
    const color = cellColors?.[i] || colors.white;
    return `${color}${padded}${colors.reset}`;
  }).join(' ');
  console.log(`  ${row}`);
}
