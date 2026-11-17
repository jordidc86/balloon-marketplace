/** The partial unique event_key index rejects duplicate inserts atomically.
 * PostgREST upsert(onConflict: 'event_key') cannot infer that partial index.
 */
export async function insertListingEventOnce(client, event) {
  const result = await client.from('listing_events').insert(event)
  if (result.error?.code === '23505'
      && result.error.message?.includes('listing_events_event_key_unique')) {
    return { error: null }
  }
  return result
}
