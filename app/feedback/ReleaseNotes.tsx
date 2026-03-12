"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

export type ReleaseItem = {
  version: string;
  date: string;
  title: string;
  founderNotes: string[];
  features: string[];
  bugFixes: string[];
};

const releases: ReleaseItem[] = [
  {
    version: "Chapter 1",
    date: "3/11/2026",
    title: "Chapter 1",
    founderNotes: [
      "Hi!",
      "Welcome to my release notes for Twizz. You already know about Twizz because you wouldn't have been able to find this without me talking your ear off about it. That said, my hope is that the number of people reading this grows as my goal with these is to tell the story of Twizz as we build it!",
      "Consider this chapter 1. Twizz has been an idea in my brain for some time. I have quite a few ideas but many times I find myself not seeing them through. When I had this idea, I initially made a few half-hearted attempts to do a quick version and then realized I was out of my depth and that I would likely need to pay someone to build my idea.",
      "The idea of Twizz is simple - get that trip you've been planning out of \"dream\" and into \"reality\" Whether it's a honeymoon, bachelor/bachelorette party or a quick weekend away, I want the app to make planning & execution of travel organized and frictionless.",
      "Several months ago, I got approved for Cal Poly's business incubator program for this idea. The cohort I got put in started in October of 2025 and around that time I realized I had a dream but nothing concrete. I told myself I would try to build something usable myself before the next cohort in May 2026 and the program was happy to accommodate me.",
      "I didn't know how to start though. I used vibe coding apps but none of them built something that felt \"sturdy\". With little success I kinda just moved on to other things, like re-watching The West Wing for the 100th time. I also moved jobs and physically moved from Morro Bay to Atascadero so I'm giving myself some slack on sitting on this idea for the better part of a year.",
      "Fast-forward two weeks ago. In my corporate job, I started working on a cross-functional team that has the goal of teaching my department how to \"fish\" in terms of creating our own AI-based automations. They had use download a program called Cursor and then gave me a quick demo. I then used Cursor to create a bot that registers for solar incentive programs so our internal team doesn't have to. The bot now has registered thousands of projects in the last week, and eliminated hundreds of man hours of work.",
      "I loved using the tool and then realized it could do way more than I was using it for. I watched some youtube videos and got to work so here we are. This was written the day I gave my public link to my super users reading this, so if you did end up reading this I hope you enjoyed!",
      "In chapter 2, I'll give you all an update on the feedback submitted so far and what I'm doing to keep building this!",
      "Wes",
    ],
    features: [],
    bugFixes: [],
  },
];

export function ReleaseNotes() {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
        Changelog / Release Notes
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        Enjoy the read!
      </p>

      <div className="mt-4 space-y-2">
        {releases.map((release) => (
          <details
            key={release.version}
            className="group rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-stone-100/80 px-4 py-3.5 transition-colors hover:bg-stone-100 [&::-webkit-details-marker]:hidden">
              <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <span className="font-mono text-sm font-semibold tracking-tight text-stone-900">
                  {release.version}
                </span>
                <span className="text-sm text-stone-500">{release.date}</span>
                <span className="text-sm font-medium text-stone-700">
                  {release.title}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-stone-500 transition-transform group-open:rotate-180" />
            </summary>

            <div className="border-t border-stone-200 bg-white px-4 py-4 sm:px-5 sm:py-5">
              {release.founderNotes.length > 0 ? (
                <div>
                  {release.founderNotes.map((paragraph, i) => (
                    <p
                      key={i}
                      className="mb-4 text-sm leading-relaxed text-stone-600 last:mb-0"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : null}

              {release.features.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    New & improved
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {release.features.map((feature, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-sm text-stone-700 before:mt-1.5 before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-stone-400 before:content-['']"
                      >
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {release.bugFixes.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Bug fixes
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {release.bugFixes.map((fix, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-sm text-stone-700 before:mt-1.5 before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-stone-400 before:content-['']"
                      >
                        {fix}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
