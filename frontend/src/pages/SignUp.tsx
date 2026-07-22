import { Link } from 'react-router-dom';

export default function SignUp() {
  return (
    <div className="w-full h-screen flex antialiased bg-surface text-on-surface font-body-md">
      
{/* Left Panel (Form) - 60% on desktop */}
<div className="w-full lg:w-[60%] flex flex-col p-6 md:p-8 lg:p-12 overflow-y-auto no-scrollbar">
{/* Header (Logo & Language) */}
<header className="flex justify-between items-center mb-10 w-full max-w-2xl mx-auto">
<div className="flex items-center gap-2">
<div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white">
<span className="material-symbols-outlined fill">eco</span>
</div>
<span className="text-4xl font-bold text-2xl tracking-tight text-primary">Krishi Raksha</span>
</div>
<div className="flex items-center bg-surface-container rounded-full p-1 border border-border-default">
<button className="px-3 py-1 rounded-full bg-white shadow-xs text-primary text-xs font-medium">EN</button>
<button className="px-3 py-1 rounded-full text-on-surface-variant hover:text-primary text-xs font-medium transition-colors">हि</button>
<button className="px-3 py-1 rounded-full text-on-surface-variant hover:text-primary text-xs font-medium transition-colors">ગુ</button>
</div>
</header>
{/* Main Form Content */}
<main className="w-full max-w-2xl mx-auto flex-1 flex flex-col justify-center">
<div className="mb-8">
<h1 className="text-5xl font-bold text-4xl lg:text-5xl mb-3 text-on-surface">Create your Krishi Raksha account</h1>
<p className="text-base text-on-surface-variant text-lg">Join free. No credit card. For all farmers and field agents.</p>
</div>
<form action="#" className="space-y-6" method="POST">
{/* Personal Info */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
<div className="space-y-1">
<label className="text-xs font-medium text-on-surface-variant block" htmlFor="fullName">Full Name *</label>
<input id="fullName" name="fullName" placeholder="Rahul Sharma" required type="text"/>
</div>
<div className="space-y-1">
<label className="text-xs font-medium text-on-surface-variant block" htmlFor="phone">Phone Number *</label>
<div className="relative flex">
<span className="absolute inset-y-0 left-0 flex items-center pl-4 text-on-surface-variant text-base">+91</span>
<input className="pl-12" id="phone" name="phone" placeholder="98765 43210" required type="tel"/>
</div>
</div>
</div>
{/* Email (Optional) */}
<div className="space-y-1">
<label className="text-xs font-medium text-on-surface-variant flex items-center gap-1" htmlFor="email">
                        Email Address
                        <span className="text-outline text-[10px] uppercase tracking-wider bg-surface-variant px-1.5 py-0.5 rounded">Optional</span>
<div className="group relative inline-block ml-1 cursor-help">
<span className="material-symbols-outlined text-[16px]">info</span>
<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-inverse-surface text-inverse-on-surface text-xs font-medium text-xs rounded-lg shadow-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 text-center">
                                Required only for Admin or Agronomist roles for daily reports.
                            </div>
</div>
</label>
<input id="email" name="email" placeholder="rahul@example.com" type="email"/>
</div>
{/* Role Selection (2x2 Grid) */}
<div className="space-y-2">
<label className="text-xs font-medium text-on-surface-variant block">Select Your Role *</label>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
<label className="relative cursor-pointer group">
<input defaultChecked className="peer sr-only" name="role" type="radio" value="farmer"/>
<div className="role-card p-4 rounded-xl border border-border-default bg-white transition-all duration-200 hover:border-outline-variant flex items-start gap-3 h-full">
<div className="role-icon w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors shrink-0">
<span className="material-symbols-outlined">agriculture</span>
</div>
<div>
<div className="text-sm font-medium text-on-surface mb-0.5">Farmer</div>
<div className="font-caption text-on-surface-variant">Manage crops, get AI advice.</div>
</div>
</div>
</label>
<label className="relative cursor-pointer group">
<input className="peer sr-only" name="role" type="radio" value="extension_officer"/>
<div className="role-card p-4 rounded-xl border border-border-default bg-white transition-all duration-200 hover:border-outline-variant flex items-start gap-3 h-full">
<div className="role-icon w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors shrink-0">
<span className="material-symbols-outlined">badge</span>
</div>
<div>
<div className="text-sm font-medium text-on-surface mb-0.5">Extension Officer</div>
<div className="font-caption text-on-surface-variant">Assist farmers, track region health.</div>
</div>
</div>
</label>
<label className="relative cursor-pointer group">
<input className="peer sr-only" name="role" type="radio" value="agronomist"/>
<div className="role-card p-4 rounded-xl border border-border-default bg-white transition-all duration-200 hover:border-outline-variant flex items-start gap-3 h-full">
<div className="role-icon w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors shrink-0">
<span className="material-symbols-outlined">science</span>
</div>
<div>
<div className="text-sm font-medium text-on-surface mb-0.5">Agronomist</div>
<div className="font-caption text-on-surface-variant">Analyze data, provide expert input.</div>
</div>
</div>
</label>
<label className="relative cursor-pointer group">
<input className="peer sr-only" name="role" type="radio" value="admin"/>
<div className="role-card p-4 rounded-xl border border-border-default bg-white transition-all duration-200 hover:border-outline-variant flex items-start gap-3 h-full">
<div className="role-icon w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors shrink-0">
<span className="material-symbols-outlined">admin_panel_settings</span>
</div>
<div>
<div className="text-sm font-medium text-on-surface mb-0.5">Admin</div>
<div className="font-caption text-on-surface-variant">System oversight and user management.</div>
</div>
</div>
</label>
</div>
</div>
{/* Location */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
<div className="space-y-1 relative">
<label className="text-xs font-medium text-on-surface-variant block" htmlFor="state">State *</label>
<select className="appearance-none pr-10" id="state" name="state" required>
<option disabled defaultValue="true" value="">Select State</option>
<option value="gj">Gujarat</option>
<option value="mh">Maharashtra</option>
<option value="rj">Rajasthan</option>
</select>
<span className="material-symbols-outlined absolute right-3 top-[38px] text-on-surface-variant pointer-events-none">expand_more</span>
</div>
<div className="space-y-1 relative">
<label className="text-xs font-medium text-on-surface-variant block" htmlFor="district">District *</label>
<select className="appearance-none pr-10" disabled id="district" name="district" required>
<option disabled defaultValue="true" value="">Select District</option>
{/* Populated via JS */}
</select>
<span className="material-symbols-outlined absolute right-3 top-[38px] text-outline pointer-events-none">expand_more</span>
</div>
</div>
{/* Passwords */}
<div className="space-y-4">
<div className="space-y-1">
<label className="text-xs font-medium text-on-surface-variant block" htmlFor="password">Password *</label>
<div className="relative">
<input id="password" name="password" placeholder="Create a strong password" required type="password"/>
<button className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors p-1" id="togglePassword" type="button">
<span className="material-symbols-outlined text-[20px]" id="toggleIcon">visibility_off</span>
</button>
</div>
{/* Strength Meter */}
<div className="flex gap-1 mt-2 strength-container" id="strengthMeter">
<div className="strength-segment seg-1"></div>
<div className="strength-segment seg-2"></div>
<div className="strength-segment seg-3"></div>
<div className="strength-segment seg-4"></div>
</div>
<div className="font-caption text-on-surface-variant mt-1" id="strengthText">Password must be at least 8 characters</div>
</div>
<div className="space-y-1">
<label className="text-xs font-medium text-on-surface-variant block" htmlFor="confirmPassword">Confirm Password *</label>
<input id="confirmPassword" name="confirmPassword" placeholder="Confirm your password" required type="password"/>
</div>
</div>
{/* Submit & Links */}
<div className="pt-2 flex flex-col gap-4">
<button className="btn-primary w-full h-12" type="submit">
                        Create Account
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
</button>
<p className="text-base text-center text-on-surface-variant">
                        Already have an account? 
                        <Link className="text-primary font-bold hover:underline underline-offset-4" to="/signin">Sign In</Link>
</p>
</div>
{/* T&C */}
<p className="font-caption text-center text-outline mt-8 max-w-md mx-auto">
                    By clicking Create Account, you agree to our 
                    <Link className="underline hover:text-primary" to="#">Terms of Service</Link> and 
                    <Link className="underline hover:text-primary" to="#">Privacy Policy</Link>.
                </p>
</form>
</main>
</div>
{/* Right Panel (Image Overlay) - 40% on desktop */}
<div className="hidden lg:block lg:w-[40%] relative overflow-hidden bg-primary-fixed-dim">
<img className="absolute inset-0 w-full h-full object-cover" data-alt="A sweeping, golden-hour wide shot of an Indian agricultural landscape. Lush, mature wheat fields stretch towards distant, softly hazy mountains under a bright, warm sunrise. A worn dirt path winds through the crops. In the foreground, subtle translucent overlays of stylized green leaves and small, modern agricultural signage reading 'Agritech India' create a blend of organic nature and clean, modern technology." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBuqims3zalPYrK5YvHU8RoYubBMlUmG2PBDg6J2I_WE-QuGabQv5XxXhcEJTcWiA2Zou1enivzACtroRaRmS5ww9aPhbRUWk1xgpPRHIoKuLXKb_O8f5stQLkcKcQxS76F22cP-mP2i50YtxcLtLEsOd4chF05qSRy0lHj-_3jVUXrM3i1HXxB592DotqrLTM3kJAQyDKLPY8oX_DtkW65jwpJiTbLSzgPiNmWBR84zHbUeZkonTH8Iw"/>
{/* Branding Overlay (Gradient + Content) */}
<div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/40 to-transparent flex flex-col justify-end p-12">
<div className="glass-panel p-8 rounded-2xl max-w-md mb-8">
<div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-6">
<span className="material-symbols-outlined text-white text-[24px]">psychology</span>
</div>
<h2 className="text-4xl font-bold text-white text-3xl mb-4 leading-tight">AI-Powered<br/>Precision Farming</h2>
<p className="text-base text-white/80">
                    Krishi Raksha combines advanced satellite imagery and localized AI models to provide real-time crop health monitoring, ensuring sustainable and profitable harvests.
                </p>
</div>
</div>
</div>


    </div>
  );
}
