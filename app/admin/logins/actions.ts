"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function createLoginAction(data: {
  name: string
  phone: string
  bank_name: string
  status?: string
  assigned_to?: string | null
  notes?: string
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    const tenantId = profile?.tenant_id
    if (!tenantId) throw new Error("Tenant ID not found")

    let cleanPhone = data.phone.replace(/\D/g, '')
    if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10)
    if (cleanPhone.length !== 10) throw new Error("Please enter a valid 10-digit mobile number")

    const initialStatus = data.status || 'Login Done'
    const bankName = data.bank_name.trim()

    const initialAttempts = bankName ? [{
      bank: bankName,
      status: initialStatus === 'Login Done' ? 'Pending' : initialStatus,
      date: new Date().toISOString()
    }] : []

    const insertPayload = {
      name: data.name.trim(),
      phone: cleanPhone,
      bank_name: bankName,
      status: initialStatus,
      assigned_to: data.assigned_to || user.id,
      notes: data.notes?.trim() || '',
      bank_attempts: initialAttempts,
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data: created, error } = await supabase
      .from('logins')
      .insert([insertPayload])
      .select('*')
      .single()

    if (error) throw error

    revalidatePath('/admin/logins')
    revalidatePath('/telecaller/logins')

    return { success: true, login: created }
  } catch (err: any) {
    console.error("Create login error:", err)
    return { success: false, error: err.message || "Failed to create login" }
  }
}

export async function updateLoginAction(
  id: string,
  data: {
    name: string
    phone: string
    bank_name: string
    status: string
    assigned_to?: string | null
    notes?: string
    bank_attempts?: any[]
  }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    let cleanPhone = data.phone.replace(/\D/g, '')
    if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10)

    const updatePayload: any = {
      name: data.name.trim(),
      phone: cleanPhone,
      bank_name: data.bank_name.trim(),
      status: data.status,
      assigned_to: data.assigned_to === 'unassigned' ? null : (data.assigned_to || null),
      notes: data.notes?.trim() || '',
      updated_at: new Date().toISOString()
    }

    if (data.bank_attempts) {
      updatePayload.bank_attempts = data.bank_attempts
    }

    const { error } = await supabase
      .from('logins')
      .update(updatePayload)
      .eq('id', id)

    if (error) throw error

    revalidatePath('/admin/logins')
    return { success: true }
  } catch (err: any) {
    console.error("Update login error:", err)
    return { success: false, error: err.message || "Failed to update login" }
  }
}

export async function updateLoginStatusAction(id: string, newStatus: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Fetch existing bank attempts to sync status
    const { data: existing } = await supabase.from('logins').select('bank_attempts, bank_name').eq('id', id).single()

    let updatedAttempts = existing?.bank_attempts || []
    if (Array.isArray(updatedAttempts) && updatedAttempts.length > 0) {
      const lastIndex = updatedAttempts.length - 1
      updatedAttempts[lastIndex] = {
        ...updatedAttempts[lastIndex],
        status: newStatus === 'Login Done' ? 'Pending' : newStatus,
        date: new Date().toISOString()
      }
    }

    const { error } = await supabase
      .from('logins')
      .update({
        status: newStatus,
        bank_attempts: updatedAttempts,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error

    revalidatePath('/admin/logins')
    return { success: true }
  } catch (err: any) {
    console.error("Update login status error:", err)
    return { success: false, error: err.message || "Failed to update status" }
  }
}

export async function deleteLoginAction(id: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { error } = await supabase.from('logins').delete().eq('id', id)
    if (error) throw error

    revalidatePath('/admin/logins')
    return { success: true }
  } catch (err: any) {
    console.error("Delete login error:", err)
    return { success: false, error: err.message || "Failed to delete login" }
  }
}

export async function checkLoginDuplicateAction(phone: string, excludeId?: string) {
  try {
    const supabase = await createClient()
    let cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10)
    if (cleanPhone.length < 10) return { exists: false }

    let query = supabase
      .from('logins')
      .select('id, name, phone, bank_name, status, created_at, assigned_to, users:assigned_to(full_name)')
      .ilike('phone', `%${cleanPhone}%`)
      .order('created_at', { ascending: false })
      .limit(1)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data } = await query.maybeSingle()

    if (data) {
      return { 
        exists: true, 
        login: {
          id: data.id,
          name: data.name,
          phone: data.phone,
          bank_name: data.bank_name,
          status: data.status,
          created_at: data.created_at,
          agent_name: (data as any).users?.full_name || 'Another Agent'
        }
      }
    }

    return { exists: false }
  } catch (err: any) {
    console.error("Check duplicate error:", err)
    return { exists: false }
  }
}
