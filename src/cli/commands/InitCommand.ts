import 'reflect-metadata';
import { Command } from 'commander';
import { injectable } from 'tsyringe';

import { runInitWizard } from '../../init-wizard-enhanced.js';
import { ExecError } from '../../types.js';

@injectable()
export class InitCommand {
  register(program: Command): void {
    program
      .command('init')
      .description('Initialize configuration with interactive wizard')
      .action(async () => {
        try {
          await runInitWizard();
        } catch (error) {
          const execError = error as ExecError;
          if (execError?.exitCode === 2) {
            // Special exit code to run sample query
            process.argv = [process.argv[0], process.argv[1], 'Hello, Council of Elders!'];
            program.parse(process.argv);
          }
        }
      });
  }
}
