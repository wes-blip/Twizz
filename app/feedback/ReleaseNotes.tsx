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
    version: "Chapter 1.1",
    date: "3/13/2026",
    title: "I love your feedback, keep it coming",
    founderNotes: [
      "Hello Twizzlers!",
      "I'm gonna try to do these updates frequently so I'll keep them shorter. First off, thanks for all the feedback! I got like 7 (useful) comments in a day. The award for most requested change goes to \"Why can't you make the number of nights and number of people work? Are you stupid?\"",
      "Thank you to all 4 of you who gave this feedback. You are the loud majority and I'm happy to announce that the bug has been fixed. We actually removed the number of nights function entirely. Now you get a start date and an end date for your arrival and departure! As for the number of people, you can just type in a number now - you're welcome. In my old supply chain job, my boss would've said \"glad we fixed it but what was the root cause?\" To which I would say, \"great question but i don't work for you anymore\"",
      "But in all seriousness the root cause for both those fields is that my little ai agent buddy that's helping me build this thought it would be a good idea for those number fields to be operated by a little dropdown instead of typing. Unfortunately on mobile the dropdown piece was invisible. I met with the ai agent that designed this and he has been warned that if he screws up like this again he will be gone - as he is totally replaceable with other ai agents.",
      "The second fix in this version was not a bug fix but a feature implementation. You will now see a timeline and map view. The timeline view is pretty self explanatory, but i simplified the view to ultimately function as a trip summary. Now the the 3 sections once you create a trip are builder (our og view), timeline (which is up and working), and map (which i'll build in the next couple of days hopefully).",
      "Other bigger things on deck are the fact that I want this to turn into a booking engine to truly be a powerful tool. This would incorporate not only a trip budget function but my north star is actually booking a full trip in the app. It's a tall order for someone with no app building experience but luckily my army of ai minions has not failed me thus far. Also for the record, the ai minions just help me build the site. The decision making and the writing of these updates will always be controlled by me.",
      "Go check out the new features, create a new test trip, and please keep the ideas coming!",
      "Wes",
    ],
    features: [],
    bugFixes: [],
  },
  {
    version: "Chapter 1.0",
    date: "3/11/2026",
    title: "It's alive!",
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
