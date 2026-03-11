"use client";

import React, { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, CheckCircle } from "lucide-react";

type FeedbackFormProps = {
  supabase: SupabaseClient;
};

export function FeedbackForm({ supabase }: FeedbackFormProps) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return;
    }

    setLoading(true);
    setSuccess(false);

    const { error } = await supabase.from("feedback").insert({
      user_id: user.id,
      user_email: user.email ?? null,
      message: message.trim(),
    });

    setLoading(false);
    if (error) {
      return;
    }
    setSuccess(true);
    setMessage("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="feedback-message" className="sr-only">
          Your feedback
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Share unfiltered feedback, bug reports, or feature ideas..."
          rows={10}
          className="w-full resize-y rounded-xl border border-stone-200 bg-white px-4 py-4 text-base text-stone-900 shadow-sm transition placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
          disabled={loading}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              Sending...
            </>
          ) : (
            "Submit feedback"
          )}
        </button>
        {success && (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-green-600">
            <CheckCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
            Success!
          </span>
        )}
      </div>
    </form>
  );
}
