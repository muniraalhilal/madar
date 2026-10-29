'use client';
import { ArrowRight, BookOpen, Boxes, Cpu, FlaskConical, Gauge, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { PageHeader, Panel } from '@/components/app/ui';
import { DemoStorage } from '@/components/demo/DemoStorage';
import { REPO_URL } from '@/lib/site';

const TOUR = [
  { href: '/app', icon: Gauge, title: 'Read the dashboard', body: 'The sample study is already computed: a morning peak baseline, re-timed signals and a road closure.' },
  { href: '/app/explorer', icon: Boxes, title: 'Explore the city', body: 'Orbit the 3D city, click a road, junction or building, and play back every simulated vehicle.' },
  { href: '/app/scenarios', icon: FlaskConical, title: 'Change something and run it', body: 'Duplicate the baseline, close a road or re-time a signal, then run the simulation and watch it live.' },
  { href: '/app/results', icon: Gauge, title: 'Compare the outcome', body: 'Put any two runs side by side: metrics with units, maps, charts and the roads that changed most.' },
];

const SIMULATED = [
  'Traffic: the 07:00–08:00 morning peak (about 21,000 completed trips in the baseline) across 148 directed road links, 42 junctions and 28 signals, with signals, queues, spillback, closures, incidents and re-routing (mesoscopic link-queue model).',
  'Signal proposals: Webster’s method, computed from the flows of a run you choose.',
  'Fuel, CO₂ and idling: estimates derived from simulated speeds and stop time, with stated coefficients.',
  'Building energy: an hourly model of 96 synthetic buildings on a hot day; every figure is labelled as an estimate.',
];

const LIMITS = [
  'Madar is a fictional city. No real place, statistic or person is represented.',
  'The traffic model is simplified (no lane changes, one vehicle class, no pedestrians or transit). It is built for comparing scenarios under the same assumptions, not for predicting a real network.',
  'There are no accounts, sharing or server storage in the demo. Your work stays in this browser.',
  'Runs stop if you close or reload the tab while they are in progress; the run is then marked as interrupted.',
  'Playback frames are kept for your eight most recent runs to save space; summary results are kept for all runs.',
];

export default function HelpPage() {
  return (
    <>
      <PageHeader
        eyebrow="About the demo"
        title="What you can try in MADAR"
        description="MADAR is a digital twin of Madar, a fictional city. This demo is the full MADAR interface running on its own: the simulation engine computes every result in your browser, on synthetic data."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          <Panel title="Start here: a four-step tour">
            <ol className="space-y-2">
              {TOUR.map(({ href, icon: Icon, title, body }, i) => (
                <li key={href + title}>
                  <Link href={href} className="group flex items-start gap-4 rounded-xl border border-transparent px-3 py-3 hover:border-line-dark hover:bg-white/[0.03]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-lavender/40 text-sm text-lavender-soft">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-white"><Icon size={16} className="text-lavender-soft" aria-hidden="true" /> {title}</span>
                      <span className="mt-0.5 block text-sm text-sand/65">{body}</span>
                    </span>
                    <ArrowRight size={16} className="mt-2.5 shrink-0 text-sand/40 transition group-hover:translate-x-0.5 group-hover:text-white" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-2"><Cpu size={16} className="text-lavender-soft" /> What is simulated</span>}>
            <ul className="space-y-2.5 text-sm text-sand/80">{SIMULATED.map((t) => <li key={t} className="flex gap-2"><span className="text-lavender-soft">·</span><span>{t}</span></li>)}</ul>
            <p className="mt-4 text-xs text-sand/55">The sample study is computed the first time you open the demo, and every run you start is computed when you start it. Nothing is a recording. The engine is deterministic: the same inputs and seed always produce the same result fingerprint.</p>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title={<span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-lavender-soft" /> Limitations</span>}>
            <ul className="space-y-2.5 text-sm text-sand/80">{LIMITS.map((t) => <li key={t} className="flex gap-2"><span className="text-lavender-soft">·</span><span>{t}</span></li>)}</ul>
          </Panel>
          <Panel title="Your demo data">
            <DemoStorage compact />
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-2"><BookOpen size={16} className="text-lavender-soft" /> Documentation</span>}>
            <ul className="space-y-2 text-sm">
              {[
                ['Project overview and setup guide', `${REPO_URL}#readme`],
                ['Simulation model', `${REPO_URL}/blob/main/docs/simulation-model.md`],
                ['Architecture', `${REPO_URL}/blob/main/docs/architecture.md`],
                ['API reference (full application)', `${REPO_URL}/blob/main/docs/api.md`],
              ].map(([label, url]) => (
                <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="text-lavender-soft underline-offset-4 hover:underline">{label}</a></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-sand/55">The full application adds accounts, roles, a PostgreSQL + PostGIS database and a server-side simulation queue. It runs locally with the setup guide.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
