'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

function isRedirectError(error: any): boolean {
  return typeof error === 'object' && error !== null && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')
}

export async function login(formData: FormData) {
  try {
    const supabase = await createClient()

    const data = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    }

    const { error } = await supabase.auth.signInWithPassword(data)

    if (error) {
      redirect('/login?error=' + encodeURIComponent(error.message))
    }

    revalidatePath('/', 'layout')
    redirect('/dashboard')
  } catch (error: any) {
    if (isRedirectError(error)) throw error
    redirect('/login?error=' + encodeURIComponent(error.message || 'An unexpected error occurred'))
  }
}

export async function signup(formData: FormData) {
  try {
    const supabase = await createClient()

    const data = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    }

    const { error } = await supabase.auth.signUp(data)

    if (error) {
      redirect('/login?error=' + encodeURIComponent(error.message))
    }

    revalidatePath('/', 'layout')
    redirect('/dashboard')
  } catch (error: any) {
    if (isRedirectError(error)) throw error
    redirect('/login?error=' + encodeURIComponent(error.message || 'An unexpected error occurred'))
  }
}

export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
