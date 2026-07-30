import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import webpush from 'web-push'

// Init Supabase Admin Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key"
)

// Init WebPush (Optional: for device alerts)
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      'mailto:support@hanva.in',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )
}

export async function POST(request: Request) {
  try {
    const { title, message, targetRole, currentUserId } = await request.json()

    // 1. Security Check: Ensure sender is an Admin
    const { data: sender } = await supabase
      .from('users')
      .select('role, tenant_id')
      .eq('id', currentUserId)
      .single()

    if (!sender || !['super_admin', 'tenant_admin', 'admin'].includes(sender.role)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // 2. Fetch Target Users
    let query = supabase.from('users').select('id').eq('is_active', true)
    
    if (targetRole !== 'all') {
        query = query.eq('role', targetRole)
    }

    const { data: users, error } = await query
    if (error || !users) throw new Error("Failed to fetch recipients")

    console.log(`📢 Broadcasting to ${users.length} users...`)

    // 3. Prepare Notification Data
    const notifications = users.map(u => {
        const payload: any = {
            user_id: u.id,
            title: title,
            message: message,
            type: 'admin_broadcast',
            is_read: false,
            created_at: new Date().toISOString()
        };
        if (sender.tenant_id) payload.tenant_id = sender.tenant_id;
        return payload;
    });

    // 4. Insert into Database (In-App Bell Icon)
    const { error: insertError } = await supabase.from('notifications').insert(notifications)
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 }) as any

    // 5. (Optional) Send Push to Devices (Parallel)
    // This part runs in background so it doesn't slow down the UI
    (async () => {
        for (const user of users) {
             const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', user.id)
             if (subs) {
                 const payload = JSON.stringify({ title, body: message, icon: '/icons/icon-192x192.png' })
                 for (const sub of subs) {
                     try {
                         await webpush.sendNotification({
                             endpoint: sub.endpoint,
                             keys: { p256dh: sub.p256dh_key, auth: sub.auth_key }
                         }, payload)
                     } catch (e) { /* Ignore failed pushes */ }
                 }
             }
        }
    })()

    return NextResponse.json({ success: true, count: users.length })

  } catch (error: any) {
    console.error("Broadcast Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
