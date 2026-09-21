// Novel Creation 品牌 logo：圆底、墨滴与羽毛笔尖。
// 内联为组件，避免 Vite 静态资源/类型声明依赖；所有配色取自主题 token。
export function NovelCreationLogo({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 512 512" fill="none" className={className} role="img" aria-label="Novel Creation">
      <defs>
        <linearGradient id="novel-creation-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--nc-sunken)" />
          <stop offset="100%" stopColor="var(--nc-bg)" />
        </linearGradient>
        <linearGradient id="novel-creation-drop" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--nc-seal)" />
          <stop offset="100%" stopColor="var(--nc-block)" />
        </linearGradient>
        <linearGradient id="novel-creation-nib" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--nc-seal-soft)" />
          <stop offset="100%" stopColor="var(--nc-seal)" />
        </linearGradient>
        <filter id="novel-creation-glow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="256" cy="256" r="240" fill="url(#novel-creation-bg)" stroke="var(--nc-seal)" strokeWidth="2.5" opacity="0.95" />
      <circle cx="256" cy="256" r="210" fill="none" stroke="var(--nc-seal)" strokeWidth="1" strokeDasharray="8 8" opacity="0.25" />

      <path
        d="M256 120 C256 120, 340 230, 340 305 C340 352, 302 392, 256 392 C210 392, 172 352, 172 305 C172 230, 256 120, 256 120Z"
        fill="url(#novel-creation-drop)"
        filter="url(#novel-creation-glow)"
        opacity="0.9"
      />
      <path d="M256 180 L240 315 L256 345 L272 315 Z" fill="url(#novel-creation-nib)" opacity="0.85" />
      <line x1="256" y1="215" x2="256" y2="335" stroke="var(--nc-bg)" strokeWidth="1.5" opacity="0.4" />

      <circle cx="190" cy="240" r="3" fill="var(--nc-seal)" opacity="0.5" />
      <circle cx="322" cy="240" r="3" fill="var(--nc-seal)" opacity="0.5" />
      <circle cx="170" cy="325" r="3" fill="var(--nc-seal)" opacity="0.4" />
      <circle cx="342" cy="325" r="3" fill="var(--nc-seal)" opacity="0.4" />
    </svg>
  );
}
