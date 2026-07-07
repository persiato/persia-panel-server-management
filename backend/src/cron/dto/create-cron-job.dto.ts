import { IsString, Matches, MaxLength } from 'class-validator';

const CRON_FIELD =
  '(\\*(\\/[0-9]+)?|[0-9]+(-[0-9]+)?(\\/[0-9]+)?(,[0-9]+(-[0-9]+)?(\\/[0-9]+)?)*)';
const CRON_SCHEDULE_RE = new RegExp(`^${CRON_FIELD}(\\s+${CRON_FIELD}){4}$`);

export class CreateCronJobDto {
  @IsString()
  @Matches(CRON_SCHEDULE_RE, {
    message: 'schedule must be a valid 5-field cron expression',
  })
  schedule: string;

  @IsString()
  @MaxLength(1000)
  @Matches(/^[^\r\n]+$/, { message: 'command must be a single line' })
  command: string;
}
