import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/server'

export interface PushPayload {
  title: string
  body:  string
  url?:  string
}

let vapidConfigured = false

function getWebPush() {
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return null
  if (!vapidConfigured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:admin@motiv.app',
      pub,
      priv
    )
    vapidConfigured = true
  }
  return webpush
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    const wp = getWebPush()
    if (!wp) return
    const db = createAdminClient()
    const { data: subs } = await db
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)

    if (!subs?.length) return

    const message = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? '/' })

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await wp.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            message
          )
        } catch (err: any) {
          // Subscription expired or gone — clean it up
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      })
    )
  } catch {
    // Never let push errors break the calling API route
  }
}

export async function sendPushToMany(userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.all(userIds.map(id => sendPushToUser(id, payload)))
}
