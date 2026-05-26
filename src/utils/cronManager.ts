import { CronJob, validateCronExpression } from "cron";
import type { GenerationContext } from "./generationContext";

type CronHandler = () => void | Promise<void>;

interface CronTask {
  cron: string;
  description?: string;
  job: CronJob | null;
  executions: Set<Promise<void>>;
  running: number;
  executionsStarted: number;
  executionsFinished: number;
}

class CronManager {
  private tasks: Map<string, CronTask> = new Map();

  set(
    name: string,
    cron: string,
    handler: CronHandler,
    context?: GenerationContext
  ): () => void {
    if (this.tasks.has(name)) {
      throw new Error(`Cron task "${name}" already exists.`);
    }

    const validate = validateCronExpression(cron)
    if (!validate.valid) {
      console.log(`CronManager set new cronJob ${name} error while invalid cron`, validate.error);
      return () => undefined;
    }

    let job: CronJob;
    const taskState: CronTask = {
      cron,
      job: null,
      executions: new Set(),
      running: 0,
      executionsStarted: 0,
      executionsFinished: 0,
    };

    job = new CronJob(cron, () => {
      if (context?.signal.aborted) return;
      taskState.running += 1;
      taskState.executionsStarted += 1;
      const task = Promise.resolve(handler()).finally(() => {
        taskState.executions.delete(task);
        taskState.running = Math.max(0, taskState.running - 1);
        taskState.executionsFinished += 1;
      });
      taskState.executions.add(task);
      if (context) {
        context.trackTask(task, { label: `cron:${name}:execution`, kind: "cron-execution" });
        task.catch(console.error);
      } else {
        task.catch(console.error);
      }
    });

    taskState.job = job;
    job.start();
    this.tasks.set(name, taskState);
    const stopCronTask = async (): Promise<void> => {
      await this.del(name);
    };
    const dispose = context?.trackDisposable(stopCronTask, {
      label: `cron:${name}:job`,
      kind: "cron-job",
    }) ?? stopCronTask;
    return dispose;
  }

  async del(name: string): Promise<boolean> {
    const task = this.tasks.get(name);
    if (!task) return false;
    if (task.job) {
      task.job.stop();
    }
    this.tasks.delete(name);
    if (task.executions.size > 0) {
      await Promise.allSettled([...task.executions]);
    }
    return true;
  }

  ls(raw?: boolean): string[] | Map<string, CronTask> {
    if (raw) {
      return this.tasks;
    }
    return Array.from(this.tasks.keys());
  }

  async clear(): Promise<void> {
    const names = [...this.tasks.keys()];
    await Promise.all(names.map((name) => this.del(name)));
  }

  has(name: string): boolean {
    return this.tasks.has(name);
  }
}

const cronManager = new CronManager();

export { cronManager };
