import { listBackgroundJobs, waitBackgroundJob, cancelBackgroundJob } from '../tools/background-jobs';
import { logger } from '../services/logger';

/** Direct job controls, without a model/API request. */
export async function handleJobsCommand(args: string): Promise<void> {
  const [action = 'list', id, wait] = args.trim().split(/\s+/).filter(Boolean);
  if (action === 'list') {
    const jobs = listBackgroundJobs();
    logger.write(jobs.length ? jobs.map(j => `${j.id}  ${j.status}${j.exitCode !== undefined ? `  exit=${j.exitCode}` : ''}\n  ${j.command}`).join('\n') : 'Kayıtlı arka plan işi yok.');
    return;
  }
  if ((action === 'wait' || action === 'cancel') && id) {
    const result = action === 'cancel' ? await cancelBackgroundJob({ job_id: id })
      : await waitBackgroundJob({ job_id: id, wait_seconds: wait === undefined ? 30 : Number(wait) });
    logger.write(JSON.stringify(JSON.parse(result), null, 2));
    return;
  }
  logger.write('Kullanım: /jobs | /jobs wait <job_id> [saniye] | /jobs cancel <job_id>');
}
