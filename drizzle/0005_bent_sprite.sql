ALTER TABLE `rounds` ADD `gold_avg_vol` real;--> statement-breakpoint
ALTER TABLE `rounds` ADD `btc_avg_vol` real;--> statement-breakpoint
ALTER TABLE `rounds` ADD `price_snapshot_meta` text;--> statement-breakpoint
ALTER TABLE `rounds` ADD `avg_vol_meta` text;--> statement-breakpoint
ALTER TABLE `rounds` ADD `sui_create_pool_tx_digest` text(100);--> statement-breakpoint
ALTER TABLE `rounds` ADD `sui_lock_pool_tx_digest` text(100);--> statement-breakpoint
ALTER TABLE `rounds` ADD `sui_finalize_tx_digest` text(100);--> statement-breakpoint
ALTER TABLE `rounds` ADD `sui_fee_coin_object_id` text(100);