import { useEffect, useState } from 'react';
import type { EventSummary } from '../api/types';
import { FinalCta } from '../components/FinalCta';
import { Features } from '../components/Features';
import { Hero } from '../components/Hero';
import { ProPreview } from '../components/ProPreview';
import { RouteBoard } from '../components/RouteBoard';
import { SideRail } from '../components/SideRail';
import { useReducedMotion } from '../hooks/useMediaQuery';
import { useAppData } from '../state/AppData';
import { useDemoBoard } from '../state/useDemoBoard';

const LAST_EVENT_KEY = 'pp:last-event';

function readLastEvent(): string {
  try {
    return window.localStorage.getItem(LAST_EVENT_KEY) ?? 'death';
  } catch {
    return 'death';
  }
}

/** Brings the route board into view after a situation is chosen, unless it is already in sight. */
function scrollToBoard(reduced: boolean): void {
  const board = document.getElementById('route');
  if (!board) return;
  if (board.getBoundingClientRect().top > window.innerHeight * 0.5) {
    board.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }
}

/** `/`: the landing page with the live demo. The demo board runs on a real, persisted case. */
export function LandingPage() {
  const { events, error } = useAppData();
  const reduced = useReducedMotion();
  const [slug, setSlug] = useState<string>(readLastEvent);

  // Forget a remembered situation that no longer exists.
  useEffect(() => {
    const first = events?.[0];
    if (first && !events.some((e) => e.slug === slug)) setSlug(first.slug);
  }, [events, slug]);

  const known = events?.some((e) => e.slug === slug) ?? false;
  const demo = useDemoBoard(known ? slug : null);

  const choose = (event: EventSummary) => {
    setSlug(event.slug);
    try {
      window.localStorage.setItem(LAST_EVENT_KEY, event.slug);
    } catch {
      /* not remembered */
    }
    scrollToBoard(reduced);
  };

  return (
    <>
      <SideRail />
      <Hero events={events} currentSlug={known ? slug : null} onSelect={choose} />
      <RouteBoard
        board={demo}
        fallbackEvent={events?.find((e) => e.slug === slug) ?? null}
        variant="demo"
        fullPageHref={demo.session ? `/case/${demo.session.id}` : undefined}
        error={error ?? demo.createError}
      />
      <Features />
      <ProPreview />
      <FinalCta />
    </>
  );
}
