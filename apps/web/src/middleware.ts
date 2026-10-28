import { NextResponse, type NextRequest } from 'next/server';

/** UX-only gate: real authorisation is enforced by the API on every request. */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('madar_at') || req.cookies.has('madar_rt');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/app/:path*'] };
