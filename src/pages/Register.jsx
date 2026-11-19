import db from '@/api/client';

import React, { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Mail, Lock, Loader2, Building2, Phone } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";
import useSiteConfig from "@/hooks/useSiteConfig";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountType, setAccountType] = useState("traveller");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("Uganda");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { google: googleEnabled } = useSiteConfig();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (accountType === "operator") {
      if (companyName.trim().length < 2) {
        setError("Enter your bus company name");
        return;
      }
      if (!phone.trim()) {
        setError("Enter a contact phone number");
        return;
      }
    }
    setLoading(true);
    try {
      await db.auth.register({ email, password });
      if (accountType === "operator") {
        try {
          await db.profile.applyOperator({
            companyName: companyName.trim(),
            phone: phone.trim(),
            country,
          });
        } catch (err) {
          setError(
            `${err.message || "Could not submit your operator application."} Your account was created — sign in and retry from this page.`
          );
          return;
        }
        window.location.href = "/operator";
        return;
      }
      window.location.href = safeReturnTo();
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    db.auth.loginWithProvider("google", safeReturnTo());
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}
            className="text-primary font-medium hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <div className="mb-6 space-y-2">
        <Label>I am signing up as</Label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
          <button
            type="button"
            role="radio"
            aria-checked={accountType === "traveller"}
            onClick={() => setAccountType("traveller")}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              accountType === "traveller"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40"
            }`}
          >
            <span className="block text-sm font-semibold">Traveller</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Book bus tickets</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={accountType === "operator"}
            onClick={() => setAccountType("operator")}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              accountType === "operator"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40"
            }`}
          >
            <span className="block text-sm font-semibold">Bus operator</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Sell tickets on YooTerminal</span>
          </button>
        </div>
      </div>

      {googleEnabled && accountType === "traveller" && (
        <>
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-medium mb-6"
            onClick={handleGoogle}
          >
            <GoogleIcon className="w-5 h-5 mr-2" />
            Continue with Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">or</span>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        {accountType === "operator" && (
          <div className="space-y-4 rounded-xl border border-border bg-secondary/40 p-4">
            <p className="text-xs text-muted-foreground">
              Your company is reviewed by the platform team. You can set up fleet and fares right away; your departures
              stay hidden from customers until you are approved.
            </p>
            <div className="space-y-2">
              <Label htmlFor="company">Bus company name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="company"
                  autoComplete="organization"
                  placeholder="e.g. Rwenzori Express"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="pl-10 h-12"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Contact phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+256 700 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-10 h-12"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="country" className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Uganda">Uganda</SelectItem>
                  <SelectItem value="Rwanda">Rwanda</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
