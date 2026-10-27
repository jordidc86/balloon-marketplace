export const stateSpecs = {
  listings: ['listings', 'id,status,public_at,updated_at'],
  listingQuality: ['listing_quality_state', 'listing_id,status,consecutive_failures,last_checked_at,notification_status'],
  commercialNotifications: ['commercial_notification_receipts', 'id,status,delivery_attempts,next_attempt_at,attempted_at,accepted_at'],
  indexingReceipts: ['indexing_submission_receipts', 'id,status,attempts,attempted_at,accepted_at'],
  listingWatchDispatches: ['listing_watch_dispatches', 'id,status,attempted_at,accepted_at,updated_at'],
  wantedMatchDispatches: ['wanted_match_dispatches', 'id,status,attempted_at,accepted_at,updated_at'],
  newsletterRuns: ['newsletter_runs', 'id,status,started_at,completed_at,provider_dispatch_started_at'],
  newsletterRecipients: ['newsletter_recipients', 'id,run_id,status,resend_id'],
  socialPublicationReceipts: ['social_publication_receipts', 'id,status,attempt_count,claimed_at,next_attempt_at,accepted_at,updated_at'],
}

