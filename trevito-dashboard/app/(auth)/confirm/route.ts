// Auth confirmation route handler
// Exchanges the token_hash from the magic link for a session
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/';

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    });

    if (!error) {
      // Redirect to home page or the 'next' parameter if provided
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // If there's an error, redirect to login with an error message
  // TODO: How will we handle showing this error message on the login page?
  return NextResponse.redirect(new URL('/login?error=Could not verify email', request.url));
}

