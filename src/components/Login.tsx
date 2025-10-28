import React, { useState, useEffect } from 'react';
import { ArrowRight, MessageCircle, Brain, Shield } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }
    
    setIsLoading(true);
    setTimeout(() => {
      onLogin(username);
      setIsLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen relative bg-black flex items-center justify-center overflow-hidden">
      {/* Clean gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900/50 via-black to-black" />
        
        {/* Subtle animated orbs */}
        <div className="absolute top-1/4 -left-1/4 w-[500px] h-[500px] bg-pink-500/[0.03] rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-violet-500/[0.03] rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Floating stars - back but refined */}
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

      {/* Main container with better layout */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-8 flex items-center justify-center">
        <div className="w-full grid lg:grid-cols-[1fr,480px,1fr] gap-16 items-center">
          
          {/* Left side - Core capabilities */}
          <div className={`hidden lg:block justify-self-end transition-all duration-1000 delay-200 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10'}`}>
            <div className="space-y-6 max-w-xs">
              <div className="group">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-full" />
                    <div className="relative p-2.5 bg-black/50 backdrop-blur-sm rounded-xl border border-violet-500/20">
                      <MessageCircle className="w-5 h-5 text-violet-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Branching Drift</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Explore any idea deeper</p>
                  </div>
                </div>
              </div>
              
              <div className="group">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-pink-500/20 blur-xl rounded-full" />
                    <div className="relative p-2.5 bg-black/50 backdrop-blur-sm rounded-xl border border-pink-500/20">
                      <Brain className="w-5 h-5 text-pink-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Text Selection</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Highlight to drift instantly</p>
                  </div>
                </div>
              </div>
              
              <div className="group">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full" />
                    <div className="relative p-2.5 bg-black/50 backdrop-blur-sm rounded-xl border border-cyan-500/20">
                      <Shield className="w-5 h-5 text-cyan-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Context Aware</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Remembers everything</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Center - Login form with header */}
          <div className={`w-full transition-all duration-1000 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
            {/* Header above form */}
            <div className="text-center mb-8">
              <div className="relative">
                <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-white via-white to-white/80 bg-clip-text text-transparent">
                  Drift
                </h1>
                <div className="absolute -inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent -translate-y-1/2" />
              </div>
              
              <p className="text-base text-gray-400 mt-3">
                Where conversations <span className="relative">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-violet-400 font-medium">evolve naturally</span>
                  <span className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-pink-500/50 to-violet-500/50" />
                </span>
              </p>
            </div>

            {/* Modern card design */}
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-500/0 via-violet-500/20 to-pink-500/0 rounded-2xl blur-xl" />
              <div className="relative bg-gray-900/30 backdrop-blur-xl border border-white/[0.05] rounded-2xl p-10">

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-5 py-4 bg-white/[0.02] border border-white/[0.05] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/30 focus:bg-white/[0.03] transition-all text-base"
                      placeholder="Username"
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>

                  <div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-5 py-4 bg-white/[0.02] border border-white/[0.05] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/30 focus:bg-white/[0.03] transition-all text-base"
                      placeholder="Password"
                      disabled={isLoading}
                    />
                  </div>

                  {error && (
                    <div className="text-center">
                      <p className="text-red-400/70 text-sm">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="relative w-full group"
                  >
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

                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="rounded-sm border-gray-700 bg-white/5 text-violet-500 focus:ring-0" />
                      <span className="text-gray-500">Remember me</span>
                    </label>
                    <a href="#" className="text-gray-500 hover:text-violet-400 transition-colors">
                      Forgot password?
                    </a>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/[0.05]" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-3 bg-gray-900/30 text-xs text-gray-600 uppercase tracking-wider">or</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="py-3 bg-white/[0.02] border border-white/[0.05] rounded-xl text-gray-400 text-sm hover:bg-white/[0.03] hover:border-white/[0.08] transition-all"
                    >
                      Google
                    </button>
                    <button
                      type="button"
                      className="py-3 bg-white/[0.02] border border-white/[0.05] rounded-xl text-gray-400 text-sm hover:bg-white/[0.03] hover:border-white/[0.08] transition-all"
                    >
                      GitHub
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setUsername('demo');
                      setPassword('demo');
                    }}
                    className="w-full py-1.5 text-xs text-gray-600 hover:text-gray-500 transition-colors"
                  >
                    Quick demo access
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Right side - Unique features */}
          <div className={`hidden lg:block transition-all duration-1000 delay-200 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10'}`}>
            <div className="space-y-6 max-w-xs">
              <div className="group">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full" />
                    <div className="relative p-2.5 bg-black/50 backdrop-blur-sm rounded-xl border border-purple-500/20">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Snippet Gallery</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Save brilliant moments</p>
                  </div>
                </div>
              </div>
              
              <div className="group">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full" />
                    <div className="relative p-2.5 bg-black/50 backdrop-blur-sm rounded-xl border border-amber-500/20">
                      <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Push to Main</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Merge drift discoveries</p>
                  </div>
                </div>
              </div>
              
              <div className="group">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full" />
                    <div className="relative p-2.5 bg-black/50 backdrop-blur-sm rounded-xl border border-emerald-500/20">
                      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Conversation Tree</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Navigate your branches</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Mobile version */}
      <div className="lg:hidden absolute inset-0 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white">Drift</h1>
            <p className="text-xs text-gray-400 mt-1">
              Where conversations <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-violet-400">evolve naturally</span>
            </p>
          </div>

          <div className="bg-gray-900/30 backdrop-blur-xl border border-white/[0.05] rounded-2xl p-6">
            <p className="text-sm text-gray-400 text-center mb-6">
              Where conversations evolve naturally
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.05] rounded-xl text-white placeholder-gray-500"
                placeholder="Username"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.05] rounded-xl text-white placeholder-gray-500"
                placeholder="Password"
              />
              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}
              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-pink-500 to-violet-500 text-white font-medium rounded-xl"
              >
                Enter Drift
              </button>
              <button
                type="button"
                onClick={() => {
                  setUsername('demo');
                  setPassword('demo');
                }}
                className="w-full py-1.5 text-xs text-gray-600"
              >
                Quick demo
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
