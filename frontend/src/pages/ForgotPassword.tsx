"use client";

import { Link, useNavigate } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { apiRequest } from "@/api/client";
import { Button, Input } from "@/components/scrb/primitives";
import { SealMark } from "@/components/scrb/insignia";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [badgeId, setBadgeId] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const data = await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({
          badgeId: badgeId.trim() || null,
          email: email.trim() || null,
        }),
      });
      setMessage(data.message || "Request submitted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <SealMark size={28} />
          <div>
            <h1 className="text-lg font-semibold">Forgot password</h1>
            <p className="text-xs text-muted-foreground">
              Submit your Service ID or email. An ancestor or Police IT must approve the reset.
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Service ID / Badge ID</label>
            <Input value={badgeId} onChange={(e) => setBadgeId(e.target.value)} placeholder="KA-00000" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Or email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="officer@example.com" className="mt-1" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-teal">{message}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Submitting…" : "Request reset"}
          </Button>
          <button type="button" onClick={() => navigate("/login")} className="w-full text-sm text-muted-foreground hover:text-foreground">
            Back to sign in
          </button>
        </form>
        <p className="mt-4 text-[11px] text-muted-foreground">
          No self-service unlock — resets are approved by your reporting chain or Police IT.
        </p>
        <Link to="/login" className="sr-only">Login</Link>
      </div>
    </main>
  );
}
