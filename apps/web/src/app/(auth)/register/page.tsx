import { Suspense } from 'react';
import { AuthForm } from '@/components/app/AuthForm';
export const metadata = { title: 'Create an account' };
export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="register" />
    </Suspense>
  );
}
