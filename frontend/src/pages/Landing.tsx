
export default function Landing() {
  return (
    <div className="w-full overflow-x-hidden">
      {/* STITCH UI LANDING PAGE */}

      {/* Top Navigation (Shared Component) */}
      <nav className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-md border-b border-border-default shadow-xs h-20 transition-all duration-300" id="main-nav">
        <div className="flex justify-between items-center h-20 px-6 max-w-7xl mx-auto">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
            <span className="text-4xl font-bold text-display-lg font-bold text-primary tracking-tight" style={{ fontSize: 24, lineHeight: 28 }}>Krishi Raksha</span>
          </div>
          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-6">
            <a className="text-lg font-medium text-lg text-on-surface-variant hover:text-primary transition-colors py-2" href="#how-it-works">How It Works</a>
            <a className="text-lg font-medium text-lg text-on-surface-variant hover:text-primary transition-colors py-2" href="#features">Features</a>
            <a className="text-lg font-medium text-lg text-on-surface-variant hover:text-primary transition-colors py-2" href="#technology">Technology</a>
            <a className="text-lg font-medium text-lg text-on-surface-variant hover:text-primary transition-colors py-2" href="#pricing">Pricing</a>
            <a className="text-lg font-medium text-lg text-on-surface-variant hover:text-primary transition-colors py-2" href="#about">About</a>
          </div>
          {/* Actions */}
          <div className="hidden md:flex items-center gap-4">
            <button className="flex items-center gap-1 text-lg font-medium text-lg text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[18px]">language</span>
              Language
            </button>
            <Link className="text-lg font-medium text-lg text-primary hover:text-primary-container transition-colors font-semibold" to="/signin">Sign In</Link>
            <Link className="bg-primary-container text-on-primary text-lg font-medium text-lg px-4 py-2 rounded-lg shadow-brand btn-interact transition-all hover:bg-surface-tint" to="/signup">
              Get Started
            </Link>
          </div>
          {/* Mobile Menu Toggle */}
          <button className="md:hidden text-on-surface p-2">
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>
      </nav>
      {/* Hero Section */}
      <section className="pt-[120px] pb-2xl md:pt-[160px] md:pb-[100px] px-6 max-w-7xl mx-auto relative">
        <div className="absolute inset-0 bg-pattern opacity-50 pointer-events-none -z-10"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[64px] items-center">
          {/* Hero Left */}
          <div className="flex flex-col items-start gap-4">
            <div className="inline-flex items-center gap-1 px-3 py-1 bg-brand-50 border border-primary-fixed rounded-full">
              <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              <span className="text-sm font-medium text-sm text-primary uppercase tracking-wider">AI-Powered Agritech</span>
            </div>
            <h1 className="text-6xl font-bold text-[48px] md:text-[72px] leading-[1.1] tracking-tight text-on-surface">
              Your crops speak.<br />
              <span className="text-primary">We translate.</span>
            </h1>
            <p className="text-base text-[18px] md:text-[20px] text-on-surface-variant max-w-lg leading-relaxed mt-2">
              Empowering India's farmers with precision AI to detect diseases instantly, offline, and accurately. Protect your yield before the damage is done.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-6">
              <button className="bg-primary-container text-on-primary text-lg font-medium text-[16px] px-6 py-3 rounded-lg shadow-brand btn-interact transition-all hover:bg-surface-tint flex items-center gap-2">
                <span className="material-symbols-outlined">center_focus_strong</span>
                Scan a Crop Now
              </button>
              <button className="border border-border-default bg-bg-raised text-on-surface text-lg font-medium text-[16px] px-6 py-3 rounded-lg shadow-xs btn-interact transition-all hover:border-outline">
                View Demo
              </button>
            </div>
            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-6 mt-8 pt-lg border-t border-border-default w-full">
              <div>
                <p className="text-4xl font-bold text-[32px] text-primary font-bold">92%</p>
                <p className="text-sm font-medium text-sm text-on-surface-variant uppercase">Accuracy</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-[32px] text-primary font-bold">&lt;1s</p>
                <p className="text-sm font-medium text-sm text-on-surface-variant uppercase">Analysis Time</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-[32px] text-primary font-bold">0</p>
                <p className="text-sm font-medium text-sm text-on-surface-variant uppercase">Internet Needed</p>
              </div>
            </div>
          </div>
          {/* Hero Right (Mockup) */}
          <div className="relative w-full h-[600px] flex justify-center items-center">
            {/* Decorative Blobs */}
            <div className="absolute w-[400px] h-[400px] bg-primary-fixed opacity-20 rounded-full blur-3xl -z-10 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute w-[300px] h-[300px] bg-secondary-fixed opacity-20 rounded-full blur-2xl -z-10 bottom-0 right-0"></div>
            {/* Phone Frame */}
            <div className="relative w-[300px] h-[600px] bg-surface-container-lowest rounded-[40px] shadow-modal border-[8px] border-surface-container-low overflow-hidden flex flex-col">
              {/* Phone Header */}
              <div className="h-12 bg-surface-container-lowest flex justify-between items-center px-4 border-b border-border-default z-10">
                <span className="text-sm font-medium text-sm text-on-surface">9:41</span>
                <div className="flex gap-1">
                  <span className="material-symbols-outlined text-[16px] text-on-surface">signal_cellular_alt</span>
                  <span className="material-symbols-outlined text-[16px] text-on-surface">wifi</span>
                  <span className="material-symbols-outlined text-[16px] text-on-surface">battery_full</span>
                </div>
              </div>
              {/* Scanner UI */}
              <div className="flex-1 relative bg-surface-dim overflow-hidden">
                {/* Simulated Camera View */}
                <div className="absolute inset-0 bg-cover bg-center" data-alt="Close up photograph of a diseased tomato leaf with dark spots, viewed through a mobile phone camera lens in a bright, outdoor agricultural setting. Soft, natural lighting. High resolution, macro photography style." style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAIEW7Ugt8ayjgJnUAYv799gsqW4lkf5hVBqtohj9geyXXeo3FdeeuZHBwcHH4QCYhpE1JORGmfbXkJ3SuRM0oQQMEqfRAzb6NMAMBGfhO2PpBsJzPUXaOzFqQ0zeN_6uPX8mxKCiCR22r_EdqAYrqSsvNLwTR4cZwiB6b3h-h8LCfWgv0y0a06A57IHoF8FMZtIL_UiKN8wu3CYh-5i0WYtc1ddH1foLmW7V20HXeeDAv_iJ9OP2VdFA')" }}></div>
                {/* Scanner Overlay */}
                <div className="absolute inset-0 flex flex-col">
                  <div className="flex-1 border-b-2 border-primary border-dashed relative">
                    <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-primary/30 to-transparent"></div>
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-primary shadow-[0_0_10px_rgba(45,106,53,0.8)] animate-pulse"></div>
                  </div>
                  <div className="flex-1 bg-black/40"></div>
                </div>
                {/* Corner Markers */}
                <div className="absolute top-1/4 left-8 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg"></div>
                <div className="absolute top-1/4 right-8 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg"></div>
                <div className="absolute bottom-1/4 left-8 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg"></div>
                <div className="absolute bottom-1/4 right-8 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg"></div>
                {/* Offline Badge */}
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-surface-container-lowest/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-2 shadow-md">
                  <div className="w-2 h-2 rounded-full bg-status-offline-dot"></div>
                  <span className="text-sm font-medium text-sm text-on-surface">Offline Mode</span>
                </div>
              </div>
              {/* Bottom Sheet (Analysis) */}
              <div className="h-[220px] bg-bg-raised rounded-t-[24px] shadow-[0_-4px_20px_rgba(0,0,0,0.1)] absolute bottom-0 w-full p-4 flex flex-col gap-3 z-20">
                <div className="w-10 h-1 bg-border-default rounded-full mx-auto mb-1"></div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-headline-h3 text-[20px] text-on-surface">Early Blight</h3>
                    <p className="text-base text-lg text-on-surface-variant">Solanum lycopersicum (Tomato)</p>
                  </div>
                  <div className="bg-error-container text-on-error-container px-2 py-1 rounded-md flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">warning</span>
                    <span className="text-sm font-medium text-sm">High Risk</span>
                  </div>
                </div>
                {/* Confidence Meter */}
                <div className="mt-2">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-sm text-on-surface-variant">AI Confidence</span>
                    <span className="text-sm font-medium text-sm text-primary font-bold">94%</span>
                  </div>
                  <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                    <div className="bg-primary h-full w-[94%] rounded-full"></div>
                  </div>
                </div>
                <button className="mt-auto bg-primary-container text-on-primary w-full py-3 rounded-lg text-lg font-medium text-lg shadow-brand">
                  View Treatment Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Problem Section */}
      <section className="py-24 bg-[#1A1410] text-white px-6 w-full">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">India's farmers lose 20-40% yield to preventable diseases.</h2>
            <p className="text-lg text-gray-300">The gap between noticing a problem and getting expert advice is too wide. Traditional methods are slow, and agricultural experts are scarce.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Pillar 1 */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-red-500 text-3xl">trending_down</span>
              </div>
              <h3 className="text-5xl font-bold text-white mb-2">40%</h3>
              <p className="text-base text-gray-300">Potential yield loss due to delayed disease identification and treatment.</p>
            </div>
            {/* Pillar 2 */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-orange-500 text-3xl">group_off</span>
              </div>
              <h3 className="text-5xl font-bold text-white mb-2">1:10k</h3>
              <p className="text-base text-gray-300">Ratio of extension officers to farmers, making personal visits nearly impossible.</p>
            </div>
            {/* Pillar 3 */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-yellow-500 text-3xl">timer</span>
              </div>
              <h3 className="text-5xl font-bold text-white mb-2">72 hrs</h3>
              <p className="text-base text-gray-300">Average time taken to get expert advice on a crop issue using traditional channels.</p>
            </div>
          </div>
        </div>
      </section>
      {/* Footer (Shared Component) */}
      <footer className="w-full py-16 bg-surface-container-low px-6 mt-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-7xl mx-auto">
          <div className="col-span-1 md:col-span-1 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
              <span className="text-5xl font-bold text-[24px] font-bold text-primary tracking-tight">Krishi Raksha</span>
            </div>
            <p className="text-base text-body-md text-on-surface-variant">
              Empowering farmers through organic precision. Built with love for India's farmers.
            </p>
            <div className="mt-auto">
              <p className="font-caption text-caption text-on-surface-variant">© 2024 Krishi Raksha.</p>
            </div>
          </div>
          <div className="col-span-1 flex flex-col gap-3">
            <h4 className="text-lg font-medium text-lg font-bold text-on-surface">Product</h4>
            <a className="text-base text-body-md text-on-surface-variant hover:underline decoration-primary transition-opacity hover:opacity-80" href="#">Features</a>
            <a className="text-base text-body-md text-on-surface-variant hover:underline decoration-primary transition-opacity hover:opacity-80" href="#">Pricing</a>
            <a className="text-base text-body-md text-on-surface-variant hover:underline decoration-primary transition-opacity hover:opacity-80" href="#">Technology</a>
          </div>
          <div className="col-span-1 flex flex-col gap-3">
            <h4 className="text-lg font-medium text-lg font-bold text-on-surface">Company</h4>
            <a className="text-base text-body-md text-on-surface-variant hover:underline decoration-primary transition-opacity hover:opacity-80" href="#">About Us</a>
            <a className="text-base text-body-md text-on-surface-variant hover:underline decoration-primary transition-opacity hover:opacity-80" href="#">Careers</a>
            <a className="text-base text-body-md text-on-surface-variant hover:underline decoration-primary transition-opacity hover:opacity-80" href="#">Contact Us</a>
          </div>
          <div className="col-span-1 flex flex-col gap-3">
            <h4 className="text-lg font-medium text-lg font-bold text-on-surface">Legal</h4>
            <a className="text-base text-body-md text-on-surface-variant hover:underline decoration-primary transition-opacity hover:opacity-80" href="#">Privacy Policy</a>
            <a className="text-base text-body-md text-on-surface-variant hover:underline decoration-primary transition-opacity hover:opacity-80" href="#">Terms of Service</a>
            <a className="text-base text-body-md text-on-surface-variant hover:underline decoration-primary transition-opacity hover:opacity-80" href="#">Support</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
