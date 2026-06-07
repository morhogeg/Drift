import React, { useState, useEffect } from 'react';
import { ArrowRight, MessageCircle, Brain, Shield } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string) => void;
}

/**
 * Welcome screen. There is no server-side account system (conversations live in
 * this device's IndexedDB), so this is an honest one-tap entry — an optional name
 * for personalization, no password, no dead social buttons. The name is remembered
 * locally so returning visits land straight in.
 */
export function Login({ onLogin }: LoginProps) {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );

  useEffect(() => { setIsVisible(true); }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const enter = (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    // Brief beat for the entrance transition, then in you go.
    setTimeout(() => onLogin(name.trim() || 'Explorer'), 360);
  };

  // Literal class strings (Tailwind can't see interpolated names).
  const features = [
    { Icon: MessageCircle, glow: 'bg-violet-500/20', ring: 'border-violet-500/20', text: 'text-violet-400', title: 'Branching Drift', desc: 'Explore any idea deeper' },
    { Icon: Brain, glow: 'bg-pink-500/20', ring: 'border-pink-500/20', text: 'text-pink-400', title: 'Highlight to Drift', desc: 'Select text, branch instantly' },
    { Icon: Shield, glow: 'bg-cyan-500/20', ring: 'border-cyan-500/20', text: 'text-cyan-400', title: 'Context Aware', desc: 'Remembers your thread' },
  ];

  const EnterButton = (
    <button type="submit" disabled={isLoading} className="relative w-full group">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-500 to-violet-500 rounded-xl opacity-60 group-hover:opacity-100 blur transition duration-300" />
      <div className="relative bg-gradient-to-r from-pink-500 to-violet-500 rounded-xl py-4">
        {isLoading ? (
          <svg className="animate-spin h-5 w-5 text-white mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span className="text-white font-medium text-base">Enter Drift</span>
            <ArrowRight className="w-4 h-4 text-white/90" />
          </div>
        )}
      </div>
    </button>
  );

  return (
    <div className="min-h-screen relative bg-black flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900/50 via-black to-black" />
        <div className="absolute top-1/4 -left-1/4 w-[500px] h-[500px] bg-pink-500/[0.03] rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-violet-500/[0.03] rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(25)].map((_, i) => (
          <div
            key={i}
            className="absolute w-0.5 h-0.5 bg-white/20 rounded-full animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 15}s`,
              animationDuration: `${20 + Math.random() * 30}s`,
            }}
          />
        ))}
      </div>

      {/* Desktop */}
      {isDesktop && (
        <div className="hidden lg:flex relative z-10 w-full max-w-5xl mx-auto px-8 items-center justify-center">
          <div className="w-full grid lg:grid-cols-[1fr,440px] gap-16 items-center">
            {/* Feature column */}
            <div className={`hidden lg:block justify-self-end transition-all duration-1000 delay-200 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10'}`}>
              <div className="space-y-7 max-w-xs">
                {features.map(({ Icon, glow, ring, text, title, desc }) => (
                  <div key={title} className="flex items-center gap-4">
                    <div className="relative">
                      <div className={`absolute inset-0 ${glow} blur-xl rounded-full`} />
                      <div className={`relative p-2.5 bg-black/50 backdrop-blur-sm rounded-xl border ${ring}`}>
                        <Icon className={`w-5 h-5 ${text}`} />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-white font-medium">{title}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Center card */}
            <div className={`w-full transition-all duration-1000 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
              <div className="text-center mb-8">
                <div className="relative">
                  <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-white via-white to-white/80 bg-clip-text text-transparent">Drift</h1>
                  <div className="absolute -inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent -translate-y-1/2" />
                </div>
                <p className="text-base text-gray-400 mt-3">
                  Where conversations <span className="relative">
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-violet-400 font-medium">evolve naturally</span>
                    <span className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-pink-500/50 to-violet-500/50" />
                  </span>
                </p>
              </div>

              <div className="relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-500/0 via-violet-500/20 to-pink-500/0 rounded-2xl blur-xl" />
                <div className="relative bg-gray-900/30 backdrop-blur-xl border border-white/[0.05] rounded-2xl p-10">
                  <form onSubmit={enter} className="space-y-5">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-5 py-4 bg-white/[0.02] border border-white/[0.05] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/30 focus:bg-white/[0.03] transition-all text-base text-center"
                      placeholder="Your name (optional)"
                      disabled={isLoading}
                      autoFocus
                    />
                    {EnterButton}
                    <p className="text-center text-xs text-gray-600 leading-relaxed">
                      No account needed — your conversations stay on this device.
                    </p>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile */}
      {!isDesktop && (
        <div className="lg:hidden absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <h1 className="text-4xl font-bold text-white">Drift</h1>
              <p className="text-sm text-gray-400 mt-1.5">
                Where conversations <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-violet-400">evolve naturally</span>
              </p>
            </div>
            <div className="bg-gray-900/30 backdrop-blur-xl border border-white/[0.05] rounded-2xl p-6">
              <form onSubmit={enter} className="space-y-4">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3.5 bg-white/[0.02] border border-white/[0.05] rounded-xl text-white placeholder-gray-500 text-center focus:outline-none focus:border-violet-500/30"
                  placeholder="Your name (optional)"
                  disabled={isLoading}
                />
                {EnterButton}
                <p className="text-center text-xs text-gray-600 leading-relaxed">
                  No account needed — your conversations stay on this device.
                </p>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
