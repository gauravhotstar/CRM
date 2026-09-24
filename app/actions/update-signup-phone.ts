"use server"

import { createClient } from "@supabase/supabase-js"

export async function updateSignupPhone(userId: string, phone: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // Wait for the trigger to finish inserting the row first
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await supabaseAdmin
      .from('users')
      .update({ phone: phone })
      .eq('id', userId)
  } catch (err) {
    console.error("Failed to update phone", err)
  }
}
