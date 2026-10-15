import React from "react";
import { SignIn } from "@clerk/react";
import { LogIn } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Login() {
  const returnTo = safeReturnTo();

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
    >
      <SignIn
        fallbackRedirectUrl={returnTo}
        signUpUrl="/login"
        appearance={{
          variables: {
            colorPrimary: "hsl(222.2 47.4% 11.2%)",
          },
        }}
      />
    </AuthLayout>
  );
}
