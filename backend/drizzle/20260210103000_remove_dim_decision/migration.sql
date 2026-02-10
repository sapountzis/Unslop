UPDATE "classification_cache" SET "decision" = 'hide' WHERE "decision" = 'dim';
UPDATE "user_activity" SET "decision" = 'hide' WHERE "decision" = 'dim';
UPDATE "post_feedback" SET "rendered_decision" = 'hide' WHERE "rendered_decision" = 'dim';

ALTER TYPE "decision" RENAME TO "decision_old";
CREATE TYPE "decision" AS ENUM('keep', 'hide');

ALTER TABLE "classification_cache"
  ALTER COLUMN "decision" TYPE "decision"
  USING "decision"::text::"decision";

ALTER TABLE "user_activity"
  ALTER COLUMN "decision" TYPE "decision"
  USING "decision"::text::"decision";

ALTER TABLE "post_feedback"
  ALTER COLUMN "rendered_decision" TYPE "decision"
  USING "rendered_decision"::text::"decision";

DROP TYPE "decision_old";
