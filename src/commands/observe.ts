import { type Logger } from "../logging";
import { findRootFromOptions } from "../fs/paths";
import { spawn } from "node:child_process";

export interface ObserveOptions {
  cwd?: string;
  verbose?: boolean;
}

export async function observeCommand(
  options: ObserveOptions,
  logger: Logger
): Promise<void> {
  const root = findRootFromOptions(options);
  
  logger.info("Initializing Cybernetic Observer...");
  
  const lifeLog = "life.log";
  
  // Clear screen
  process.stdout.write('\x1Bc');
  
  console.log("👁️  CYBERNETIC OBSERVER ACTIVE");
  console.log("----------------------------");
  console.log(`Monitoring: ${root}/${lifeLog}`);
  console.log("Press Ctrl+C to exit.\n");

  try {
    // Tail log
    const tail = spawn("tail", ["-f", lifeLog], { stdio: "inherit", cwd: root });
    
    // Handle interrupt
    process.on('SIGINT', () => {
      tail.kill();
      console.log("\nObserver terminated.");
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  } catch (err) {
    logger.error(`Failed to start observer: ${err}`);
  }
}
