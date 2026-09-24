import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          // Ajuste para o novo padrão de objeto de cookies do Next.js
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          const previousCookies = supabaseResponse.cookies.getAll()
          const previousHeaders = new Headers(supabaseResponse.headers)
          supabaseResponse = NextResponse.next({
            request,
          })
          previousCookies.forEach((cookie) => supabaseResponse.cookies.set(cookie))
          for (const name of ['cache-control', 'expires', 'pragma']) {
            const value = previousHeaders.get(name)
            if (value) supabaseResponse.headers.set(name, value)
          }
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set({ name, value, ...options })
          )
          Object.entries(headers ?? {}).forEach(([name, value]) =>
            supabaseResponse.headers.set(name, value)
          )
        },
      },
    }
  )

  let user: User | null = null
  let authError: unknown = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
    authError = result.error
  } catch (error) {
    authError = error
  }

  // Redirects must retain refreshed cookies and the SDK's cache-control headers.
  function preserveSession(response: NextResponse) {
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    for (const name of ['cache-control', 'expires', 'pragma']) {
      const value = supabaseResponse.headers.get(name)
      if (value) response.headers.set(name, value)
    }
    return response
  }

  return { supabase, user, authError, response: supabaseResponse, preserveSession }
}
