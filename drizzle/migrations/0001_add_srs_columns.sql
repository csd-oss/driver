-- Add spaced repetition columns to mistakes table
ALTER TABLE `mistakes` ADD COLUMN `next_review_at` integer;
ALTER TABLE `mistakes` ADD COLUMN `interval_days` integer DEFAULT 0 NOT NULL;
