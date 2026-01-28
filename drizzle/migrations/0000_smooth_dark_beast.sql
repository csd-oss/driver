CREATE TABLE `answer_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`lang` integer NOT NULL,
	`question_id` text NOT NULL,
	`mode` text NOT NULL,
	`session_id` text,
	`mock_exam_id` text,
	`category_text` text,
	`selected_answer_index` integer NOT NULL,
	`correct_answer_index` integer NOT NULL,
	`is_correct` integer NOT NULL,
	`points` integer NOT NULL,
	`question_shown_at` integer NOT NULL,
	`answer_submitted_at` integer NOT NULL,
	`response_time_ms` integer NOT NULL,
	`was_in_mistakes` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `study_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mock_exam_id`) REFERENCES `mock_exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `answer_attempts_lang_idx` ON `answer_attempts` (`lang`);--> statement-breakpoint
CREATE INDEX `answer_attempts_question_idx` ON `answer_attempts` (`question_id`);--> statement-breakpoint
CREATE INDEX `answer_attempts_mode_idx` ON `answer_attempts` (`mode`);--> statement-breakpoint
CREATE INDEX `answer_attempts_session_idx` ON `answer_attempts` (`session_id`);--> statement-breakpoint
CREATE INDEX `answer_attempts_date_idx` ON `answer_attempts` (`created_at`);--> statement-breakpoint
CREATE INDEX `answer_attempts_mock_exam_idx` ON `answer_attempts` (`mock_exam_id`);--> statement-breakpoint
CREATE INDEX `answer_attempts_sync_idx` ON `answer_attempts` (`synced_at`);--> statement-breakpoint
CREATE TABLE `category_selections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lang` integer NOT NULL,
	`category_text` text DEFAULT 'all' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_selections_lang_unique` ON `category_selections` (`lang`);--> statement-breakpoint
CREATE TABLE `mistakes` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`lang` integer NOT NULL,
	`question_id` text NOT NULL,
	`streak_count` integer DEFAULT 0 NOT NULL,
	`next_review_at` integer,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mistakes_lang_question_unique` ON `mistakes` (`lang`,`question_id`);--> statement-breakpoint
CREATE INDEX `mistakes_lang_idx` ON `mistakes` (`lang`);--> statement-breakpoint
CREATE TABLE `mock_exams` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`lang` integer NOT NULL,
	`test_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`duration_sec` integer,
	`score` integer,
	`max_score` integer NOT NULL,
	`min_to_pass` integer NOT NULL,
	`passed` integer,
	`wrong_count` integer,
	`added_to_mistakes_count` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`synced_at` integer
);
--> statement-breakpoint
CREATE INDEX `mock_exams_lang_idx` ON `mock_exams` (`lang`);--> statement-breakpoint
CREATE INDEX `mock_exams_date_idx` ON `mock_exams` (`created_at`);--> statement-breakpoint
CREATE INDEX `mock_exams_sync_idx` ON `mock_exams` (`synced_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lang` integer DEFAULT 1 NOT NULL,
	`has_onboarded` integer DEFAULT false NOT NULL,
	`has_chosen_language` integer DEFAULT false NOT NULL,
	`use_conservative_readiness` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`lang` integer NOT NULL,
	`mode` text NOT NULL,
	`category_text` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`questions_count` integer DEFAULT 0,
	`correct_count` integer DEFAULT 0,
	`synced_at` integer
);
--> statement-breakpoint
CREATE INDEX `study_sessions_lang_idx` ON `study_sessions` (`lang`);--> statement-breakpoint
CREATE INDEX `study_sessions_date_idx` ON `study_sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `study_sessions_sync_idx` ON `study_sessions` (`synced_at`);