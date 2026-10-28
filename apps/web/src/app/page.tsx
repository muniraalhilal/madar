import { AfterSun } from '@/components/landing/AfterSun';
import { Connected } from '@/components/landing/Connected';
import { Engineering } from '@/components/landing/Engineering';
import { Enter } from '@/components/landing/Enter';
import { Footer } from '@/components/landing/Footer';
import { Hero } from '@/components/landing/Hero';
import { Movement } from '@/components/landing/Movement';
import { Nav } from '@/components/landing/Nav';
import { Ripple } from '@/components/landing/Ripple';
import { ScenarioLab } from '@/components/landing/ScenarioLab';

export default function Landing() {
  return (
    <>
      <a href="#connected" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Nav />
      <main>
        <Hero />
        <Connected />
        <Movement />
        <AfterSun />
        <Ripple />
        <ScenarioLab />
        <Engineering />
        <Enter />
      </main>
      <Footer />
    </>
  );
}
