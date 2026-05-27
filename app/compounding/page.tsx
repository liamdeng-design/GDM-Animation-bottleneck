'use client'

import { motion } from 'motion/react';
import { Sparkles, Hexagon, Brain, Share2, UserCircle, ArrowRight, Sparkle } from 'lucide-react';
import Link from 'next/link';

export default function CompoundingPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-purple-500/30 overflow-x-hidden">
      {/* Background radial gradients for depth */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/5 blur-[120px] rounded-full" />
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[20%] w-[60%] h-[40%] bg-purple-500/5 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto px-8 pt-20 pb-32">
        {/* Top Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start mb-24">
          {/* Left: Hero Text */}
          <div className="lg:col-span-5 pt-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="text-xs font-bold tracking-[0.2em] text-white/40 uppercase mb-8 flex items-center gap-3">
                <span>The Platform</span>
                <div className="w-8 h-px bg-white/20" />
                <span>Why it compounds</span>
              </div>
              <h1 className="text-6xl md:text-7xl font-bold tracking-tight mb-8 leading-[1.05]">
                One brain.<br />
                Every workflow.<br />
                Compounding.
              </h1>
              <p className="text-lg text-white/50 max-w-sm leading-relaxed">
                InstaBrain captures WWEX accounts, rules, and exceptions — and makes each workflow smarter over time.
              </p>
              
              <div className="mt-12">
                <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-purple-400 hover:text-purple-300 transition-colors group">
                  View Data Flow <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </motion.div>
          </div>

          {/* Right: AI Models */}
          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gemini Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-orange-500/5 rounded-[2rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative h-full p-8 rounded-[2rem] border border-orange-500/20 bg-orange-500/[0.02] backdrop-blur-sm flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.1)]">
                  <Sparkles size={24} />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-orange-500 mb-1 uppercase tracking-widest">Smart Thinking</div>
                  <h3 className="text-2xl font-bold mb-2">Gemini 3 Pro</h3>
                  <p className="text-xs text-white/40 font-medium tracking-wide">reasoning · validation · exceptions</p>
                </div>
              </div>
            </motion.div>

            {/* Gemma Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-emerald-500/5 rounded-[2rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative h-full p-8 rounded-[2rem] border border-emerald-500/20 bg-emerald-500/[0.02] backdrop-blur-sm flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                  <Hexagon size={24} />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-emerald-500 mb-1 uppercase tracking-widest">Fast Action</div>
                  <h3 className="text-2xl font-bold mb-2">Gemma</h3>
                  <p className="text-xs text-white/40 font-medium tracking-wide">classification · parsing · extraction</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Middle Section: InstaBrain */}
        <div className="relative mb-32 flex flex-col items-center">
          {/* SVG Connectors - Above */}
          <svg className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[80%] h-[80px] pointer-events-none overflow-visible opacity-30">
             <path d="M 0 0 C 0 40, 150 40, 320 80" className="stroke-orange-500/50 fill-none" strokeWidth="1" />
             <path d="M 640 0 C 640 40, 490 40, 320 80" className="stroke-emerald-500/50 fill-none" strokeWidth="1" />
          </svg>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="w-full max-w-3xl relative group"
          >
            <div className="absolute inset-0 bg-purple-500/10 rounded-[2.5rem] blur-3xl" />
            <div className="relative p-10 rounded-[2.5rem] border border-purple-500/30 bg-purple-500/[0.05] backdrop-blur-xl flex items-center gap-10">
              <div className="p-6 rounded-[2rem] bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Brain size={48} strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h2 className="text-4xl font-bold mb-1 tracking-tight">InstaBrain</h2>
                <div className="text-purple-400/80 font-semibold text-lg mb-4">Shared context layer</div>
                <div className="text-sm font-medium text-white/40 tracking-[0.1em] uppercase">
                  accounts · rules · exceptions · memory
                </div>
              </div>
            </div>
          </motion.div>
          
          <div className="mt-8 text-white/30 text-sm font-medium">Every correction trains the brain</div>
        </div>

        {/* Bottom Section: Use Cases */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* SVG Connectors - Below */}
          <svg className="absolute top-[-60px] left-1/2 -translate-x-1/2 w-full h-[60px] pointer-events-none overflow-visible opacity-20">
             <path d="M 420 0 C 420 30, 210 30, 210 60" className="stroke-purple-500 fill-none" strokeWidth="1" />
             <path d="M 640 0 L 640 60" className="stroke-purple-500 fill-none" strokeWidth="1" />
             <path d="M 860 0 C 860 30, 1070 30, 1070 60" className="stroke-purple-500 fill-none" strokeWidth="1" />
          </svg>

          {[
            { title: 'Case routing', sub: '180 min \u2192 3 min', icon: Share2, active: false },
            { title: 'Vendor routing', sub: '85 min \u2192 8 min', icon: Share2, active: false },
            { title: 'Account management', sub: 'The compound unlock', icon: UserCircle, active: true },
          ].map((node, i) => (
            <motion.div
              key={node.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 + (i * 0.1) }}
              className={`relative p-6 rounded-3xl border transition-all duration-500 flex items-center gap-5 ${
                node.active 
                ? 'border-purple-500/50 bg-purple-500/10 shadow-[0_0_30px_rgba(168,85,247,0.15)]' 
                : 'border-white/5 bg-white/[0.02] grayscale hover:grayscale-0 hover:border-white/10'
              }`}
            >
              <div className={`p-4 rounded-full border ${node.active ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-white/10 bg-white/5 text-white/40'}`}>
                <node.icon size={28} strokeWidth={1.5} />
              </div>
              <div>
                <h4 className={`text-lg font-bold ${node.active ? 'text-white' : 'text-white/70'}`}>{node.title}</h4>
                <p className={`text-sm ${node.active ? 'text-purple-400/80 font-medium' : 'text-white/30'}`}>{node.sub}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="mt-32 p-8 rounded-[2rem] border border-white/5 bg-white/[0.02] backdrop-blur-xl flex items-center justify-center gap-6"
        >
          <Sparkle className="text-blue-500 shrink-0" size={24} />
          <p className="text-lg md:text-xl font-medium text-white/70 text-center tracking-tight">
            Distributed signals unified. Judgment standardized. Hours of analyst time returned daily.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
