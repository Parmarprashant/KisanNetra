import { Link } from 'react-router-dom';

export default function SignIn() {
  return (
    <div className="w-full h-screen flex antialiased bg-surface text-on-surface font-body-md">
      
{/* Transactional Screen: Navigation Suppressed */}
<main className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
{/* Left Panel: Form (60%) */}
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
<h1 className="text-5xl font-bold text-on-surface mb-2 leading-tight">Welcome back</h1>
<p className="text-base text-on-surface-variant">Sign in to your Krishi Raksha account.</p>
</div>
{/* Form */}
<form className="flex-1 flex flex-col max-w-[480px] w-full">
<div className="flex flex-col gap-4 mb-6">
{/* Input: Phone/Email */}
<div className="flex flex-col gap-1">
<label className="text-sm font-medium text-on-surface" htmlFor="identifier">Phone Number or Email</label>
<div className="relative">
<input className="w-full h-[48px] bg-bg-sunken border border-border-default rounded-[10px] px-4 text-body-md text-on-surface placeholder:text-outline-variant focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none" id="identifier" name="identifier" placeholder="Enter your credentials" type="text"/>
</div>
</div>
{/* Input: Password */}
<div className="flex flex-col gap-1">
<label className="text-sm font-medium text-on-surface" htmlFor="password">Password</label>
<div className="relative flex items-center">
<input className="w-full h-[48px] bg-bg-sunken border border-border-default rounded-[10px] pl-4 pr-[48px] text-body-md text-on-surface placeholder:text-outline-variant focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none" id="password" name="password" placeholder="Enter password" type="password"/>
<button className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-outline hover:text-on-surface-variant transition-colors flex items-center justify-center" type="button">
<span className="material-symbols-outlined">visibility_off</span>
</button>
</div>
</div>
</div>
{/* Actions Row */}
<div className="flex items-center justify-between mb-8">
<label className="flex items-center gap-2 cursor-pointer group">
<div className="relative flex items-center justify-center w-[20px] h-[20px]">
<input className="peer appearance-none w-full h-full border border-border-default rounded-[4px] bg-bg-sunken checked:bg-primary checked:border-primary transition-colors cursor-pointer" type="checkbox"/>
<span className="material-symbols-outlined text-[16px] text-white absolute opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" >check</span>
</div>
<span className="text-base text-on-surface-variant group-hover:text-on-surface transition-colors">Remember me</span>
</label>
<Link className="text-sm font-medium text-primary hover:text-primary-container transition-colors" to="#">Forgot Password?</Link>
</div>
{/* Primary Action */}
<button className="w-full h-[48px] bg-primary-container text-white text-sm font-medium rounded-[8px] hover:bg-primary transition-all active:scale-[0.99] active:translate-y-[1px] shadow-sm shadow-primary-container/20 mb-6" type="submit">
                    Sign In
                </button>
{/* Divider */}
<div className="flex items-center gap-4 mb-6">
<div className="h-[1px] flex-1 bg-border-default"></div>
<span className="text-xs font-medium text-outline-variant uppercase tracking-wider">or continue with</span>
<div className="h-[1px] flex-1 bg-border-default"></div>
</div>
{/* Guest Mode */}
<button className="w-full h-[48px] bg-transparent border border-border-default text-on-surface text-sm font-medium rounded-[8px] hover:bg-surface-variant transition-all active:scale-[0.99] active:translate-y-[1px] flex items-center justify-center gap-2 relative group" type="button">
<span className="material-symbols-outlined text-[20px]">person_off</span>
                    Continue as Guest
                    
                    {/* Tooltip */}
<div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max px-4 py-2 bg-inverse-surface text-inverse-on-surface text-xs font-medium rounded-[8px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md">
                        3 free scans/day
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-inverse-surface"></div>
</div>
</button>
</form>
{/* Footer Elements */}
<div className="pt-2 flex flex-col gap-4 mt-8">
<p className="text-base text-center text-on-surface-variant">
                    New to Krishi Raksha? 
                    <Link className="text-primary font-bold hover:underline underline-offset-4 ml-1" to="/signup">Create an account</Link>
</p>
</div>
</main>
</div>
{/* Right Panel: Image (40%) */}
<div className="hidden md:block md:w-[40%] h-full relative bg-surface-container-highest overflow-hidden">
<img alt="" className="absolute inset-0 w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBuqims3zalPYrK5YvHU8RoYubBMlUmG2PBDg6J2I_WE-QuGabQv5XxXhcEJTcWiA2Zou1enivzACtroRaRmS5ww9aPhbRUWk1xgpPRHIoKuLXKb_O8f5stQLkcKcQxS76F22cP-mP2i50YtxcLtLEsOd4chF05qSRy0lHj-_3jVUXrM3i1HXxB592DotqrLTM3kJAQyDKLPY8oX_DtkW65jwpJiTbLSzgPiNmWBR84zHbUeZkonTH8Iw"/>
{/* Branding Overlay per PRD section 6 (Subtle tint/pattern) */}
<div className="absolute inset-0 bg-primary/20 mix-blend-multiply"></div>
<div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/80 via-transparent to-transparent"></div>
<div className="absolute bottom-0 left-0 p-8 w-full">
<div className="flex items-start gap-4 backdrop-blur-md bg-surface/10 border border-white/10 p-4 rounded-[16px]">
<span className="material-symbols-outlined text-white text-[32px] mt-1">verified</span>
<div>
<h3 className="text-2xl font-bold text-white mb-1">Grounded in Technology</h3>
<p className="text-base text-white/80">Empowering farmers with precision insights for a bountiful harvest.</p>
</div>
</div>
</div>
</div>
</main>

    </div>
  );
}
