import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.cookies.get('session')) {
    return NextResponse.next();
  }

  // Dev-only auto-login: seeds a session cookie for the demo user
  // so the app is usable straight from the browser without a real
  // login flow. Remove this when swapping in real auth.
  const response = NextResponse.next();
  response.cookies.set('session', 'test-user-001', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return response;
}

export const config = {
  matcher: ['/api/:path*', '/posts/:path*'],
};