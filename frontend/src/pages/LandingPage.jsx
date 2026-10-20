import React, { useState, useEffect } from 'react';
import {
  Camera,
  Video,
  Smartphone,
  Users,
  Shield,
  AlertTriangle,
  ArrowRight,
  PhoneCall,
  FileText,
  Activity,
  Eye,
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  Menu,
  X,
  Radio,
  Building2,
  Train,
  Music,
  ShoppingBag,
  BellRing
} from 'lucide-react';

export default function LandingPage({ onGetStarted, onLogin }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const scrollToSection = (id) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-bgPrimary text-slate-200 font-inter selection:bg-accentCyan selection:text-bgPrimary relative overflow-x-hidden">
      {/* Background Cyber Grid */}
      <div className="fixed inset-0 cyber-grid opacity-20 pointer-events-none z-0" aria-hidden="true"></div>

      {/* ------------------------------------------------------------- */}
      {/* 1. STICKY HEADER                                              */}
      {/* ------------------------------------------------------------- */}
      <header className="sticky top-0 z-50 bg-bgSecondary/90 backdrop-blur-md border-b border-panelBorder transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Logo + Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })}>
            <div className="w-8 h-8 bg-gradient-to-br from-accentCyan to-accentBlue rounded-xl shadow-[0_0_15px_rgba(0,229,255,0.4)] flex items-center justify-center">
              <span className="w-2.5 h-2.5 bg-bgPrimary rounded-sm"></span>
            </div>
            <span className="font-outfit font-extrabold text-xl tracking-wider text-white">NEXORA</span>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-wider text-textMuted">
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              How it works
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('where-it-helps')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Where it helps
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={onLogin}
              className="px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-textMuted hover:text-white hover:bg-slate-900 border border-transparent hover:border-panelBorder transition-all cursor-pointer"
            >
              Log in
            </button>
            <button
              onClick={onGetStarted}
              className="bg-accentCyan hover:bg-cyan-400 text-bgPrimary font-extrabold px-5 py-2.5 rounded-lg text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(0,229,255,0.25)] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-textMuted hover:text-white focus:outline-none"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-bgSecondary border-b border-panelBorder px-4 pt-3 pb-6 flex flex-col gap-4">
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-left text-sm font-semibold text-textMuted hover:text-white py-1"
            >
              How it works
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="text-left text-sm font-semibold text-textMuted hover:text-white py-1"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('where-it-helps')}
              className="text-left text-sm font-semibold text-textMuted hover:text-white py-1"
            >
              Where it helps
            </button>
            <div className="pt-2 border-t border-panelBorder flex flex-col gap-2">
              <button
                onClick={onLogin}
                className="w-full text-center py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-textMuted border border-panelBorder hover:text-white hover:bg-slate-900 transition-all"
              >
                Log in
              </button>
              <button
                onClick={onGetStarted}
                className="w-full text-center py-2.5 rounded-lg text-xs font-extrabold uppercase tracking-wider bg-accentCyan text-bgPrimary hover:bg-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.2)] transition-all"
              >
                Get Started
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 2. HERO SECTION                                               */}
      {/* ------------------------------------------------------------- */}
      <section className="relative z-10 pt-12 pb-20 lg:pt-20 lg:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Left Copy Column (7 cols on lg) */}
            <div className="lg:col-span-7 flex flex-col gap-6 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accentCyan/10 border border-accentCyan/30 w-fit">
                <span className="w-2 h-2 rounded-full bg-accentCyan animate-pulse"></span>
                <span className="text-[11px] font-mono uppercase font-bold text-accentCyan tracking-wider">
                  Real-time safety system
                </span>
              </div>

              <h1 className="font-outfit font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.15]">
                See crowd risk coming, before it turns into an emergency.
              </h1>

              <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-2xl">
                NEXORA watches your cameras, spots when a place is getting dangerously crowded, tells you why, and shows your team who is closest to help.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={onGetStarted}
                  className="bg-accentCyan hover:bg-cyan-400 text-bgPrimary font-extrabold px-7 py-3.5 rounded-lg text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(0,229,255,0.3)] transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => scrollToSection('how-it-works')}
                  className="bg-bgSecondary hover:bg-slate-900 border border-panelBorder text-white font-bold px-6 py-3.5 rounded-lg text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer"
                >
                  See how it works
                </button>
              </div>

              {/* Small Note */}
              <div className="flex items-center gap-2 text-xs text-textMuted pt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-statusGreen"></div>
                <span>Works with security cameras, a plug-in webcam, or a phone.</span>
              </div>
            </div>

            {/* Right Interactive Sample Panel (5 cols on lg) */}
            <div className="lg:col-span-5 w-full">
              <div className="bg-bgSecondary border border-panelBorder rounded-2xl p-5 sm:p-6 shadow-[0_0_50px_rgba(15,23,42,0.8)] relative overflow-hidden flex flex-col gap-5">
                
                {/* Panel Top Bar */}
                <div className="flex items-center justify-between pb-3 border-b border-panelBorder">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-statusRed animate-ping"></span>
                    <span className="font-outfit font-bold text-white text-sm">Gate B Overview</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase bg-slate-900 text-textMuted px-2.5 py-1 rounded border border-panelBorder font-semibold">
                    Sample data
                  </span>
                </div>

                {/* Simulated Crowd Floor Visual */}
                <div className="relative w-full h-48 bg-bgPrimary rounded-xl border border-panelBorder overflow-hidden p-3 flex flex-col justify-between">
                  <div className="absolute inset-0 cyber-grid opacity-30 pointer-events-none"></div>

                  {/* Top labels */}
                  <div className="flex justify-between items-center z-10">
                    <span className="text-[10px] font-mono text-textMuted uppercase font-bold tracking-wider">Gate B Entrance</span>
                    <span className="text-[10px] font-mono text-statusRed bg-statusRed/10 border border-statusRed/30 px-2 py-0.5 rounded font-bold">
                      Blocked Exit C
                    </span>
                  </div>

                  {/* Visual Layout Markers & Animated Dots gathering near Exit C */}
                  <div className="relative w-full h-28 my-auto">
                    {/* Exit door marker */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-16 border-2 border-dashed border-statusRed/60 rounded flex items-center justify-center">
                      <span className="text-[8px] font-mono text-statusRed rotate-90 font-bold">EXIT C</span>
                    </div>

                    {/* Flow arrow marker */}
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted/40 text-[10px] font-mono">
                      → Flow →
                    </div>

                    {/* Crowd Dots */}
                    {/* Clustered crowded dots near Exit C */}
                    <div className={`absolute right-8 top-6 w-3 h-3 rounded-full bg-statusRed shadow-[0_0_8px_#ef4444] ${prefersReducedMotion ? '' : 'animate-pulse'}`}></div>
                    <div className={`absolute right-10 top-10 w-2.5 h-2.5 rounded-full bg-statusRed ${prefersReducedMotion ? '' : 'animate-ping'}`}></div>
                    <div className="absolute right-12 top-8 w-3 h-3 rounded-full bg-statusOrange shadow-[0_0_8px_#f97316]"></div>
                    <div className="absolute right-7 top-14 w-2.5 h-2.5 rounded-full bg-statusRed"></div>
                    <div className="absolute right-11 top-16 w-3 h-3 rounded-full bg-statusRed shadow-[0_0_8px_#ef4444]"></div>
                    <div className="absolute right-6 top-20 w-2.5 h-2.5 rounded-full bg-statusOrange"></div>
                    <div className="absolute right-14 top-12 w-2 h-2 rounded-full bg-statusRed"></div>
                    
                    {/* Middle dots moving toward exit */}
                    <div className={`absolute right-20 top-8 w-2.5 h-2.5 rounded-full bg-accentCyan shadow-[0_0_6px_#00e5ff] ${prefersReducedMotion ? '' : 'animate-bounce'}`}></div>
                    <div className="absolute right-24 top-14 w-2.5 h-2.5 rounded-full bg-accentCyan"></div>
                    <div className="absolute right-28 top-6 w-2.5 h-2.5 rounded-full bg-accentCyan"></div>
                    <div className="absolute right-22 top-18 w-2 h-2 rounded-full bg-statusYellow"></div>
                    <div className="absolute right-32 top-12 w-2.5 h-2.5 rounded-full bg-accentCyan"></div>

                    {/* Dispersed incoming dots */}
                    <div className="absolute left-16 top-10 w-2 h-2 rounded-full bg-accentCyan/70"></div>
                    <div className="absolute left-24 top-16 w-2 h-2 rounded-full bg-accentCyan/70"></div>
                    <div className="absolute left-10 top-18 w-2 h-2 rounded-full bg-accentCyan/60"></div>
                  </div>

                  {/* Floor footer label */}
                  <div className="flex justify-between items-center z-10 text-[10px] font-mono text-textMuted">
                    <span>Active observation: 42 people</span>
                    <span className="text-statusRed font-bold">Heavy clustering</span>
                  </div>
                </div>

                {/* Risk Score & Level Summary */}
                <div className="flex items-center justify-between bg-bgPrimary p-3 rounded-xl border border-panelBorder">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-textMuted font-bold block">Danger score</span>
                    <span className="font-outfit text-2xl font-black text-white">84 <span className="text-xs text-textMuted font-normal">/ 100</span></span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono uppercase text-textMuted font-bold block mb-1">Status rating</span>
                    <span className="px-2.5 py-1 rounded bg-statusRed/20 text-statusRed border border-statusRed/40 text-xs font-bold uppercase tracking-wider font-mono">
                      Critical
                    </span>
                  </div>
                </div>

                {/* "Why it is risky" Bars */}
                <div className="flex flex-col gap-2.5 bg-bgPrimary p-3.5 rounded-xl border border-panelBorder">
                  <span className="text-[11px] font-outfit uppercase font-bold text-white tracking-wider">Why it is risky</span>
                  
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Too many people packed together</span>
                      <span className="font-mono text-statusRed font-bold">+35%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-statusRed rounded-full" style={{ width: '70%' }}></div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Exit is jammed</span>
                      <span className="font-mono text-statusOrange font-bold">+18%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-statusOrange rounded-full" style={{ width: '45%' }}></div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">People moving in opposite directions</span>
                      <span className="font-mono text-statusYellow font-bold">+8%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-statusYellow rounded-full" style={{ width: '25%' }}></div>
                    </div>
                  </div>
                </div>

                {/* Warning Box */}
                <div className="bg-statusRed/10 border border-statusRed/30 rounded-xl p-3.5 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-statusRed">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="font-outfit font-bold text-xs uppercase tracking-wider">
                      Serious danger at Gate B
                    </span>
                  </div>
                  <ul className="text-xs text-slate-300 flex flex-col gap-1 pl-6 list-disc">
                    <li>Open Exit C</li>
                    <li>Stop new entry at Gate B</li>
                    <li>Call the closest staff member: <span className="text-white font-bold">Rahul, 120 m away</span></li>
                  </ul>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 3. "CROWDS TURN DANGEROUS FASTER THAN PEOPLE CAN REACT"      */}
      {/* ------------------------------------------------------------- */}
      <section className="relative z-10 py-16 bg-bgSecondary/50 border-y border-panelBorder">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-5">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="font-outfit font-extrabold text-2xl sm:text-3xl lg:text-4xl text-white tracking-tight mb-5">
            Crowds turn dangerous faster than people can react
          </h2>
          <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-3xl mx-auto">
            Today, someone has to watch many screens and notice trouble by eye. By the time a crowd looks dangerous, it is often too late to act. NEXORA watches for you and warns you earlier, so your team can step in while there is still time.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 4. HOW NEXORA WORKS (6 STEPS)                                  */}
      {/* ------------------------------------------------------------- */}
      <section id="how-it-works" className="relative z-10 py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-accentCyan font-mono text-xs uppercase tracking-widest font-bold block mb-2">
              Simple 6-step process
            </span>
            <h2 className="font-outfit font-extrabold text-3xl sm:text-4xl text-white tracking-tight">
              How NEXORA works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-4 relative group hover:border-accentCyan/50 transition-all">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <Camera className="w-5 h-5" />
                </div>
                <span className="text-2xl font-outfit font-black text-slate-700 group-hover:text-accentCyan/40 transition-colors">01</span>
              </div>
              <h3 className="font-outfit font-bold text-lg text-white">Cameras watch</h3>
              <p className="text-textMuted text-sm leading-relaxed">
                Your security cameras, a webcam or a phone send live video.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-4 relative group hover:border-accentCyan/50 transition-all">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <Users className="w-5 h-5" />
                </div>
                <span className="text-2xl font-outfit font-black text-slate-700 group-hover:text-accentCyan/40 transition-colors">02</span>
              </div>
              <h3 className="font-outfit font-bold text-lg text-white">People are counted</h3>
              <p className="text-textMuted text-sm leading-relaxed">
                NEXORA spots every person in the picture and follows them as they move.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-4 relative group hover:border-accentCyan/50 transition-all">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <Activity className="w-5 h-5" />
                </div>
                <span className="text-2xl font-outfit font-black text-slate-700 group-hover:text-accentCyan/40 transition-colors">03</span>
              </div>
              <h3 className="font-outfit font-bold text-lg text-white">Crowding is measured</h3>
              <p className="text-textMuted text-sm leading-relaxed">
                It checks how many people are in each area and how fast they are moving.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-4 relative group hover:border-accentCyan/50 transition-all">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <Shield className="w-5 h-5" />
                </div>
                <span className="text-2xl font-outfit font-black text-slate-700 group-hover:text-accentCyan/40 transition-colors">04</span>
              </div>
              <h3 className="font-outfit font-bold text-lg text-white">Danger is rated</h3>
              <p className="text-textMuted text-sm leading-relaxed">
                Each area gets a rating from Safe to Critical.
              </p>
            </div>

            {/* Step 5 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-4 relative group hover:border-accentCyan/50 transition-all">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <Eye className="w-5 h-5" />
                </div>
                <span className="text-2xl font-outfit font-black text-slate-700 group-hover:text-accentCyan/40 transition-colors">05</span>
              </div>
              <h3 className="font-outfit font-bold text-lg text-white">You see why</h3>
              <p className="text-textMuted text-sm leading-relaxed">
                Every rating comes with plain reasons, like a blocked exit.
              </p>
            </div>

            {/* Step 6 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-4 relative group hover:border-accentCyan/50 transition-all">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <span className="text-2xl font-outfit font-black text-slate-700 group-hover:text-accentCyan/40 transition-colors">06</span>
              </div>
              <h3 className="font-outfit font-bold text-lg text-white">Help is sent</h3>
              <p className="text-textMuted text-sm leading-relaxed">
                Warnings go out and the closest free staff are called first.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 5. WHAT YOU GET                                               */}
      {/* ------------------------------------------------------------- */}
      <section id="features" className="relative z-10 py-20 bg-bgSecondary/30 border-y border-panelBorder">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-accentCyan font-mono text-xs uppercase tracking-widest font-bold block mb-2">
              Clear protection tools
            </span>
            <h2 className="font-outfit font-extrabold text-3xl sm:text-4xl text-white tracking-tight">
              What you get
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left: "Risk levels" card (4 cols on lg) */}
            <div className="lg:col-span-4 bg-bgSecondary border border-panelBorder rounded-2xl p-6 shadow-xl flex flex-col gap-5 sticky top-24">
              <div className="flex items-center justify-between pb-3 border-b border-panelBorder">
                <h3 className="font-outfit font-extrabold text-xl text-white">Risk levels</h3>
                <span className="text-[10px] font-mono uppercase bg-slate-900 text-accentCyan px-2 py-0.5 rounded border border-panelBorder font-semibold">
                  Standard Scale
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {/* Safe */}
                <div className="p-3 rounded-xl bg-bgPrimary border border-panelBorder flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-statusGreen"></span>
                      <span className="font-outfit font-bold text-sm text-white">Safe</span>
                      <span className="text-[11px] font-mono text-textMuted">0–25</span>
                    </div>
                    <p className="text-xs text-textMuted mt-1">Keep watching</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-statusGreen bg-statusGreen/10 px-2 py-1 rounded">
                    Normal
                  </span>
                </div>

                {/* Moderate */}
                <div className="p-3 rounded-xl bg-bgPrimary border border-panelBorder flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-statusYellow"></span>
                      <span className="font-outfit font-bold text-sm text-white">Moderate</span>
                      <span className="text-[11px] font-mono text-textMuted">26–50</span>
                    </div>
                    <p className="text-xs text-textMuted mt-1">Stay alert</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-statusYellow bg-statusYellow/10 px-2 py-1 rounded">
                    Notice
                  </span>
                </div>

                {/* High */}
                <div className="p-3 rounded-xl bg-bgPrimary border border-panelBorder flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-statusOrange"></span>
                      <span className="font-outfit font-bold text-sm text-white">High</span>
                      <span className="text-[11px] font-mono text-textMuted">51–75</span>
                    </div>
                    <p className="text-xs text-textMuted mt-1">Tell security</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-statusOrange bg-statusOrange/10 px-2 py-1 rounded">
                    Action
                  </span>
                </div>

                {/* Critical */}
                <div className="p-3 rounded-xl bg-bgPrimary border border-panelBorder flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-statusRed"></span>
                      <span className="font-outfit font-bold text-sm text-white">Critical</span>
                      <span className="text-[11px] font-mono text-textMuted">76–100</span>
                    </div>
                    <p className="text-xs text-textMuted mt-1">Raise the alarm</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-statusRed bg-statusRed/10 px-2 py-1 rounded">
                    Urgent
                  </span>
                </div>
              </div>

              {/* Note */}
              <div className="p-3 rounded-xl bg-accentCyan/5 border border-accentCyan/20 text-xs text-slate-300 leading-relaxed">
                <span className="text-accentCyan font-bold">Note: </span>
                Every High and Critical warning comes with the reasons behind it.
              </div>
            </div>

            {/* Right: List of 6 features (8 cols on lg) */}
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Feature 1 */}
              <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-3">
                <div className="w-9 h-9 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <Users className="w-4 h-4" />
                </div>
                <h4 className="font-outfit font-bold text-base text-white">Live people counting</h4>
                <p className="text-sm text-textMuted leading-relaxed">
                  NEXORA sees and follows every person on camera as it happens, using the cameras you already have.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-3">
                <div className="w-9 h-9 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <Compass className="w-4 h-4" />
                </div>
                <h4 className="font-outfit font-bold text-base text-white">Crowd map</h4>
                <p className="text-sm text-textMuted leading-relaxed">
                  See where people are gathering and how packed each area is, on a simple map.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-3">
                <div className="w-9 h-9 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <Eye className="w-4 h-4" />
                </div>
                <h4 className="font-outfit font-bold text-base text-white">Danger with reasons</h4>
                <p className="text-sm text-textMuted leading-relaxed">
                  Every warning explains itself, so your staff know what to fix instead of guessing.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-3">
                <div className="w-9 h-9 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <BellRing className="w-4 h-4" />
                </div>
                <h4 className="font-outfit font-bold text-base text-white">Warnings that stay current</h4>
                <p className="text-sm text-textMuted leading-relaxed">
                  Warnings appear on their own as the crowd changes. Staff can also raise one by hand and mark it as seen, and NEXORA records who did it and when.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-3">
                <div className="w-9 h-9 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <PhoneCall className="w-4 h-4" />
                </div>
                <h4 className="font-outfit font-bold text-base text-white">Emergency response</h4>
                <p className="text-sm text-textMuted leading-relaxed">
                  Keep a list of your staff, find who is closest to the problem, and place an automatic phone call to them.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-3">
                <div className="w-9 h-9 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                  <FileText className="w-4 h-4" />
                </div>
                <h4 className="font-outfit font-bold text-base text-white">Reports</h4>
                <p className="text-sm text-textMuted leading-relaxed">
                  Hourly, daily and weekly summaries of how busy your venue was and what went wrong, ready to print or save.
                </p>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 6. "USE THE CAMERAS YOU ALREADY HAVE"                         */}
      {/* ------------------------------------------------------------- */}
      <section className="relative z-10 py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-accentCyan font-mono text-xs uppercase tracking-widest font-bold block mb-2">
              Zero new hardware needed
            </span>
            <h2 className="font-outfit font-extrabold text-3xl sm:text-4xl text-white tracking-tight">
              Use the cameras you already have
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-2xl p-7 flex flex-col gap-4 text-center items-center hover:border-accentCyan/40 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan shadow-[0_0_20px_rgba(0,229,255,0.15)]">
                <Camera className="w-7 h-7" />
              </div>
              <h3 className="font-outfit font-bold text-xl text-white">Security cameras</h3>
              <p className="text-sm text-textMuted leading-relaxed">
                Connect the cameras already installed at your venue.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-2xl p-7 flex flex-col gap-4 text-center items-center hover:border-accentCyan/40 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan shadow-[0_0_20px_rgba(0,229,255,0.15)]">
                <Video className="w-7 h-7" />
              </div>
              <h3 className="font-outfit font-bold text-xl text-white">Webcam</h3>
              <p className="text-sm text-textMuted leading-relaxed">
                Plug in a camera with a cable and start straight away.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-2xl p-7 flex flex-col gap-4 text-center items-center hover:border-accentCyan/40 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan shadow-[0_0_20px_rgba(0,229,255,0.15)]">
                <Smartphone className="w-7 h-7" />
              </div>
              <h3 className="font-outfit font-bold text-xl text-white">Phone camera</h3>
              <p className="text-sm text-textMuted leading-relaxed">
                Turn a phone into a camera with a camera app.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 7. "WHERE NEXORA HELPS"                                       */}
      {/* ------------------------------------------------------------- */}
      <section id="where-it-helps" className="relative z-10 py-20 bg-bgSecondary/30 border-y border-panelBorder">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-accentCyan font-mono text-xs uppercase tracking-widest font-bold block mb-2">
              Everyday safety everywhere
            </span>
            <h2 className="font-outfit font-extrabold text-3xl sm:text-4xl text-white tracking-tight">
              Where NEXORA helps
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                <Music className="w-5 h-5" />
              </div>
              <h3 className="font-outfit font-bold text-base text-white">Stadiums and concerts</h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Spot crowding at gates and exits before a rush starts.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                <Train className="w-5 h-5" />
              </div>
              <h3 className="font-outfit font-bold text-base text-white">Stations and airports</h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Keep platforms and corridors moving safely at busy hours.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                <Radio className="w-5 h-5" />
              </div>
              <h3 className="font-outfit font-bold text-base text-white">Festivals and religious gatherings</h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Watch very large crowds in many places at once.
              </p>
            </div>

            {/* Card 4 */}
            <div className="bg-bgSecondary border border-panelBorder rounded-xl p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-accentCyan/10 border border-accentCyan/30 flex items-center justify-center text-accentCyan">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <h3 className="font-outfit font-bold text-base text-white">Malls and campuses</h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Look after everyday visitors in busy shared spaces.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 8. CLOSING BANNER & FOOTER                                    */}
      {/* ------------------------------------------------------------- */}
      <section className="relative z-10 py-20 lg:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-b from-bgSecondary to-[#080d1e] border border-panelBorder rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden shadow-[0_0_50px_rgba(0,229,255,0.1)] flex flex-col items-center gap-6">
            
            <div className="w-12 h-12 bg-gradient-to-br from-accentCyan to-accentBlue rounded-2xl shadow-[0_0_20px_rgba(0,229,255,0.4)] flex items-center justify-center mb-1">
              <Shield className="w-6 h-6 text-bgPrimary" />
            </div>

            <h2 className="font-outfit font-black text-3xl sm:text-4xl text-white tracking-tight">
              Start watching your venue
            </h2>

            <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              Create an account, confirm your email and connect your first camera.
            </p>

            <button
              onClick={onGetStarted}
              className="bg-accentCyan hover:bg-cyan-400 text-bgPrimary font-extrabold px-8 py-4 rounded-xl text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(0,229,255,0.35)] transition-all cursor-pointer flex items-center gap-2 mt-2"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-panelBorder bg-bgSecondary pt-14 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12">
            {/* Left: Logo + NEXORA + Line */}
            <div className="md:col-span-2 flex flex-col gap-4">
              <div
                className="flex items-center gap-3 cursor-pointer inline-flex"
                onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })}
              >
                <div className="w-8 h-8 bg-gradient-to-br from-accentCyan to-accentBlue rounded-xl shadow-[0_0_15px_rgba(0,229,255,0.4)] flex items-center justify-center">
                  <span className="w-2.5 h-2.5 bg-bgPrimary rounded-sm"></span>
                </div>
                <span className="font-outfit font-extrabold text-xl tracking-wider text-white">NEXORA</span>
              </div>
              <p className="text-sm text-textMuted max-w-sm leading-relaxed">
                Warns you before a crowd becomes dangerous.
              </p>
            </div>

            {/* Column "Explore" */}
            <div className="flex flex-col gap-3">
              <h4 className="font-outfit font-bold text-xs uppercase tracking-wider text-white">
                Explore
              </h4>
              <ul className="flex flex-col gap-2.5 text-sm text-textMuted">
                <li>
                  <button
                    onClick={() => scrollToSection('how-it-works')}
                    className="hover:text-accentCyan transition-colors cursor-pointer text-left"
                  >
                    How it works
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('features')}
                    className="hover:text-accentCyan transition-colors cursor-pointer text-left"
                  >
                    What you get
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('where-it-helps')}
                    className="hover:text-accentCyan transition-colors cursor-pointer text-left"
                  >
                    Where it helps
                  </button>
                </li>
              </ul>
            </div>

            {/* Column "Get started" */}
            <div className="flex flex-col gap-3">
              <h4 className="font-outfit font-bold text-xs uppercase tracking-wider text-white">
                Get started
              </h4>
              <ul className="flex flex-col gap-2.5 text-sm text-textMuted">
                <li>
                  <button
                    onClick={onGetStarted}
                    className="hover:text-accentCyan transition-colors cursor-pointer text-left"
                  >
                    Get Started
                  </button>
                </li>
                <li>
                  <button
                    onClick={onLogin}
                    className="hover:text-accentCyan transition-colors cursor-pointer text-left"
                  >
                    Log in
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar with a thin divider */}
          <div className="border-t border-panelBorder pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-textMuted">
            <p>
              &copy; 2026 NEXORA. All rights reserved.
            </p>
            <p>
              Built to keep crowds safe.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
