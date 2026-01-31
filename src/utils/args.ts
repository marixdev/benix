/**
 * Argument parser
 */

export interface Args {
  help: boolean;
  version: boolean;
  upload: boolean | undefined;
  quiet: boolean;
  skipFio: boolean;
  servers: number;
  private: boolean;
}

export function parseArgs(): Args {
  const args: Args = {
    help: false,
    version: false,
    upload: undefined,
    quiet: false,
    skipFio: false,
    servers: 20,
    private: false,
  };

  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    switch (arg) {
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '-v':
      case '--version':
        args.version = true;
        break;
      case '-u':
      case '--upload':
        args.upload = true;
        break;
      case '--no-upload':
        args.upload = false;
        break;
      case '-p':
      case '--private':
        args.private = true;
        break;
      case '-q':
      case '--quiet':
        args.quiet = true;
        args.upload = args.upload ?? false;
        break;
      case '--skip-fio':
        args.skipFio = true;
        break;
      case '--servers': {
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) {
          args.servers = parseInt(next, 10) || 20;
          i++;
        }
        break;
      }
    }
  }

  return args;
}
